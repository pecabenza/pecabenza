import crypto from 'crypto';

export type DeliveryPricingMode = 'fixed' | 'distance' | 'distance_band' | 'external_quote';
export type DistanceRoundingMode = 'exact' | 'tenth_km' | 'ceil_km';
export type DeliveryContingencyPolicy =
  | 'block_on_failure'
  | 'fixed_fallback'
  | 'neighborhood_fallback';
export type RouteProviderName = 'google' | 'mapbox' | 'openrouteservice' | 'osrm';

export interface DeliveryDistanceBand {
  id: string;
  minMeters: number;
  maxMeters: number;
  feeCents: number;
  label?: string;
  active: boolean;
}

export interface NeighborhoodRateRule {
  neighborhood: string;
  city?: string;
  state?: string;
  feeCents: number;
  estimatedMinutes?: number;
  active: boolean;
}

export interface SmartDeliveryPricingConfig {
  pricingMode: DeliveryPricingMode;
  pricingRuleVersion: number;
  originVerified: boolean;
  originCity?: string;
  originState?: string;
  fixedDeliveryFeeCents: number;
  baseDeliveryFeeCents: number;
  perKmFeeCents: number;
  minDeliveryFeeCents: number;
  maxDeliveryFeeCents: number;
  maxDeliveryDistanceKm: number;
  distanceRoundingMode: DistanceRoundingMode;
  freeDeliveryThresholdCents: number | null;
  freeDeliveryMaxDistanceKm: number | null;
  maxDeliverySubsidyCents: number | null;
  contingencyPolicy: DeliveryContingencyPolicy;
  neighborhoodRates?: NeighborhoodRateRule[];
  distanceBands?: DeliveryDistanceBand[];
}

export interface CalculateSmartDeliveryInput {
  fulfillmentType: 'delivery' | 'pickup';
  serverSubtotalCents: number;
  config: SmartDeliveryPricingConfig;
  destinationNeighborhood?: string | null;
  destinationCity?: string | null;
  destinationState?: string | null;
  routeDistanceMeters?: number | null;
  routeDurationSeconds?: number | null;
  surchargeCents?: number;
  externalQuoteFeeCents?: number | null;
  routeLookupFailed?: boolean;
}

export interface SmartDeliveryQuoteResult {
  eligible: boolean;
  reason?: string;
  pricingMode: DeliveryPricingMode;
  pricingRuleVersion: number;
  usedContingencyFallback: boolean;
  fallbackSource?: 'fixed' | 'neighborhood';
  fallbackReason?: string;
  distanceKm: number | null;
  roundedDistanceKm: number | null;
  durationMinutes: number | null;
  baseFeeCents: number;
  distanceFeeCents: number;
  surchargeCents: number;
  rawFeeCents: number;
  subsidyCents: number;
  finalDeliveryFeeCents: number;
  appliedBand?: {
    id: string;
    minMeters: number;
    maxMeters: number;
    feeCents: number;
    label?: string;
  };
}

function normalizeNeighborhoodName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function findNeighborhoodRate(
  neighborhood: string | null | undefined,
  rates?: NeighborhoodRateRule[],
  context?: {
    destinationCity?: string | null;
    destinationState?: string | null;
    originCity?: string | null;
    originState?: string | null;
  }
): NeighborhoodRateRule | null {
  if (!neighborhood || !rates || rates.length === 0) return null;
  const target = normalizeNeighborhoodName(neighborhood);
  if (!target) return null;

  const destCity = context?.destinationCity ? normalizeNeighborhoodName(context.destinationCity) : '';
  const destState = context?.destinationState ? context.destinationState.trim().toUpperCase() : '';
  const defaultCity = context?.originCity ? normalizeNeighborhoodName(context.originCity) : '';
  const defaultState = context?.originState ? context.originState.trim().toUpperCase() : '';

  return (
    rates.find((r) => {
      if (!r.active || normalizeNeighborhoodName(r.neighborhood) !== target) return false;
      const expectedCity = r.city ? normalizeNeighborhoodName(r.city) : defaultCity;
      const expectedState = r.state ? r.state.trim().toUpperCase() : defaultState;
      if (expectedCity && (!destCity || destCity !== expectedCity)) return false;
      if (expectedState && (!destState || destState !== expectedState)) return false;
      return true;
    }) || null
  );
}

