import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  GoogleRoutesAdapter,
  MapProviderNotConfiguredError,
} from '@/modules/delivery/providers/google-routes.adapter';
import { clearMapRoutingCaches } from '@/modules/delivery/providers/map-routing.service';
import type { MapRoutingProvider } from '@/modules/delivery/providers/map-routing.types';

const mockDb = {
  commerceRow: {
    tenant_id: 't-benza',
    delivery_enabled: true,
    pickup_enabled: true,
    fixed_delivery_fee_cents: 1200,
    free_delivery_threshold_cents: 18000,
    min_order_value_cents: 3500,
    asap_enabled: true,
    scheduled_enabled: true,
    estimated_delivery_time_min: 45,
    estimated_pickup_time_min: 25,
    pricing_mode: 'distance',
    pricing_rule_version: 2,
    origin_verified: true,
    origin_lat: -12.2664,
    origin_lng: -38.9663,
    route_provider: 'google',
    base_delivery_fee_cents: 500,
    per_km_fee_cents: 150,
    min_delivery_fee_cents: 600,
    max_delivery_fee_cents: 3000,
    max_delivery_distance_km: 10,
    distance_rounding_mode: 'tenth_km',
    free_delivery_max_distance_km: 5,
    max_delivery_subsidy_cents: 1200,
    contingency_policy: 'block_on_failure',
  } as Record<string, any>,
  validatedSubtotalCents: 6000,
  hasUnavailableItems: false,
  insertedQuotes: [] as Array<Record<string, any>>,
};

vi.mock('@/modules/orders/orders.service', () => ({
  getTenantCommerceSettings: vi.fn(async () => mockDb.commerceRow),
  validateCartItems: vi.fn(async () => ({
    isValid: !mockDb.hasUnavailableItems,
    hasPriceChanges: false,
    hasUnavailableItems: mockDb.hasUnavailableItems,
    validatedItems: [],
    subtotalInCents: mockDb.validatedSubtotalCents,
    formattedSubtotal: 'R$ 60,00',
    issues: [],
  })),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (table === 'delivery_quotes') {
        return {
          insert: (row: Record<string, any>) => {
            mockDb.insertedQuotes.push(row);
            return {
              select: () => ({
                single: async () => ({
                  data: { id: 'quote-uuid-001' },
                  error: null,
                }),
              }),
            };
          },
        };
      }
      return {};
    }),
  })),
}));

import { DeliveryQuoteService } from '@/modules/delivery/delivery-quote.service';

