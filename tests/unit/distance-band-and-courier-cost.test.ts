import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import {
  calculateSmartDeliveryQuote,
  findDistanceBandForMeters,
  validateDistanceBands,
  type DeliveryDistanceBand,
  type SmartDeliveryPricingConfig,
} from '@/modules/delivery/delivery-pricing.engine';
import { createOrderAtomic } from '@/modules/orders/orders.service';

const TENANT_A = '00000000-0000-0000-0000-000000000001';

const SIMULATION_BANDS: DeliveryDistanceBand[] = [
  { id: 'b1', minMeters: 0, maxMeters: 4000, feeCents: 890, label: 'Até 4 km', active: true },
  { id: 'b2', minMeters: 4000, maxMeters: 8000, feeCents: 1290, label: '4 a 8 km', active: true },
  { id: 'b3', minMeters: 8000, maxMeters: 12000, feeCents: 1590, label: '8 a 12 km', active: true },
  { id: 'b4', minMeters: 12000, maxMeters: 15000, feeCents: 1990, label: '12 a 15 km', active: true },
];

function makeBandConfig(overrides: Partial<SmartDeliveryPricingConfig> = {}): SmartDeliveryPricingConfig {
  return {
    pricingMode: 'distance_band',
    pricingRuleVersion: 1,
    originVerified: true,
    fixedDeliveryFeeCents: 1200,
    baseDeliveryFeeCents: 600,
    perKmFeeCents: 150,
    minDeliveryFeeCents: 800,
    maxDeliveryFeeCents: 3000,
    maxDeliveryDistanceKm: 15,
    distanceRoundingMode: 'exact',
    freeDeliveryThresholdCents: null,
    freeDeliveryMaxDistanceKm: null,
    maxDeliverySubsidyCents: null,
    contingencyPolicy: 'block_on_failure',
    distanceBands: SIMULATION_BANDS,
    ...overrides,
  };
}

const { mockDb, rpcCalls, auditInserts, orderUpdates, authState } = vi.hoisted(() => ({
  mockDb: {
    commerceSettings: {
      tenant_id: '00000000-0000-0000-0000-000000000001',
      pricing_mode: 'fixed',
      pricing_rule_version: 1,
      max_delivery_distance_km: 10,
      distance_bands: [] as any[],
      delivery_enabled: true,
      pickup_enabled: true,
      fixed_delivery_fee_cents: 1200,
      free_delivery_threshold_cents: null,
      min_order_value_cents: 0,
      asap_enabled: true,
      scheduled_enabled: true,
    } as any,
    orderRow: {
      id: '00000000-0000-0000-0000-000000005001',
      tenant_id: '00000000-0000-0000-0000-000000000001',
      order_number: '#000501',
      delivery_fee_cents: 1290,
      total_cents: 6090,
      delivery_distance_meters: 6700,
      actual_courier_cost_cents: null as number | null,
    } as any,
    deliveryQuoteRow: null as any,
    realVariants: [
      {
        id: '00000000-0000-0000-0000-000000000010',
        product_id: '00000000-0000-0000-0000-000000000020',
        name: 'Individual',
        unit_value: 400,
        unit_type: 'g',
        price_in_cents: 4800,
        is_available: true,
        is_active: true,
        product: {
          id: '00000000-0000-0000-0000-000000000020',
          name: 'Escondidinho',
          status: 'active',
          is_active: true,
          cover_image_url: null,
        },
      },
    ],
    businessHours: {
      is_store_open: true,
      enforce_schedule: false,
      enabled_payment_methods: ['pix'],
      timezone: 'America/Sao_Paulo',
    },
    concurrentConflict: false,
  },
  rpcCalls: [] as Array<{ fn: string; params: Record<string, any> }>,
  auditInserts: [] as any[],
  orderUpdates: [] as any[],
  authState: {
    authenticated: true,
    tenantId: '00000000-0000-0000-0000-000000000001',
    userId: '00000000-0000-0000-0000-000000000999',
  },
}));