function assertValidCents(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`Valor monetário inválido para ${label}: esperado inteiro >= 0 em centavos.`);
  }
}

export interface DistanceBandValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  sortedActiveBands: DeliveryDistanceBand[];
}

/**
 * Valida faixas de distância em metros inteiros:
 * - minMeters >= 0, maxMeters > minMeters, feeCents inteiro >= 0
 * - faixas ativas ordenadas iniciando em 0 m, contínuas, sem sobreposições ou lacunas
 */
export function validateDistanceBands(
  bands: DeliveryDistanceBand[] | undefined | null,
  maxDeliveryDistanceKm: number,
  requireNonEmpty = false
): DistanceBandValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const list = Array.isArray(bands) ? bands : [];

  for (let i = 0; i < list.length; i++) {
    const b = list[i];
    if (!Number.isInteger(b.minMeters) || b.minMeters < 0) {
      errors.push(`Faixa ${i + 1}: distância inicial em metros deve ser inteiro >= 0.`);
    }
    if (!Number.isInteger(b.maxMeters) || b.maxMeters <= b.minMeters) {
      errors.push(`Faixa ${i + 1}: distância final deve ser inteiro maior que a inicial.`);
    }
    if (!Number.isInteger(b.feeCents) || b.feeCents < 0) {
      errors.push(`Faixa ${i + 1}: tarifa deve ser inteiro >= 0 em centavos.`);
    }
  }

  const active = list
    .filter((b) => b.active)
    .slice()
    .sort((a, b) => a.minMeters - b.minMeters);

  if (requireNonEmpty && active.length === 0) {
    errors.push('Cadastre pelo menos uma faixa de distância ativa para usar o modo por faixas.');
  }

  if (active.length > 0) {
    if (active[0].minMeters !== 0) {
      errors.push('A primeira faixa ativa deve iniciar exatamente em 0 metros.');
    }
    for (let i = 1; i < active.length; i++) {
      const prev = active[i - 1];
      const curr = active[i];
      if (curr.minMeters < prev.maxMeters) {
        errors.push(
          `Sobreposição entre faixas: ${prev.minMeters}–${prev.maxMeters} m e ${curr.minMeters}–${curr.maxMeters} m.`
        );
      } else if (curr.minMeters > prev.maxMeters) {
        errors.push(
          `Lacuna entre faixas: falta cobertura entre ${prev.maxMeters} m e ${curr.minMeters} m.`
        );
      }
    }

    const maxCoveredMeters = active[active.length - 1].maxMeters;
    const maxCoverageMeters = Math.round(maxDeliveryDistanceKm * 1000);
    if (maxCoverageMeters > maxCoveredMeters) {
      warnings.push(
        `Limite de cobertura (${maxCoverageMeters} m) é maior que a última faixa (${maxCoveredMeters} m); entregas acima de ${maxCoveredMeters} m serão recusadas.`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    sortedActiveBands: active,
  };
}

/**
 * Enquadra distância rodoviária em metros inteiros na faixa correspondente,
 * sem arredondamento prévio:
 * - Primeira faixa (minMeters === 0): 0 <= d <= maxMeters
 * - Demais faixas (minMeters > 0): minMeters < d <= maxMeters
 */
export function findDistanceBandForMeters(
  distanceMeters: number,
  bands?: DeliveryDistanceBand[]
): DeliveryDistanceBand | null {
  if (!Number.isFinite(distanceMeters) || distanceMeters < 0 || !bands || bands.length === 0) {
    return null;
  }
  const exactMeters = Math.round(distanceMeters);
  const active = bands
    .filter((b) => b.active)
    .slice()
    .sort((a, b) => a.minMeters - b.minMeters);

  for (const band of active) {
    if (band.minMeters === 0) {
      if (exactMeters >= 0 && exactMeters <= band.maxMeters) {
        return band;
      }
    } else if (exactMeters > band.minMeters && exactMeters <= band.maxMeters) {
      return band;
    }
  }
  return null;
}

export function roundRouteDistanceKm(
  distanceMeters: number,
  mode: DistanceRoundingMode
): number {
  if (!Number.isFinite(distanceMeters) || distanceMeters < 0) {
    throw new Error('Distância de rota inválida.');
  }
  const rawKm = distanceMeters / 1000;
  if (mode === 'ceil_km') {
    return Math.ceil(rawKm);
  }
  if (mode === 'tenth_km') {
    return Math.ceil(rawKm * 10) / 10;
  }
  return Math.round(rawKm * 1000) / 1000;
}

function applyFreeDeliveryAndSubsidy(
  rawFeeCents: number,
  serverSubtotalCents: number,
  distanceKm: number | null,
  config: SmartDeliveryPricingConfig
): { subsidyCents: number; finalDeliveryFeeCents: number } {
  const threshold = config.freeDeliveryThresholdCents;
  if (!threshold || threshold <= 0 || serverSubtotalCents < threshold) {
    return { subsidyCents: 0, finalDeliveryFeeCents: rawFeeCents };
  }

  if (
    config.freeDeliveryMaxDistanceKm !== null &&
    config.freeDeliveryMaxDistanceKm > 0 &&
    (distanceKm === null || distanceKm > config.freeDeliveryMaxDistanceKm)
  ) {
    return { subsidyCents: 0, finalDeliveryFeeCents: rawFeeCents };
  }

  const maxSubsidy = config.maxDeliverySubsidyCents;
  const subsidyCents =
    maxSubsidy !== null && maxSubsidy >= 0
      ? Math.min(rawFeeCents, maxSubsidy)
      : rawFeeCents;

  return {
    subsidyCents,
    finalDeliveryFeeCents: Math.max(0, rawFeeCents - subsidyCents),
  };
}

/**
 * Motor puro de cálculo de frete BENZA.
 * Todos os valores monetários devem estar em centavos inteiros.
 */
export function calculateSmartDeliveryQuote(
  input: CalculateSmartDeliveryInput
): SmartDeliveryQuoteResult {
  const { config, fulfillmentType, serverSubtotalCents } = input;
  const surchargeCents = input.surchargeCents ?? 0;

  assertValidCents(serverSubtotalCents, 'serverSubtotalCents');
  assertValidCents(surchargeCents, 'surchargeCents');
  assertValidCents(config.fixedDeliveryFeeCents, 'fixedDeliveryFeeCents');
  assertValidCents(config.baseDeliveryFeeCents, 'baseDeliveryFeeCents');
  assertValidCents(config.perKmFeeCents, 'perKmFeeCents');
  assertValidCents(config.minDeliveryFeeCents, 'minDeliveryFeeCents');
  assertValidCents(config.maxDeliveryFeeCents, 'maxDeliveryFeeCents');
  if (config.maxDeliverySubsidyCents !== null) {
    assertValidCents(config.maxDeliverySubsidyCents, 'maxDeliverySubsidyCents');
  }

  if (fulfillmentType === 'pickup') {
    return {
      eligible: true,
      pricingMode: config.pricingMode,
      pricingRuleVersion: config.pricingRuleVersion,
      usedContingencyFallback: false,
      distanceKm: null,
      roundedDistanceKm: null,
      durationMinutes: null,
      baseFeeCents: 0,
      distanceFeeCents: 0,
      surchargeCents: 0,
      rawFeeCents: 0,
      subsidyCents: 0,
      finalDeliveryFeeCents: 0,
    };
  }

  if (config.pricingMode === 'fixed') {
    const rawFeeCents = config.fixedDeliveryFeeCents + surchargeCents;
    const { subsidyCents, finalDeliveryFeeCents } = applyFreeDeliveryAndSubsidy(
      rawFeeCents,
      serverSubtotalCents,
      null,
      config
    );
    return {
      eligible: true,
      pricingMode: 'fixed',
      pricingRuleVersion: config.pricingRuleVersion,
      usedContingencyFallback: false,
      distanceKm: null,
      roundedDistanceKm: null,
      durationMinutes: null,
      baseFeeCents: config.fixedDeliveryFeeCents,
      distanceFeeCents: 0,
      surchargeCents,
      rawFeeCents,
      subsidyCents,
      finalDeliveryFeeCents,
    };
  }

  if (config.pricingMode === 'external_quote') {
    if (
      input.externalQuoteFeeCents === null ||
      input.externalQuoteFeeCents === undefined ||
      !Number.isInteger(input.externalQuoteFeeCents) ||
      input.externalQuoteFeeCents < 0
    ) {
      return {
        eligible: false,
        reason: 'Cotação externa de entrega indisponível para este endereço.',
        pricingMode: 'external_quote',
        pricingRuleVersion: config.pricingRuleVersion,
        usedContingencyFallback: false,
        distanceKm: null,
        roundedDistanceKm: null,
        durationMinutes: null,
        baseFeeCents: 0,
        distanceFeeCents: 0,
        surchargeCents: 0,
        rawFeeCents: 0,
        subsidyCents: 0,
        finalDeliveryFeeCents: 0,
      };
    }

    const distanceKm =
      typeof input.routeDistanceMeters === 'number' && input.routeDistanceMeters >= 0
        ? Math.round((input.routeDistanceMeters / 1000) * 1000) / 1000
        : null;
    const durationMinutes =
      typeof input.routeDurationSeconds === 'number' && input.routeDurationSeconds >= 0
        ? Math.ceil(input.routeDurationSeconds / 60)
        : null;

    const rawFeeCents = input.externalQuoteFeeCents + surchargeCents;
    const { subsidyCents, finalDeliveryFeeCents } = applyFreeDeliveryAndSubsidy(
      rawFeeCents,
      serverSubtotalCents,
      distanceKm,
      config
    );
    return {
      eligible: true,
      pricingMode: 'external_quote',
      pricingRuleVersion: config.pricingRuleVersion,
      usedContingencyFallback: false,
      distanceKm,
      roundedDistanceKm: distanceKm,
      durationMinutes,
      baseFeeCents: input.externalQuoteFeeCents,
      distanceFeeCents: 0,
      surchargeCents,
      rawFeeCents,
      subsidyCents,
      finalDeliveryFeeCents,
    };
  }

  // Modos 'distance' e 'distance_band'
  const activeMode = config.pricingMode;
  if (!config.originVerified) {
    return {
      eligible: false,
      reason: 'Origem do estabelecimento não validada para cálculo por distância.',
      pricingMode: activeMode,
      pricingRuleVersion: config.pricingRuleVersion,
      usedContingencyFallback: false,
      distanceKm: null,
      roundedDistanceKm: null,
      durationMinutes: null,
      baseFeeCents: 0,
      distanceFeeCents: 0,
      surchargeCents: 0,
      rawFeeCents: 0,
      subsidyCents: 0,
      finalDeliveryFeeCents: 0,
    };
  }

  if (
    input.routeLookupFailed ||
    input.routeDistanceMeters === null ||
    input.routeDistanceMeters === undefined ||
    !Number.isFinite(input.routeDistanceMeters) ||
    input.routeDistanceMeters < 0
  ) {
    if (config.contingencyPolicy === 'neighborhood_fallback') {
      const matchedRate = findNeighborhoodRate(
        input.destinationNeighborhood,
        config.neighborhoodRates,
        {
          destinationCity: input.destinationCity,
          destinationState: input.destinationState,
          originCity: config.originCity,
          originState: config.originState,
        }
      );
      if (matchedRate) {
        assertValidCents(matchedRate.feeCents, 'neighborhoodRate.feeCents');
        const rawFeeCents = matchedRate.feeCents + surchargeCents;
        const { subsidyCents, finalDeliveryFeeCents } = applyFreeDeliveryAndSubsidy(
          rawFeeCents,
          serverSubtotalCents,
          null,
          config
        );
        return {
          eligible: true,
          pricingMode: activeMode,
          pricingRuleVersion: config.pricingRuleVersion,
          usedContingencyFallback: true,
          fallbackSource: 'neighborhood',
          distanceKm: null,
          roundedDistanceKm: null,
          durationMinutes: matchedRate.estimatedMinutes ?? null,
          baseFeeCents: matchedRate.feeCents,
          distanceFeeCents: 0,
          surchargeCents,
          rawFeeCents,
          subsidyCents,
          finalDeliveryFeeCents,
        };
      }
      return {
        eligible: false,
        reason:
          'Serviço de rotas indisponível e bairro não cadastrado na tabela de contingência. Confira o bairro ou tente novamente.',
        pricingMode: activeMode,
        pricingRuleVersion: config.pricingRuleVersion,
        usedContingencyFallback: false,
        distanceKm: null,
        roundedDistanceKm: null,
        durationMinutes: null,
        baseFeeCents: 0,
        distanceFeeCents: 0,
        surchargeCents: 0,
        rawFeeCents: 0,
        subsidyCents: 0,
        finalDeliveryFeeCents: 0,
      };
    }

    if (config.contingencyPolicy === 'fixed_fallback') {
      const rawFeeCents = config.fixedDeliveryFeeCents + surchargeCents;
      const { subsidyCents, finalDeliveryFeeCents } = applyFreeDeliveryAndSubsidy(
        rawFeeCents,
        serverSubtotalCents,
        null,
        config
      );
      return {
        eligible: true,
        pricingMode: activeMode,
        pricingRuleVersion: config.pricingRuleVersion,
        usedContingencyFallback: true,
        fallbackSource: 'fixed',
        distanceKm: null,
        roundedDistanceKm: null,
        durationMinutes: null,
        baseFeeCents: config.fixedDeliveryFeeCents,
        distanceFeeCents: 0,
        surchargeCents,
        rawFeeCents,
        subsidyCents,
        finalDeliveryFeeCents,
      };
    }

    return {
      eligible: false,
      reason: 'Não foi possível calcular a rota rodoviária para este endereço. Confira os dados informados.',
      pricingMode: activeMode,
      pricingRuleVersion: config.pricingRuleVersion,
      usedContingencyFallback: false,
      distanceKm: null,
      roundedDistanceKm: null,
      durationMinutes: null,
      baseFeeCents: 0,
      distanceFeeCents: 0,
      surchargeCents: 0,
      rawFeeCents: 0,
      subsidyCents: 0,
      finalDeliveryFeeCents: 0,
    };
  }

  const rawKm = Math.round((input.routeDistanceMeters / 1000) * 1000) / 1000;
  if (rawKm > config.maxDeliveryDistanceKm) {
    return {
      eligible: false,
      reason: `Endereço fora da área de entrega (${rawKm.toFixed(1)} km; limite máximo de ${config.maxDeliveryDistanceKm.toFixed(1)} km).`,
      pricingMode: activeMode,
      pricingRuleVersion: config.pricingRuleVersion,
      usedContingencyFallback: false,
      distanceKm: rawKm,
      roundedDistanceKm: roundRouteDistanceKm(input.routeDistanceMeters, config.distanceRoundingMode),
      durationMinutes:
        typeof input.routeDurationSeconds === 'number' && input.routeDurationSeconds >= 0
          ? Math.ceil(input.routeDurationSeconds / 60)
          : null,
      baseFeeCents: 0,
      distanceFeeCents: 0,
      surchargeCents: 0,
      rawFeeCents: 0,
      subsidyCents: 0,
      finalDeliveryFeeCents: 0,
    };
  }

  const durationMinutes =
    typeof input.routeDurationSeconds === 'number' && input.routeDurationSeconds >= 0
      ? Math.ceil(input.routeDurationSeconds / 60)
      : null;

  if (activeMode === 'distance_band') {
    const bandCheck = validateDistanceBands(
      config.distanceBands,
      config.maxDeliveryDistanceKm,
      true
    );
    if (!bandCheck.valid) {
      return {
        eligible: false,
        reason: bandCheck.errors[0] || 'Tabela de faixas de distância inválida ou incompleta.',
        pricingMode: 'distance_band',
        pricingRuleVersion: config.pricingRuleVersion,
        usedContingencyFallback: false,
        distanceKm: rawKm,
        roundedDistanceKm: rawKm,
        durationMinutes,
        baseFeeCents: 0,
        distanceFeeCents: 0,
        surchargeCents: 0,
        rawFeeCents: 0,
        subsidyCents: 0,
        finalDeliveryFeeCents: 0,
      };
    }

    const exactMeters = Math.round(input.routeDistanceMeters);
    const band = findDistanceBandForMeters(exactMeters, bandCheck.sortedActiveBands);
    if (!band) {
      return {
        eligible: false,
        reason: `Distância de ${(exactMeters / 1000).toFixed(1)} km (${exactMeters} m) excede as faixas configuradas. Consulte o atendimento.`,
        pricingMode: 'distance_band',
        pricingRuleVersion: config.pricingRuleVersion,
        usedContingencyFallback: false,
        distanceKm: rawKm,
        roundedDistanceKm: rawKm,
        durationMinutes,
        baseFeeCents: 0,
        distanceFeeCents: 0,
        surchargeCents: 0,
        rawFeeCents: 0,
        subsidyCents: 0,
        finalDeliveryFeeCents: 0,
      };
    }

    assertValidCents(band.feeCents, 'distanceBand.feeCents');
    const rawFeeCents = band.feeCents + surchargeCents;
    const { subsidyCents, finalDeliveryFeeCents } = applyFreeDeliveryAndSubsidy(
      rawFeeCents,
      serverSubtotalCents,
      rawKm,
      config
    );

    return {
      eligible: true,
      pricingMode: 'distance_band',
      pricingRuleVersion: config.pricingRuleVersion,
      usedContingencyFallback: false,
      distanceKm: rawKm,
      roundedDistanceKm: rawKm,
      durationMinutes,
      baseFeeCents: band.feeCents,
      distanceFeeCents: 0,
      surchargeCents,
      rawFeeCents,
      subsidyCents,
      finalDeliveryFeeCents,
      appliedBand: {
        id: band.id,
        minMeters: band.minMeters,
        maxMeters: band.maxMeters,
        feeCents: band.feeCents,
        label: band.label,
      },
    };
  }

  const roundedKm = roundRouteDistanceKm(input.routeDistanceMeters, config.distanceRoundingMode);
  const distanceFeeCents = Math.round(roundedKm * config.perKmFeeCents);
  const unclampedFee = config.baseDeliveryFeeCents + distanceFeeCents + surchargeCents;
  const effectiveMax = Math.max(config.minDeliveryFeeCents, config.maxDeliveryFeeCents);
  const rawFeeCents = Math.min(effectiveMax, Math.max(config.minDeliveryFeeCents, unclampedFee));

  const { subsidyCents, finalDeliveryFeeCents } = applyFreeDeliveryAndSubsidy(
    rawFeeCents,
    serverSubtotalCents,
    rawKm,
    config
  );

  return {
    eligible: true,
    pricingMode: 'distance',
    pricingRuleVersion: config.pricingRuleVersion,
    usedContingencyFallback: false,
    distanceKm: rawKm,
    roundedDistanceKm: roundedKm,
    durationMinutes,
    baseFeeCents: config.baseDeliveryFeeCents,
    distanceFeeCents,
    surchargeCents,
    rawFeeCents,
    subsidyCents,
    finalDeliveryFeeCents,
  };
}

export function haversineDistanceKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sin1 = Math.sin(dLat / 2);
  const sin2 = Math.sin(dLng / 2);
  const h = sin1 * sin1 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sin2 * sin2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function validateConfirmedCoordinates(params: {
  origin: { lat: number; lng: number };
  destination: { lat: number; lng: number };
  maxCoverageKm: number;
}): { valid: boolean; reason?: string; straightLineKm?: number } {
  const { origin, destination, maxCoverageKm } = params;
  const isValidCoord = (c: { lat: number; lng: number }) =>
    Number.isFinite(c.lat) &&
    Number.isFinite(c.lng) &&
    c.lat >= -90 &&
    c.lat <= 90 &&
    c.lng >= -180 &&
    c.lng <= 180 &&
    !(c.lat === 0 && c.lng === 0);

  if (!isValidCoord(origin) || !isValidCoord(destination)) {
    return { valid: false, reason: 'Coordenadas geográficas inválidas.' };
  }

  const straightLineKm = haversineDistanceKm(origin, destination);
  if (straightLineKm > maxCoverageKm * 1.2) {
    return {
      valid: false,
      straightLineKm,
      reason: `Localização selecionada (${straightLineKm.toFixed(1)} km em linha reta) está fora da área máxima de atendimento (${maxCoverageKm.toFixed(1)} km).`,
    };
  }

  return { valid: true, straightLineKm };
}

export function computeCanonicalAddressHash(address: {
  zipCode: string;
  street: string;
  number: string;
  neighborhood: string;
  city: string;
  state: string;
  confirmedCoords?: { lat: number; lng: number } | null;
}): string {
  const coordPart = address.confirmedCoords
    ? `${address.confirmedCoords.lat.toFixed(5)},${address.confirmedCoords.lng.toFixed(5)}`
    : 'nopin';
  const normalized = [
    address.zipCode.replace(/\D/g, ''),
    address.street.trim().toLowerCase(),
    address.number.trim().toLowerCase(),
    address.neighborhood.trim().toLowerCase(),
    address.city.trim().toLowerCase(),
    address.state.trim().toUpperCase(),
    coordPart,
  ].join('|');
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

export function computeCanonicalCartHash(
  items: Array<{
    productId: string;
    variantId: string;
    quantity: number;
    selectedModifierOptionIds?: string[];
  }>
): string {
  const canonical = [...items]
    .map((i) => ({
      p: i.productId,
      v: i.variantId,
      q: i.quantity,
      m: [...(i.selectedModifierOptionIds || [])].sort(),
    }))
    .sort((a, b) => `${a.p}:${a.v}:${a.m.join(',')}`.localeCompare(`${b.p}:${b.v}:${b.m.join(',')}`));
  return crypto.createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

export interface PersistedQuoteRecord {
  id: string;
  tenantId: string;
  status: 'active' | 'used' | 'expired' | 'invalidated';
  usedOrderId: string | null;
  expiresAt: string;
  addressHash: string;
  cartHash: string;
  pricingRuleVersion: number;
  finalFeeCents: number;
}

export function validateDeliveryQuoteBinding(
  quote: PersistedQuoteRecord,
  context: {
    tenantId: string;
    addressHash: string;
    cartHash: string;
    pricingRuleVersion: number;
    now?: Date;
  }
): { valid: boolean; reason?: string } {
  if (quote.tenantId !== context.tenantId) {
    return { valid: false, reason: 'Cotação não pertence ao estabelecimento.' };
  }
  if (quote.status !== 'active' || quote.usedOrderId !== null) {
    return { valid: false, reason: 'Cotação já utilizada ou invalidada.' };
  }
  const now = context.now || new Date();
  if (new Date(quote.expiresAt).getTime() <= now.getTime()) {
    return { valid: false, reason: 'Cotação expirada. Recalcule o frete.' };
  }
  if (quote.addressHash !== context.addressHash) {
    return { valid: false, reason: 'Endereço divergente da cotação gerada.' };
  }
  if (quote.cartHash !== context.cartHash) {
    return { valid: false, reason: 'Itens do carrinho divergentes da cotação gerada.' };
  }
  if (quote.pricingRuleVersion !== context.pricingRuleVersion) {
    return { valid: false, reason: 'Regras comerciais alteradas após a cotação.' };
  }
  return { valid: true };
}

