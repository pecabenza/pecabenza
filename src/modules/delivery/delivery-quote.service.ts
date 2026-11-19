import { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/observability/logger';
import { validateCartItems, getTenantCommerceSettings } from '@/modules/orders/orders.service';
import type { CartItemInput } from '@/modules/orders/orders.schema';
import {
  calculateSmartDeliveryQuote,
  computeCanonicalAddressHash,
  computeCanonicalCartHash,
  validateConfirmedCoordinates,
  type SmartDeliveryPricingConfig,
  type SmartDeliveryQuoteResult,
} from './delivery-pricing.engine';
import {
  DELIVERY_CACHE_POLICY,
  type GeocodeAddressInput,
  type GeocodeResult,
  type MapRoutingProvider,
} from './providers/map-routing.types';
import {
  calculateRouteWithCache,
  createMapRoutingProvider,
  geocodeAddressWithCache,
  isHighConfidenceGeocodePrecision,
} from './providers/map-routing.service';

export interface DeliverySimulationResult {
  eligible: boolean;
  ambiguousAddress: boolean;
  reason?: string;
  destinationFormattedAddress?: string;
  destinationPrecision?: GeocodeResult['precision'];
  destinationCoords?: { lat: number; lng: number };
  quote: SmartDeliveryQuoteResult;
}

export interface PersistedDeliveryQuoteResponse {
  quoteId: string | null;
  expiresAt: string | null;
  serverSubtotalCents: number;
  addressHash: string;
  cartHash: string;
  ambiguousAddress: boolean;
  destinationFormattedAddress?: string;
  destinationPrecision?: GeocodeResult['precision'];
  destinationCoords?: { lat: number; lng: number };
  quote: SmartDeliveryQuoteResult;
}

export function buildPricingConfigFromCommerceRow(
  row: Record<string, any>
): SmartDeliveryPricingConfig {
  return {
    pricingMode: row.pricing_mode || 'fixed',
    pricingRuleVersion: Number(row.pricing_rule_version || 1),
    originVerified: Boolean(row.origin_verified),
    originCity: row.origin_city || undefined,
    originState: row.origin_state || undefined,
    fixedDeliveryFeeCents: Number(row.fixed_delivery_fee_cents ?? 1200),
    baseDeliveryFeeCents: Number(row.base_delivery_fee_cents ?? 500),
    perKmFeeCents: Number(row.per_km_fee_cents ?? 150),
    minDeliveryFeeCents: Number(row.min_delivery_fee_cents ?? 600),
    maxDeliveryFeeCents: Number(row.max_delivery_fee_cents ?? 3000),
    maxDeliveryDistanceKm: Number(row.max_delivery_distance_km ?? 10),
    distanceRoundingMode: row.distance_rounding_mode || 'tenth_km',
    freeDeliveryThresholdCents:
      row.free_delivery_threshold_cents !== null && row.free_delivery_threshold_cents !== undefined
        ? Number(row.free_delivery_threshold_cents)
        : null,
    freeDeliveryMaxDistanceKm:
      row.free_delivery_max_distance_km !== null && row.free_delivery_max_distance_km !== undefined
        ? Number(row.free_delivery_max_distance_km)
        : null,
    maxDeliverySubsidyCents:
      row.max_delivery_subsidy_cents !== null && row.max_delivery_subsidy_cents !== undefined
        ? Number(row.max_delivery_subsidy_cents)
        : null,
    contingencyPolicy: row.contingency_policy || 'block_on_failure',
    neighborhoodRates: Array.isArray(row.neighborhood_rates) ? row.neighborhood_rates : undefined,
    distanceBands: Array.isArray(row.distance_bands) ? row.distance_bands : undefined,
  };
}

export class DeliveryQuoteService {
  /**
   * Geocodifica o endereço de origem do restaurante para confirmação explícita no admin.
   */
  static async geocodeStoreOrigin(
    address: GeocodeAddressInput,
    provider?: MapRoutingProvider
  ): Promise<GeocodeResult & { isHighConfidence: boolean }> {
    const activeProvider = provider || createMapRoutingProvider();
    const { result } = await geocodeAddressWithCache(activeProvider, address);
    return {
      ...result,
      isHighConfidence: isHighConfidenceGeocodePrecision(result.precision),
    };
  }

  /**
   * Simulação administrativa sem persistência, sem pedidos e sem cobranças.
   */
  static async simulateAdminQuote(params: {
    origin: { lat: number; lng: number };
    destination: GeocodeAddressInput;
    confirmedPin?: { lat: number; lng: number } | null;
    simulatedSubtotalCents: number;
    config: SmartDeliveryPricingConfig;
    surchargeCents?: number;
    provider?: MapRoutingProvider;
  }): Promise<DeliverySimulationResult> {
    const activeProvider = params.provider || createMapRoutingProvider();

    let destCoords: { lat: number; lng: number } | null = null;
    let destFormattedAddress: string | undefined;
    let destPrecision: GeocodeResult['precision'] | undefined;

    if (params.confirmedPin) {
      const pinCheck = validateConfirmedCoordinates({
        origin: params.origin,
        destination: params.confirmedPin,
        maxCoverageKm: params.config.maxDeliveryDistanceKm,
      });
      if (!pinCheck.valid) {
        const blocked = calculateSmartDeliveryQuote({
          fulfillmentType: 'delivery',
          serverSubtotalCents: params.simulatedSubtotalCents,
          config: params.config,
          routeLookupFailed: true,
        });
        return {
          eligible: false,
          ambiguousAddress: false,
          reason: pinCheck.reason,
          destinationCoords: params.confirmedPin,
          quote: {
            ...blocked,
            eligible: false,
            usedContingencyFallback: false,
            reason: pinCheck.reason,
          },
        };
      }
      destCoords = params.confirmedPin;
      destPrecision = 'rooftop';
    } else {
      let destGeo: GeocodeResult;
      try {
        const res = await geocodeAddressWithCache(activeProvider, {
          ...params.destination,
          biasCenter: {
            lat: params.origin.lat,
            lng: params.origin.lng,
            radiusKm: Math.max(15, params.config.maxDeliveryDistanceKm * 1.5),
          },
        });
        destGeo = res.result;
      } catch (err: unknown) {
        const errMsg = (err as { message?: string })?.message || 'geocode_failed';
        logger.warn('Contingência de entrega acionada na geocodificação', {
          stage: 'geocode',
          provider: activeProvider.name,
          reason: errMsg,
        });
        const fallbackQuote = calculateSmartDeliveryQuote({
          fulfillmentType: 'delivery',
          serverSubtotalCents: params.simulatedSubtotalCents,
          config: params.config,
          destinationNeighborhood: params.destination.neighborhood,
          destinationCity: params.destination.city,
          destinationState: params.destination.state,
          routeLookupFailed: true,
          surchargeCents: params.surchargeCents,
        });
        return {
          eligible: fallbackQuote.eligible,
          ambiguousAddress: false,
          reason: errMsg || fallbackQuote.reason,
          quote: {
            ...fallbackQuote,
            fallbackReason: fallbackQuote.usedContingencyFallback ? `geocode:${errMsg}` : undefined,
          },
        };
      }

      if (!isHighConfidenceGeocodePrecision(destGeo.precision)) {
        const blocked = calculateSmartDeliveryQuote({
          fulfillmentType: 'delivery',
          serverSubtotalCents: params.simulatedSubtotalCents,
          config: params.config,
          routeLookupFailed: true,
        });
        return {
          eligible: false,
          ambiguousAddress: true,
          reason:
            'Endereço localizado apenas na rua/bairro. Confirme o ponto exato no mapa ou revise o número.',
          destinationFormattedAddress: destGeo.formattedAddress,
          destinationPrecision: destGeo.precision,
          destinationCoords: { lat: destGeo.lat, lng: destGeo.lng },
          quote: {
            ...blocked,
            eligible: false,
            usedContingencyFallback: false,
            reason:
              'Endereço precisa de confirmação no mapa (baixa precisão automática).',
          },
        };
      }

      destCoords = { lat: destGeo.lat, lng: destGeo.lng };
      destFormattedAddress = destGeo.formattedAddress;
      destPrecision = destGeo.precision;
    }

    try {
      const { result: route } = await calculateRouteWithCache(activeProvider, {
        origin: params.origin,
        destination: destCoords,
        includeTraffic: false,
      });

      const quote = calculateSmartDeliveryQuote({
        fulfillmentType: 'delivery',
        serverSubtotalCents: params.simulatedSubtotalCents,
        config: { ...params.config, originVerified: true },
        routeDistanceMeters: route.distanceMeters,
        routeDurationSeconds: route.durationSeconds,
        surchargeCents: params.surchargeCents,
      });

      return {
        eligible: quote.eligible,
        ambiguousAddress: false,
        reason: quote.reason,
        destinationFormattedAddress: destFormattedAddress,
        destinationPrecision: destPrecision,
        destinationCoords: destCoords,
        quote,
      };
    } catch (err: unknown) {
      const errMsg = (err as { message?: string })?.message || 'route_failed';
      logger.warn('Contingência de entrega acionada no cálculo de rota', {
        stage: 'route',
        provider: activeProvider.name,
        reason: errMsg,
      });
      const fallbackQuote = calculateSmartDeliveryQuote({
        fulfillmentType: 'delivery',
        serverSubtotalCents: params.simulatedSubtotalCents,
        config: { ...params.config, originVerified: true },
        destinationNeighborhood: params.destination.neighborhood,
        destinationCity: params.destination.city,
        destinationState: params.destination.state,
        routeLookupFailed: true,
        surchargeCents: params.surchargeCents,
      });
      return {
        eligible: fallbackQuote.eligible,
        ambiguousAddress: false,
        reason: fallbackQuote.reason || errMsg || 'Falha ao calcular rota rodoviária.',
        destinationFormattedAddress: destFormattedAddress,
        destinationPrecision: destPrecision,
        destinationCoords: destCoords,
        quote: {
          ...fallbackQuote,
          fallbackReason: fallbackQuote.usedContingencyFallback ? `route:${errMsg}` : undefined,
        },
      };
    }
  }

  /**
   * Emite cotação autoritativa para checkout com subtotal recalculado no servidor.
   * Vínculo estrito: tenant_id + checkout_session_id + address_hash + cart_hash + pricing_rule_version + TTL.
   */
  static async createCheckoutQuote(params: {
    tenantId: string;
    checkoutSessionId?: string | null;
    fulfillmentType: 'delivery' | 'pickup';
    items: CartItemInput[];
    address?: GeocodeAddressInput;
    confirmedPin?: { lat: number; lng: number } | null;
    surchargeCents?: number;
    provider?: MapRoutingProvider;
    persistInDatabase?: boolean;
  }): Promise<PersistedDeliveryQuoteResponse> {
    if (!params.items || params.items.length === 0) {
      throw new Error('Adicione itens à sacola para calcular a entrega.');
    }

    // 1. Subtotal autoritativo recalculado no servidor a partir dos itens reais
    const cartValidation = await validateCartItems(params.tenantId, params.items);
    if (cartValidation.hasUnavailableItems) {
      throw new Error('Existem itens indisponíveis na sacola para cotação.');
    }
    const serverSubtotalCents = cartValidation.subtotalInCents;

    const cartHash = computeCanonicalCartHash(params.items);
    const addressHash = params.address
      ? computeCanonicalAddressHash({
          ...params.address,
          confirmedCoords: params.confirmedPin || null,
        })
      : 'pickup-no-address';

    const rawSettings = await getTenantCommerceSettings(params.tenantId);
    const config = buildPricingConfigFromCommerceRow(rawSettings as Record<string, any>);

    if (params.fulfillmentType === 'pickup' || config.pricingMode === 'fixed') {
      const quote = calculateSmartDeliveryQuote({
        fulfillmentType: params.fulfillmentType,
        serverSubtotalCents,
        config,
        surchargeCents: params.surchargeCents,
      });
      return {
        quoteId: null,
        expiresAt: null,
        serverSubtotalCents,
        addressHash,
        cartHash,
        ambiguousAddress: false,
        quote,
      };
    }

    if (!params.address) {
      throw new Error('Endereço de entrega obrigatório para calcular o frete.');
    }

    const originLat = Number((rawSettings as any).origin_lat);
    const originLng = Number((rawSettings as any).origin_lng);
    if (!config.originVerified || !Number.isFinite(originLat) || !Number.isFinite(originLng)) {
      const blocked = calculateSmartDeliveryQuote({
        fulfillmentType: 'delivery',
        serverSubtotalCents,
        config: { ...config, originVerified: false },
      });
      return {
        quoteId: null,
        expiresAt: null,
        serverSubtotalCents,
        addressHash,
        cartHash,
        ambiguousAddress: false,
        quote: blocked,
      };
    }

    const activeProvider =
      params.provider ||
      createMapRoutingProvider((rawSettings as any).route_provider || undefined);

    const sim = await this.simulateAdminQuote({
      origin: { lat: originLat, lng: originLng },
      destination: params.address,
      confirmedPin: params.confirmedPin,
      simulatedSubtotalCents: serverSubtotalCents,
      config,
      surchargeCents: params.surchargeCents,
      provider: activeProvider,
    });

    if (!sim.eligible || !sim.quote.eligible) {
      return {
        quoteId: null,
        expiresAt: null,
        serverSubtotalCents,
        addressHash,
        cartHash,
        ambiguousAddress: sim.ambiguousAddress,
        destinationFormattedAddress: sim.destinationFormattedAddress,
        destinationPrecision: sim.destinationPrecision,
        destinationCoords: sim.destinationCoords,
        quote: sim.quote,
      };
    }

    const expiresAt = new Date(
      Date.now() + DELIVERY_CACHE_POLICY.commercialQuoteTtlSeconds * 1000
    ).toISOString();

    let quoteId: string | null = null;
    if (params.persistInDatabase !== false) {
      const supabase = createAdminClient();
      const { data: inserted, error: insertErr } = await supabase
        .from('delivery_quotes')
        .insert({
          tenant_id: params.tenantId,
          checkout_session_id: params.checkoutSessionId || null,
          pricing_mode: sim.quote.pricingMode,
          pricing_rule_version: sim.quote.pricingRuleVersion,
          address_hash: addressHash,
          cart_hash: cartHash,
          server_subtotal_cents: serverSubtotalCents,
          dest_lat: sim.destinationCoords?.lat ?? null,
          dest_lng: sim.destinationCoords?.lng ?? null,
          distance_meters:
            sim.quote.distanceKm !== null ? Math.round(sim.quote.distanceKm * 1000) : null,
          duration_seconds:
            sim.quote.durationMinutes !== null ? sim.quote.durationMinutes * 60 : null,
          base_fee_cents: sim.quote.baseFeeCents,
          distance_fee_cents: sim.quote.distanceFeeCents,
          surcharge_cents: sim.quote.surchargeCents,
          subsidy_cents: sim.quote.subsidyCents,
          final_fee_cents: sim.quote.finalDeliveryFeeCents,
          provider: params.provider?.name || (rawSettings as any).route_provider || 'google',
          status: 'active',
          expires_at: expiresAt,
        })
        .select('id')
        .single();

      if (insertErr || !inserted?.id) {
        throw new Error(
          `Falha ao registrar cotação de entrega: ${insertErr?.message || 'Erro desconhecido'}`
        );
      }
      quoteId = inserted.id;
    }

    return {
      quoteId,
      expiresAt,
      serverSubtotalCents,
      addressHash,
      cartHash,
      ambiguousAddress: false,
      destinationFormattedAddress: sim.destinationFormattedAddress,
      destinationPrecision: sim.destinationPrecision,
      destinationCoords: sim.destinationCoords,
      quote: sim.quote,
    };
  }
}