vi.mock('@/lib/tenancy/admin-auth', () => ({
  getAdminAuthSession: vi.fn(async () =>
    authState.authenticated
      ? {
          tenant: { id: authState.tenantId, slug: 'benza', name: 'BENZA' },
          user: { id: authState.userId, email: 'admin@benza.local' },
        }
      : null
  ),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    rpc: vi.fn(async (fn: string, params: Record<string, any>) => {
      rpcCalls.push({ fn, params });
      if (fn === 'record_order_courier_cost_atomic') {
        if (
          !mockDb.orderRow ||
          mockDb.orderRow.tenant_id !== params.p_tenant_id ||
          mockDb.orderRow.id !== params.p_order_id
        ) {
          return { data: null, error: { message: 'ORDER_NOT_FOUND: Pedido não localizado para este estabelecimento.' } };
        }
        auditInserts.push({
          tenant_id: params.p_tenant_id,
          order_id: params.p_order_id,
          previous_cost_cents: mockDb.orderRow.actual_courier_cost_cents,
          new_cost_cents: params.p_actual_courier_cost_cents,
          courier_provider: params.p_courier_provider,
        });
        return {
          data: {
            order_id: mockDb.orderRow.id,
            order_number: mockDb.orderRow.order_number,
            delivery_fee_cents: mockDb.orderRow.delivery_fee_cents,
            total_cents: mockDb.orderRow.total_cents,
            actual_courier_cost_cents: params.p_actual_courier_cost_cents,
            difference_cents: mockDb.orderRow.delivery_fee_cents - params.p_actual_courier_cost_cents,
            recorded_at: new Date().toISOString(),
          },
          error: null,
        };
      }
      return {
        data: { order_id: '00000000-0000-0000-0000-000000009500', order_number: '#000950' },
        error: null,
      };
    }),
    from: vi.fn((table: string) => {
      if (table === 'tenant_commerce_settings') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: mockDb.commerceSettings, error: null }),
              single: async () => ({ data: mockDb.commerceSettings, error: null }),
            }),
          }),
          update: (payload: any) => ({
            eq: () => ({
              eq: () => ({
                select: () => ({
                  maybeSingle: async () => {
                    if (mockDb.concurrentConflict) {
                      return { data: null, error: null };
                    }
                    mockDb.commerceSettings = { ...mockDb.commerceSettings, ...payload };
                    return { data: mockDb.commerceSettings, error: null };
                  },
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'orders') {
        return {
          select: () => ({
            eq: (_c1: string, tId: string) => ({
              eq: (_c2: string, oIdOrKey: string) => ({
                maybeSingle: async () => {
                  if (mockDb.orderRow && mockDb.orderRow.tenant_id === tId && mockDb.orderRow.id === oIdOrKey) {
                    return { data: mockDb.orderRow, error: null };
                  }
                  return { data: null, error: null };
                },
              }),
            }),
          }),
          update: (payload: any) => {
            orderUpdates.push(payload);
            return {
              eq: () => ({
                eq: () => ({
                  select: () => ({
                    maybeSingle: async () => ({
                      data: { public_tracking_token: 'TK-950' },
                      error: null,
                    }),
                  }),
                }),
              }),
            };
          },
        };
      }
      if (table === 'order_courier_cost_audit') {
        return {
          insert: async (row: any) => {
            auditInserts.push(row);
            return { error: null };
          },
        };
      }
      if (table === 'delivery_quotes') {
        return {
          select: () => ({
            eq: (_c1: string, tId: string) => ({
              eq: (_c2: string, qId: string) => ({
                maybeSingle: async () =>
                  mockDb.deliveryQuoteRow &&
                  mockDb.deliveryQuoteRow.tenant_id === tId &&
                  mockDb.deliveryQuoteRow.id === qId
                    ? { data: mockDb.deliveryQuoteRow, error: null }
                    : { data: null, error: null },
              }),
            }),
          }),
        };
      }
      if (table === 'product_variants') {
        return {
          select: () => ({
            eq: () => ({
              in: async () => ({ data: mockDb.realVariants, error: null }),
            }),
          }),
        };
      }
      if (table === 'product_variant_stock_settings' || table === 'inventory_batches') {
        const chain: any = {
          select: () => chain,
          eq: () => chain,
          gte: () => chain,
          in: async () => ({ data: [], error: null }),
        };
        return chain;
      }
      if (table === 'product_modifier_groups') {
        return {
          select: () => ({
            eq: () => ({
              in: async () => ({ data: [], error: null }),
            }),
          }),
        };
      }
      if (table === 'tenant_settings') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { business_hours: mockDb.businessHours },
                error: null,
              }),
            }),
          }),
        };
      }
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
        insert: async () => ({ error: null }),
      };
    }),
  })),
}));

import { PATCH as deliveryPricingPATCH } from '@/app/api/admin/delivery-pricing/route';
import { PATCH as courierCostPATCH } from '@/app/api/admin/orders/[id]/courier-cost/route';

