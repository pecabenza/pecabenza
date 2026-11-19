import { describe, it, expect } from 'vitest';
import {
  calculateSmartDeliveryQuote,
  computeCanonicalAddressHash,
  computeCanonicalCartHash,
  roundRouteDistanceKm,
  validateDeliveryQuoteBinding,
  type SmartDeliveryPricingConfig,
} from '@/modules/delivery/delivery-pricing.engine';

const BASE_CONFIG: SmartDeliveryPricingConfig = {
  pricingMode: 'distance',
  pricingRuleVersion: 1,
  originVerified: true,
  fixedDeliveryFeeCents: 1200,
  baseDeliveryFeeCents: 500,
  perKmFeeCents: 150,
  minDeliveryFeeCents: 600,
  maxDeliveryFeeCents: 3000,
  maxDeliveryDistanceKm: 10,
  distanceRoundingMode: 'tenth_km',
  freeDeliveryThresholdCents: 18000,
  freeDeliveryMaxDistanceKm: 5,
  maxDeliverySubsidyCents: 1200,
  contingencyPolicy: 'block_on_failure',
};

describe('Fase B — Motor Puro de Frete Inteligente BENZA', () => {
  it('deve zerar frete para modalidade retirada (pickup)', () => {
    const res = calculateSmartDeliveryQuote({
      fulfillmentType: 'pickup',
      serverSubtotalCents: 4800,
      config: BASE_CONFIG,
      routeDistanceMeters: 5200,
    });
    expect(res.eligible).toBe(true);
    expect(res.finalDeliveryFeeCents).toBe(0);
  });

  it('deve preservar modo fixed para retrocompatibilidade dos tenants atuais', () => {
    const res = calculateSmartDeliveryQuote({
      fulfillmentType: 'delivery',
      serverSubtotalCents: 4800,
      config: { ...BASE_CONFIG, pricingMode: 'fixed' },
    });
    expect(res.eligible).toBe(true);
    expect(res.pricingMode).toBe('fixed');
    expect(res.finalDeliveryFeeCents).toBe(1200);
  });

  it('deve calcular frete por distância com arredondamento configurável e limites min/max', () => {
    // 5.2 km -> tenth_km = 5.2 km -> 500 + 5.2 * 150 = 1280 centavos
    const mid = calculateSmartDeliveryQuote({
      fulfillmentType: 'delivery',
      serverSubtotalCents: 4800,
      config: BASE_CONFIG,
      routeDistanceMeters: 5200,
      routeDurationSeconds: 950,
    });
    expect(mid.eligible).toBe(true);
    expect(mid.distanceKm).toBe(5.2);
    expect(mid.roundedDistanceKm).toBe(5.2);
    expect(mid.durationMinutes).toBe(16);
    expect(mid.baseFeeCents).toBe(500);
    expect(mid.distanceFeeCents).toBe(780);
    expect(mid.finalDeliveryFeeCents).toBe(1280);

    // Distância muito curta (0.3 km -> 545 centavos < min 600 -> clamp para 600)
    const shortRes = calculateSmartDeliveryQuote({
      fulfillmentType: 'delivery',
      serverSubtotalCents: 4800,
      config: BASE_CONFIG,
      routeDistanceMeters: 300,
    });
    expect(shortRes.finalDeliveryFeeCents).toBe(600);

    // Arredondamento ceil_km (5.2 km -> 6 km -> 500 + 6*150 = 1400)
    expect(roundRouteDistanceKm(5200, 'ceil_km')).toBe(6);
  });

  it('deve bloquear entregas fora do raio máximo por rota sem aplicar teto como entrega válida', () => {
    const outOfRange = calculateSmartDeliveryQuote({
      fulfillmentType: 'delivery',
      serverSubtotalCents: 10000,
      config: BASE_CONFIG,
      routeDistanceMeters: 12400,
    });
    expect(outOfRange.eligible).toBe(false);
    expect(outOfRange.reason).toContain('fora da área de entrega');
  });

  it('deve exigir origem verificada para modo distance', () => {
    const unverified = calculateSmartDeliveryQuote({
      fulfillmentType: 'delivery',
      serverSubtotalCents: 5000,
      config: { ...BASE_CONFIG, originVerified: false },
      routeDistanceMeters: 2000,
    });
    expect(unverified.eligible).toBe(false);
    expect(unverified.reason).toContain('Origem');
  });

  it('deve aplicar frete grátis apenas dentro da distância permitida e respeitar teto de subsídio', () => {
    // 3.0 km (<= 5 km), subtotal R$ 200 (>= R$ 180), frete bruto 950 (<= subsídio 1200) -> frete grátis
    const fullFree = calculateSmartDeliveryQuote({
      fulfillmentType: 'delivery',
      serverSubtotalCents: 20000,
      config: BASE_CONFIG,
      routeDistanceMeters: 3000,
    });
    expect(fullFree.rawFeeCents).toBe(950);
    expect(fullFree.subsidyCents).toBe(950);
    expect(fullFree.finalDeliveryFeeCents).toBe(0);

    // 4.8 km (<= 5 km), subtotal R$ 200, perKm=200 -> 500 + 4.8*200 = 1460 (> subsídio 1200) -> paga diferença 260
    const partialSubsidy = calculateSmartDeliveryQuote({
      fulfillmentType: 'delivery',
      serverSubtotalCents: 20000,
      config: { ...BASE_CONFIG, perKmFeeCents: 200 },
      routeDistanceMeters: 4800,
    });
    expect(partialSubsidy.rawFeeCents).toBe(1460);
    expect(partialSubsidy.subsidyCents).toBe(1200);
    expect(partialSubsidy.finalDeliveryFeeCents).toBe(260);

    // 6.5 km (> freeDeliveryMaxDistanceKm 5 km) -> sem subsídio
    const tooFarForFree = calculateSmartDeliveryQuote({
      fulfillmentType: 'delivery',
      serverSubtotalCents: 20000,
      config: BASE_CONFIG,
      routeDistanceMeters: 6500,
    });
    expect(tooFarForFree.subsidyCents).toBe(0);
    expect(tooFarForFree.finalDeliveryFeeCents).toBe(1475);
  });

  it('deve respeitar política explícita de contingência (block_on_failure vs fixed_fallback)', () => {
    const blocked = calculateSmartDeliveryQuote({
      fulfillmentType: 'delivery',
      serverSubtotalCents: 5000,
      config: { ...BASE_CONFIG, contingencyPolicy: 'block_on_failure' },
      routeLookupFailed: true,
    });
    expect(blocked.eligible).toBe(false);

    const fallback = calculateSmartDeliveryQuote({
      fulfillmentType: 'delivery',
      serverSubtotalCents: 5000,
      config: { ...BASE_CONFIG, contingencyPolicy: 'fixed_fallback' },
      routeLookupFailed: true,
    });
    expect(fallback.eligible).toBe(true);
    expect(fallback.usedContingencyFallback).toBe(true);
    expect(fallback.finalDeliveryFeeCents).toBe(1200);

    // Plano B por Bairro (normaliza acentos e caixa; valida cidade/UF; bloqueia bairro não cadastrado)
    const neighborhoodConfig = {
      ...BASE_CONFIG,
      originCity: 'Feira de Santana',
      originState: 'BA',
      contingencyPolicy: 'neighborhood_fallback' as const,
      neighborhoodRates: [
        { neighborhood: 'Kalilândia', feeCents: 900, estimatedMinutes: 35, active: true },
        { neighborhood: 'SIM', feeCents: 1400, estimatedMinutes: 45, active: true },
      ],
    };
    const matchedNeighborhood = calculateSmartDeliveryQuote({
      fulfillmentType: 'delivery',
      serverSubtotalCents: 5000,
      config: neighborhoodConfig,
      destinationNeighborhood: '  kalilandia ',
      destinationCity: 'Feira de Santana',
      destinationState: 'BA',
      routeLookupFailed: true,
    });
    expect(matchedNeighborhood.eligible).toBe(true);
    expect(matchedNeighborhood.usedContingencyFallback).toBe(true);
    expect(matchedNeighborhood.fallbackSource).toBe('neighborhood');
    expect(matchedNeighborhood.finalDeliveryFeeCents).toBe(900);
    expect(matchedNeighborhood.durationMinutes).toBe(35);

    // Mesmo nome de bairro em outra cidade deve ser bloqueado
    const wrongCity = calculateSmartDeliveryQuote({
      fulfillmentType: 'delivery',
      serverSubtotalCents: 5000,
      config: neighborhoodConfig,
      destinationNeighborhood: 'Kalilândia',
      destinationCity: 'Salvador',
      destinationState: 'BA',
      routeLookupFailed: true,
    });
    expect(wrongCity.eligible).toBe(false);

    const unknownNeighborhood = calculateSmartDeliveryQuote({
      fulfillmentType: 'delivery',
      serverSubtotalCents: 5000,
      config: neighborhoodConfig,
      destinationNeighborhood: 'Bairro Desconhecido',
      routeLookupFailed: true,
    });
    expect(unknownNeighborhood.eligible).toBe(false);
    expect(unknownNeighborhood.reason).toContain('bairro não cadastrado');
  });

  it('deve suportar external_quote e rejeitar valores monetários inválidos', () => {
    const ext = calculateSmartDeliveryQuote({
      fulfillmentType: 'delivery',
      serverSubtotalCents: 5000,
      config: { ...BASE_CONFIG, pricingMode: 'external_quote' },
      externalQuoteFeeCents: 1650,
      routeDistanceMeters: 4100,
    });
    expect(ext.eligible).toBe(true);
    expect(ext.finalDeliveryFeeCents).toBe(1650);

    expect(() =>
      calculateSmartDeliveryQuote({
        fulfillmentType: 'delivery',
        serverSubtotalCents: 50.5,
        config: BASE_CONFIG,
      })
    ).toThrow('centavos');
  });

  it('deve validar vínculo estrito de cotação (tenant, endereço, carrinho, versão e expiração)', () => {
    const addrHash = computeCanonicalAddressHash({
      zipCode: '44001-000',
      street: 'Av. Getúlio Vargas',
      number: '100',
      neighborhood: 'Centro',
      city: 'Feira de Santana',
      state: 'BA',
    });
    const cartHash = computeCanonicalCartHash([
      { productId: 'p1', variantId: 'v1', quantity: 2, selectedModifierOptionIds: ['m2', 'm1'] },
    ]);
    const sameCartDiffOrder = computeCanonicalCartHash([
      { productId: 'p1', variantId: 'v1', quantity: 2, selectedModifierOptionIds: ['m1', 'm2'] },
    ]);
    expect(cartHash).toBe(sameCartDiffOrder);

    const quote = {
      id: 'q1',
      tenantId: 't1',
      status: 'active' as const,
      usedOrderId: null,
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
      addressHash: addrHash,
      cartHash,
      pricingRuleVersion: 1,
      finalFeeCents: 1280,
    };

    expect(
      validateDeliveryQuoteBinding(quote, {
        tenantId: 't1',
        addressHash: addrHash,
        cartHash,
        pricingRuleVersion: 1,
      }).valid
    ).toBe(true);

    expect(
      validateDeliveryQuoteBinding(quote, {
        tenantId: 't2',
        addressHash: addrHash,
        cartHash,
        pricingRuleVersion: 1,
      }).valid
    ).toBe(false);

    expect(
      validateDeliveryQuoteBinding(quote, {
        tenantId: 't1',
        addressHash: 'other-address',
        cartHash,
        pricingRuleVersion: 1,
      }).valid
    ).toBe(false);

    expect(
      validateDeliveryQuoteBinding(quote, {
        tenantId: 't1',
        addressHash: addrHash,
        cartHash,
        pricingRuleVersion: 2,
      }).valid
    ).toBe(false);
  });
});