describe('Fase C — GoogleRoutesAdapter, Cache e DeliveryQuoteService', () => {
  beforeEach(() => {
    clearMapRoutingCaches();
    mockDb.insertedQuotes = [];
    mockDb.validatedSubtotalCents = 6000;
    mockDb.hasUnavailableItems = false;
    mockDb.commerceRow.pricing_mode = 'distance';
    mockDb.commerceRow.origin_verified = true;
    mockDb.commerceRow.contingency_policy = 'block_on_failure';
  });

  it('GoogleRoutesAdapter deve falhar explicitamente quando GOOGLE_MAPS_API_KEY estiver ausente', async () => {
    const adapter = new GoogleRoutesAdapter({ apiKey: '' });
    expect(adapter.isConfigured()).toBe(false);
    await expect(
      adapter.geocodeAddress({
        zipCode: '44001-000',
        street: 'Av. Getúlio Vargas',
        number: '100',
        neighborhood: 'Centro',
        city: 'Feira de Santana',
        state: 'BA',
      })
    ).rejects.toThrow(MapProviderNotConfiguredError);
  });

  it('GoogleRoutesAdapter deve geocodificar ROOFTOP e calcular rota rodoviária com mock determinístico', async () => {
    const mockFetch = vi.fn(async (url: RequestInfo | URL) => {
      const s = String(url);
      if (s.includes('geocode/json')) {
        return new Response(
          JSON.stringify({
            status: 'OK',
            results: [
              {
                formatted_address: 'Av. Getúlio Vargas, 100 - Centro, Feira de Santana - BA',
                geometry: { location: { lat: -12.2664, lng: -38.9663 }, location_type: 'ROOFTOP' },
              },
            ],
          }),
          { status: 200 }
        );
      }
      return new Response(
        JSON.stringify({
          routes: [{ distanceMeters: 5200, duration: '930s' }],
        }),
        { status: 200 }
      );
    }) as unknown as typeof fetch;

    const adapter = new GoogleRoutesAdapter({ apiKey: 'test-key-local', fetchImpl: mockFetch });
    const geo = await adapter.geocodeAddress({
      zipCode: '44001-000',
      street: 'Av. Getúlio Vargas',
      number: '100',
      neighborhood: 'Centro',
      city: 'Feira de Santana',
      state: 'BA',
    });
    expect(geo.precision).toBe('rooftop');
    expect(geo.lat).toBe(-12.2664);

    const route = await adapter.calculateRoute({
      origin: { lat: -12.2664, lng: -38.9663 },
      destination: { lat: -12.25, lng: -38.94 },
    });
    expect(route.distanceMeters).toBe(5200);
    expect(route.durationSeconds).toBe(930);
  });

  it('simulateAdminQuote deve aprovar endereço próximo/médio, bloquear fora da área e bloquear endereço ambíguo', async () => {
    let scenario: 'near' | 'far' | 'ambiguous' | 'error' = 'near';
    const provider: MapRoutingProvider = {
      name: 'google',
      geocodeAddress: vi.fn(async () => {
        if (scenario === 'error') throw new Error('Timeout no provedor de mapas');
        if (scenario === 'ambiguous') {
          return {
            lat: -12.26,
            lng: -38.96,
            formattedAddress: 'Feira de Santana - BA',
            precision: 'geometric_center' as const,
            provider: 'google' as const,
          };
        }
        return {
          lat: scenario === 'far' ? -12.35 : -12.25,
          lng: scenario === 'far' ? -38.85 : -38.95,
          formattedAddress: 'Rua Castro Alves, 250 - Kalilândia, Feira de Santana - BA',
          precision: 'rooftop' as const,
          provider: 'google' as const,
        };
      }),
      calculateRoute: vi.fn(async () => ({
        distanceMeters: scenario === 'far' ? 14200 : 3200,
        durationSeconds: 720,
        provider: 'google' as const,
      })),
    };

    const baseArgs = {
      origin: { lat: -12.2664, lng: -38.9663 },
      destination: {
        zipCode: '44002-000',
        street: 'Rua Castro Alves',
        number: '250',
        neighborhood: 'Kalilândia',
        city: 'Feira de Santana',
        state: 'BA',
      },
      simulatedSubtotalCents: 6000,
      config: {
        pricingMode: 'distance' as const,
        pricingRuleVersion: 1,
        originVerified: true,
        fixedDeliveryFeeCents: 1200,
        baseDeliveryFeeCents: 500,
        perKmFeeCents: 150,
        minDeliveryFeeCents: 600,
        maxDeliveryFeeCents: 3000,
        maxDeliveryDistanceKm: 10,
        distanceRoundingMode: 'tenth_km' as const,
        freeDeliveryThresholdCents: 18000,
        freeDeliveryMaxDistanceKm: 5,
        maxDeliverySubsidyCents: 1200,
        contingencyPolicy: 'block_on_failure' as const,
      },
      provider,
    };

    // 1. Próximo (3.2 km -> 500 + 3.2*150 = 980 centavos)
    const nearRes = await DeliveryQuoteService.simulateAdminQuote(baseArgs);
    expect(nearRes.eligible).toBe(true);
    expect(nearRes.quote.finalDeliveryFeeCents).toBe(980);

    // 2. Segunda chamada com endereço distinto para evitar cache -> fora da área (14.2 km > 10 km)
    scenario = 'far';
    const farRes = await DeliveryQuoteService.simulateAdminQuote({
      ...baseArgs,
      destination: { ...baseArgs.destination, number: '9999' },
    });
    expect(farRes.eligible).toBe(false);
    expect(farRes.reason).toContain('fora da área');

    // 3. Endereço ambíguo (geometric_center)
    scenario = 'ambiguous';
    const ambRes = await DeliveryQuoteService.simulateAdminQuote({
      ...baseArgs,
      destination: { ...baseArgs.destination, number: 'S/N' },
    });
    expect(ambRes.eligible).toBe(false);
    expect(ambRes.ambiguousAddress).toBe(true);

    // 4. Falha do provedor
    scenario = 'error';
    const errRes = await DeliveryQuoteService.simulateAdminQuote({
      ...baseArgs,
      destination: { ...baseArgs.destination, number: '777' },
    });
    expect(errRes.eligible).toBe(false);
  });

  it('createCheckoutQuote deve recalcular subtotal no servidor e persistir cotação vinculada ao tenant e sessão', async () => {
    const provider: MapRoutingProvider = {
      name: 'google',
      geocodeAddress: vi.fn(async () => ({
        lat: -12.25,
        lng: -38.95,
        formattedAddress: 'Rua A, 10 - Feira de Santana - BA',
        precision: 'rooftop' as const,
        provider: 'google' as const,
      })),
      calculateRoute: vi.fn(async () => ({
        distanceMeters: 4000,
        durationSeconds: 600,
        provider: 'google' as const,
      })),
    };

    // Subtotal autoritativo mockado = 6000 (R$ 60,00), mesmo se o cliente tentou adulterar clientPriceInCents = 99999
    const quoteRes = await DeliveryQuoteService.createCheckoutQuote({
      tenantId: 't-benza',
      checkoutSessionId: 'sess-xyz',
      fulfillmentType: 'delivery',
      items: [
        {
          productId: 'p1',
          variantId: 'v1',
          quantity: 1,
          clientPriceInCents: 99999,
        },
      ],
      address: {
        zipCode: '44001-000',
        street: 'Rua A',
        number: '10',
        neighborhood: 'Centro',
        city: 'Feira de Santana',
        state: 'BA',
      },
      provider,
    });

    expect(quoteRes.quoteId).toBe('quote-uuid-001');
    expect(quoteRes.serverSubtotalCents).toBe(6000);
    expect(quoteRes.quote.finalDeliveryFeeCents).toBe(1100); // 500 + 4*150
    expect(mockDb.insertedQuotes).toHaveLength(1);
    expect(mockDb.insertedQuotes[0].tenant_id).toBe('t-benza');
    expect(mockDb.insertedQuotes[0].checkout_session_id).toBe('sess-xyz');
    expect(mockDb.insertedQuotes[0].pricing_rule_version).toBe(2);
    expect(mockDb.insertedQuotes[0].server_subtotal_cents).toBe(6000);
  });
});