describe('Fase D.5 — Modo distance_band, Validação de Faixas e Custo Real (99/Uber)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpcCalls.length = 0;
    auditInserts.length = 0;
    orderUpdates.length = 0;
    authState.authenticated = true;
    authState.tenantId = TENANT_A;
    mockDb.concurrentConflict = false;
    mockDb.commerceSettings = {
      tenant_id: TENANT_A,
      pricing_mode: 'fixed',
      pricing_rule_version: 1,
      max_delivery_distance_km: 10,
      distance_bands: [],
      delivery_enabled: true,
      pickup_enabled: true,
      fixed_delivery_fee_cents: 1200,
      free_delivery_threshold_cents: null,
      min_order_value_cents: 0,
      asap_enabled: true,
      scheduled_enabled: true,
    };
    mockDb.deliveryQuoteRow = null;
  });

  describe('1. Fronteiras Exatas em Metros & Regras Comerciais', () => {
    it('enquadra fronteiras exatas sem arredondamento prévio (0, 4000, 4001, 8000, 8001, 12000, 12001, 15000)', () => {
      expect(findDistanceBandForMeters(0, SIMULATION_BANDS)?.feeCents).toBe(890);
      expect(findDistanceBandForMeters(4000, SIMULATION_BANDS)?.feeCents).toBe(890);
      expect(findDistanceBandForMeters(4001, SIMULATION_BANDS)?.feeCents).toBe(1290);
      expect(findDistanceBandForMeters(8000, SIMULATION_BANDS)?.feeCents).toBe(1290);
      expect(findDistanceBandForMeters(8001, SIMULATION_BANDS)?.feeCents).toBe(1590);
      expect(findDistanceBandForMeters(12000, SIMULATION_BANDS)?.feeCents).toBe(1590);
      expect(findDistanceBandForMeters(12001, SIMULATION_BANDS)?.feeCents).toBe(1990);
      expect(findDistanceBandForMeters(15000, SIMULATION_BANDS)?.feeCents).toBe(1990);
      expect(findDistanceBandForMeters(15001, SIMULATION_BANDS)).toBeNull();
    });

    it('rejeita faixas com sobreposição, lacuna ou início fora de 0 m', () => {
      const overlap = validateDistanceBands(
        [
          { id: '1', minMeters: 0, maxMeters: 4000, feeCents: 890, active: true },
          { id: '2', minMeters: 3500, maxMeters: 8000, feeCents: 1290, active: true },
        ],
        10,
        true
      );
      expect(overlap.valid).toBe(false);
      expect(overlap.errors[0]).toMatch(/Sobreposição/);

      const gap = validateDistanceBands(
        [
          { id: '1', minMeters: 0, maxMeters: 4000, feeCents: 890, active: true },
          { id: '2', minMeters: 5000, maxMeters: 8000, feeCents: 1290, active: true },
        ],
        10,
        true
      );
      expect(gap.valid).toBe(false);
      expect(gap.errors[0]).toMatch(/Lacuna/);

      const notZero = validateDistanceBands(
        [{ id: '1', minMeters: 1000, maxMeters: 4000, feeCents: 890, active: true }],
        10,
        true
      );
      expect(notZero.valid).toBe(false);
      expect(notZero.errors[0]).toMatch(/0 metros/);
    });

    it('bloqueia distância acima do limite de cobertura (maxDeliveryDistanceKm)', () => {
      const q = calculateSmartDeliveryQuote({
        fulfillmentType: 'delivery',
        serverSubtotalCents: 5000,
        routeDistanceMeters: 15001,
        routeDurationSeconds: 1500,
        config: makeBandConfig({ maxDeliveryDistanceKm: 15 }),
      });
      expect(q.eligible).toBe(false);
      expect(q.reason).toMatch(/fora da área de entrega/i);
    });

    it('aplica frete grátis e subsídio normalmente em distance_band', () => {
      const freeQ = calculateSmartDeliveryQuote({
        fulfillmentType: 'delivery',
        serverSubtotalCents: 15000,
        routeDistanceMeters: 6700,
        config: makeBandConfig({
          freeDeliveryThresholdCents: 12000,
          freeDeliveryMaxDistanceKm: 8,
        }),
      });
      expect(freeQ.eligible).toBe(true);
      expect(freeQ.rawFeeCents).toBe(1290);
      expect(freeQ.subsidyCents).toBe(1290);
      expect(freeQ.finalDeliveryFeeCents).toBe(0);

      const subQ = calculateSmartDeliveryQuote({
        fulfillmentType: 'delivery',
        serverSubtotalCents: 15000,
        routeDistanceMeters: 13800,
        config: makeBandConfig({
          freeDeliveryThresholdCents: 12000,
          maxDeliverySubsidyCents: 1000,
        }),
      });
      expect(subQ.rawFeeCents).toBe(1990);
      expect(subQ.subsidyCents).toBe(1000);
      expect(subQ.finalDeliveryFeeCents).toBe(990);
    });
  });

  describe('2. Simulação Histórica das 5 Entregas Reais da 99', () => {
    it('reproduz exatamente as 5 corridas reais (total cobrado R$ 74,50 vs custo 99 R$ 64,30 = +R$ 10,20)', () => {
      const rides = [
        { name: 'Cidade Nova', meters: 6700, paid99Cents: 1230, expectedFeeCents: 1290 },
        { name: 'Casas de Turim', meters: 11000, paid99Cents: 1390, expectedFeeCents: 1590 },
        { name: 'Cliente 3', meters: 6700, paid99Cents: 820, expectedFeeCents: 1290 },
        { name: 'Reserva Camboriú', meters: 13800, paid99Cents: 1740, expectedFeeCents: 1990 },
        { name: 'Parque Ipê', meters: 7000, paid99Cents: 1250, expectedFeeCents: 1290 },
      ];

      let totalChargedCents = 0;
      let totalPaid99Cents = 0;

      for (const ride of rides) {
        const quote = calculateSmartDeliveryQuote({
          fulfillmentType: 'delivery',
          serverSubtotalCents: 8000,
          routeDistanceMeters: ride.meters,
          config: makeBandConfig(),
        });
        expect(quote.eligible).toBe(true);
        expect(quote.finalDeliveryFeeCents).toBe(ride.expectedFeeCents);
        totalChargedCents += quote.finalDeliveryFeeCents;
        totalPaid99Cents += ride.paid99Cents;
      }

      expect(totalChargedCents).toBe(7450);
      expect(totalPaid99Cents).toBe(6430);
      expect(totalChargedCents - totalPaid99Cents).toBe(1020);
    });
  });

  describe('3. Versionamento Atômico, RPC 20-args & Custo Real (99/Uber)', () => {
    it('PATCH /api/admin/delivery-pricing exige confirmação, valida faixas, detecta conflito 409 e incrementa versão', async () => {
      // Sem confirmação explícita -> 400
      const noConfirmReq = new NextRequest('http://localhost/api/admin/delivery-pricing', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          pricingMode: 'distance_band',
          maxDeliveryDistanceKm: 15,
          distanceBands: SIMULATION_BANDS,
          expectedRuleVersion: 1,
        }),
      });
      const resNoConfirm = await deliveryPricingPATCH(noConfirmReq);
      expect(resNoConfirm.status).toBe(400);

      // Conflito concorrente -> 409
      mockDb.concurrentConflict = true;
      const conflictReq = new NextRequest('http://localhost/api/admin/delivery-pricing', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          pricingMode: 'distance_band',
          maxDeliveryDistanceKm: 15,
          distanceBands: SIMULATION_BANDS,
          expectedRuleVersion: 1,
          confirmActivation: true,
        }),
      });
      const resConflict = await deliveryPricingPATCH(conflictReq);
      expect(resConflict.status).toBe(409);

      // Sucesso -> 200 e pricingRuleVersion v2
      mockDb.concurrentConflict = false;
      const okReq = new NextRequest('http://localhost/api/admin/delivery-pricing', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          pricingMode: 'distance_band',
          maxDeliveryDistanceKm: 15,
          distanceBands: SIMULATION_BANDS,
          expectedRuleVersion: 1,
          confirmActivation: true,
        }),
      });
      const resOk = await deliveryPricingPATCH(okReq);
      expect(resOk.status).toBe(200);
      const jsonOk = await resOk.json();
      expect(jsonOk.pricingMode).toBe('distance_band');
      expect(jsonOk.pricingRuleVersion).toBe(2);
    });

    it('createOrderAtomic em distance_band usa create_order_with_delivery_quote_atomic e rejeita versão obsoleta', async () => {
      mockDb.commerceSettings.pricing_mode = 'distance_band';
      mockDb.commerceSettings.pricing_rule_version = 2;

      const addr = {
        zipCode: '44001-000',
        street: 'Av. Getúlio Vargas',
        number: '500',
        neighborhood: 'Centro',
        city: 'Feira de Santana',
        state: 'BA',
      };
      const items = [
        {
          productId: '00000000-0000-0000-0000-000000000020',
          variantId: '00000000-0000-0000-0000-000000000010',
          quantity: 1,
          clientPriceInCents: 4800,
        },
      ];

      const { computeCanonicalAddressHash, computeCanonicalCartHash } = await import(
        '@/modules/delivery/delivery-pricing.engine'
      );

      mockDb.deliveryQuoteRow = {
        id: '00000000-0000-0000-0000-000000007788',
        tenant_id: TENANT_A,
        status: 'active',
        used_order_id: null,
        expires_at: new Date(Date.now() + 600_000).toISOString(),
        address_hash: computeCanonicalAddressHash(addr),
        cart_hash: computeCanonicalCartHash(items),
        pricing_rule_version: 1, // obsoleta!
        server_subtotal_cents: 4800,
        final_fee_cents: 1290,
      };

      await expect(
        createOrderAtomic(
          TENANT_A,
          {
            items,
            customer: { name: 'João', phone: '75999990000' },
            fulfillmentType: 'delivery',
            scheduleType: 'asap',
            paymentMethod: 'pix',
            address: addr,
            deliveryQuoteId: '00000000-0000-0000-0000-000000007788',
          },
          'commerce'
        )
      ).rejects.toThrow(/Regras comerciais alteradas/i);

      // Agora com versão 2 atualizada -> chama create_order_with_delivery_quote_atomic
      mockDb.deliveryQuoteRow.pricing_rule_version = 2;
      const result = await createOrderAtomic(
        TENANT_A,
        {
          items,
          customer: { name: 'João', phone: '75999990000' },
          fulfillmentType: 'delivery',
          scheduleType: 'asap',
          paymentMethod: 'pix',
          address: addr,
          deliveryQuoteId: '00000000-0000-0000-0000-000000007788',
        },
        'commerce'
      );
      expect(result.deliveryFeeInCents).toBe(1290);
      expect(result.totalInCents).toBe(6090);
      expect(rpcCalls[0].fn).toBe('create_order_with_delivery_quote_atomic');
    });

    it('PATCH /api/admin/orders/[id]/courier-cost exige auth, isola tenant, preserva taxa do cliente e grava auditoria', async () => {
      // Sem auth -> 401
      authState.authenticated = false;
      const unauthReq = new NextRequest(
        `http://localhost/api/admin/orders/${mockDb.orderRow.id}/courier-cost`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ actualCourierCostCents: 1230, courierProvider: '99' }),
        }
      );
      expect((await courierCostPATCH(unauthReq, { params: Promise.resolve({ id: mockDb.orderRow.id }) })).status).toBe(401);

      // Outro tenant -> 404
      authState.authenticated = true;
      authState.tenantId = '00000000-0000-0000-0000-000000000002';
      expect((await courierCostPATCH(unauthReq, { params: Promise.resolve({ id: mockDb.orderRow.id }) })).status).toBe(404);

      // Tenant dono -> 200, preserva delivery_fee_cents/total_cents e registra auditoria
      authState.tenantId = TENANT_A;
      const okReq = new NextRequest(
        `http://localhost/api/admin/orders/${mockDb.orderRow.id}/courier-cost`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            actualCourierCostCents: 1230,
            courierProvider: '99',
            courierActualDistanceMeters: 7700,
            courierCostNotes: 'Corrida normal sem tarifa dinâmica',
          }),
        }
      );
      const res = await courierCostPATCH(okReq, {
        params: Promise.resolve({ id: mockDb.orderRow.id }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.deliveryFeeCents).toBe(1290);
      expect(data.totalCents).toBe(6090);
      expect(data.actualCourierCostCents).toBe(1230);
      expect(data.differenceCents).toBe(60); // +R$ 0,60
      expect(orderUpdates).toHaveLength(0);
      expect(rpcCalls.some((c) => c.fn === 'record_order_courier_cost_atomic')).toBe(true);
      expect(auditInserts).toHaveLength(1);
      expect(auditInserts[0]).toMatchObject({
        tenant_id: TENANT_A,
        order_id: mockDb.orderRow.id,
        new_cost_cents: 1230,
        courier_provider: '99',
      });
    });
  });
});

