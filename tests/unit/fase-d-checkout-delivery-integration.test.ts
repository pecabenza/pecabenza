import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { createOrderAtomic } from '@/modules/orders/orders.service';
import {
  computeCanonicalAddressHash,
  computeCanonicalCartHash,
} from '@/modules/delivery/delivery-pricing.engine';
import { zonedDateTimeToIso } from '@/modules/commerce/store-config.engine';

const { mockState, rpcCalls } = vi.hoisted(() => ({
  mockState: {
    tenantId: '00000000-0000-0000-0000-000000000001',
    siteMode: 'commerce' as 'commerce' | 'catalog' | 'paused',
    realVariants: [] as any[],
    commerceSettings: null as any,
    businessHours: {
      is_store_open: true,
      enforce_schedule: false,
      enabled_payment_methods: ['pix', 'cash', 'card_on_delivery'],
      timezone: 'America/Sao_Paulo',
      schedule_windows: [
        { label: 'Almoço', value: '11:30 - 13:30', active: true, fulfillment: 'both' },
      ],
    } as any,
    deliveryQuoteRow: null as any,
    rpcResult: {
      data: { order_id: '00000000-0000-0000-0000-000000009100', order_number: '#000910' } as any,
      error: null as any,
    },
    resolveTenant: true,
    createCheckoutQuoteMock: vi.fn(),
  },
  rpcCalls: [] as Array<{ fn: string; params: Record<string, any> }>,
}));

vi.mock('@/lib/security/rate-limit', () => ({
  checkRateLimit: vi.fn(async () => ({ success: true, remaining: 29, reset: 60 })),
}));

vi.mock('@/lib/tenancy/context', () => ({
  resolveTenantByHost: vi.fn(async () =>
    mockState.resolveTenant
      ? {
          tenant: {
            id: mockState.tenantId,
            slug: 'benza',
            name: 'Benza Cozinha',
            site_mode: mockState.siteMode,
          },
        }
      : null
  ),
}));

vi.mock('@/modules/delivery/delivery-quote.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/modules/delivery/delivery-quote.service')>();
  return {
    ...actual,
    DeliveryQuoteService: {
      ...actual.DeliveryQuoteService,
      createCheckoutQuote: (...args: any[]) => mockState.createCheckoutQuoteMock(...args),
    },
  };
});

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    rpc: vi.fn(async (fn: string, params: Record<string, any>) => {
      rpcCalls.push({ fn, params });
      return mockState.rpcResult;
    }),
    from: vi.fn((table: string) => {
      if (table === 'product_variants') {
        return {
          select: () => ({
            eq: () => ({
              in: async () => ({ data: mockState.realVariants, error: null }),
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
      if (table === 'tenant_commerce_settings') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: mockState.commerceSettings, error: null }),
            }),
          }),
        };
      }
      if (table === 'tenant_settings') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { business_hours: mockState.businessHours },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'orders') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: null, error: null }),
              }),
            }),
          }),
          update: () => ({
            eq: () => ({
              eq: () => ({
                select: () => ({
                  maybeSingle: async () => ({
                    data: { public_tracking_token: 'TK-910' },
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'delivery_quotes') {
        return {
          select: () => ({
            eq: (_col1: string, tId: string) => ({
              eq: (_col2: string, qId: string) => ({
                maybeSingle: async () => {
                  const row = mockState.deliveryQuoteRow;
                  if (row && row.tenant_id === tId && row.id === qId) {
                    return { data: row, error: null };
                  }
                  return { data: null, error: null };
                },
              }),
            }),
          }),
        };
      }
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
        insert: async () => ({ error: null }),
      };
    }),
  })),
}));

import { POST as deliveryQuotePOST } from '@/app/api/checkout/delivery-quote/route';

const VARIANT_ID = '00000000-0000-0000-0000-000000000010';
const PRODUCT_ID = '00000000-0000-0000-0000-000000000020';
const QUOTE_ID = '00000000-0000-0000-0000-000000007777';

const baseAddress = {
  zipCode: '44001-000',
  street: 'Avenida Getúlio Vargas',
  number: '500',
  neighborhood: 'Centro',
  city: 'Feira de Santana',
  state: 'BA',
};

const baseItems = [
  {
    productId: PRODUCT_ID,
    variantId: VARIANT_ID,
    quantity: 2,
    clientPriceInCents: 3500,
  },
];

const baseCustomer = {
  name: 'Maria Souza',
  phone: '75999990000',
};

describe('Fase D: Checkout & Delivery Quote Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpcCalls.length = 0;
    mockState.resolveTenant = true;
    mockState.siteMode = 'commerce';
    mockState.realVariants = [
      {
        id: VARIANT_ID,
        product_id: PRODUCT_ID,
        name: 'Tradicional 400g',
        unit_value: 400,
        unit_type: 'g',
        price_in_cents: 3500,
        is_available: true,
        is_active: true,
        product: {
          id: PRODUCT_ID,
          name: 'Escondidinho de Carne do Sol',
          status: 'active',
          is_active: true,
          cover_image_url: null,
        },
      },
    ];
    mockState.commerceSettings = {
      tenant_id: mockState.tenantId,
      delivery_enabled: true,
      pickup_enabled: true,
      fixed_delivery_fee_cents: 1200,
      free_delivery_threshold_cents: null,
      min_order_value_cents: 0,
      asap_enabled: true,
      scheduled_enabled: true,
      estimated_delivery_time_min: 45,
      estimated_pickup_time_min: 30,
      pricing_mode: 'fixed',
      pricing_rule_version: 1,
    };
    mockState.deliveryQuoteRow = null;
    mockState.rpcResult = {
      data: { order_id: '00000000-0000-0000-0000-000000009100', order_number: '#000910' },
      error: null,
    };
  });

  describe('POST /api/checkout/delivery-quote', () => {
    it('retorna 404 se o host do tenant não for resolvido', async () => {
      mockState.resolveTenant = false;
      const req = new NextRequest('http://localhost/api/checkout/delivery-quote', {
        method: 'POST',
        headers: { host: 'desconhecido.local', 'content-type': 'application/json' },
        body: JSON.stringify({
          fulfillmentType: 'delivery',
          items: baseItems,
          address: baseAddress,
        }),
      });
      const res = await deliveryQuotePOST(req);
      expect(res.status).toBe(404);
    });

    it('retorna 403 se o site não estiver em modo commerce', async () => {
      mockState.siteMode = 'catalog';
      const req = new NextRequest('http://localhost/api/checkout/delivery-quote', {
        method: 'POST',
        headers: { host: 'benza.local', 'content-type': 'application/json' },
        body: JSON.stringify({
          fulfillmentType: 'delivery',
          items: baseItems,
          address: baseAddress,
        }),
      });
      const res = await deliveryQuotePOST(req);
      expect(res.status).toBe(403);
    });

    it('repassa cotação ao DeliveryQuoteService e retorna 200 com quoteId e coordenadas', async () => {
      mockState.createCheckoutQuoteMock.mockResolvedValueOnce({
        quoteId: QUOTE_ID,
        expiresAt: new Date(Date.now() + 900_000).toISOString(),
        serverSubtotalCents: 7000,
        addressHash: 'addr-hash',
        cartHash: 'cart-hash',
        ambiguousAddress: true,
        destinationCoords: { lat: -12.2664, lng: -38.9663 },
        quote: {
          eligible: true,
          pricingMode: 'distance',
          deliveryFeeCents: 1400,
          distanceKm: 4.2,
          durationMin: 12,
        },
      });

      const req = new NextRequest('http://localhost/api/checkout/delivery-quote', {
        method: 'POST',
        headers: { host: 'benza.local', 'content-type': 'application/json' },
        body: JSON.stringify({
          fulfillmentType: 'delivery',
          checkoutSessionId: 'sess-123',
          items: baseItems,
          address: baseAddress,
          confirmedPin: { lat: -12.2664, lng: -38.9663 },
        }),
      });

      const res = await deliveryQuotePOST(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.quoteId).toBe(QUOTE_ID);
      expect(json.ambiguousAddress).toBe(true);
      expect(json.quote.deliveryFeeCents).toBe(1400);
      expect(mockState.createCheckoutQuoteMock).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: mockState.tenantId,
          checkoutSessionId: 'sess-123',
          fulfillmentType: 'delivery',
          confirmedPin: { lat: -12.2664, lng: -38.9663 },
        })
      );
    });
  });

  describe('createOrderAtomic — Preservação de fixed & pickup + Transação única em distance', () => {
    it('preserva 100% o modo fixed sem enviar p_delivery_quote_* ao RPC (compatibilidade 15 args)', async () => {
      mockState.commerceSettings.pricing_mode = 'fixed';
      const result = await createOrderAtomic(
        mockState.tenantId,
        {
          items: baseItems,
          customer: baseCustomer,
          fulfillmentType: 'delivery',
          scheduleType: 'asap',
          paymentMethod: 'pix',
          address: baseAddress,
        },
        'commerce'
      );

      expect(result.success).toBe(true);
      expect(result.deliveryFeeInCents).toBe(1200);
      expect(result.totalInCents).toBe(8200);
      expect(rpcCalls).toHaveLength(1);
      expect(rpcCalls[0].fn).toBe('create_order_atomic');
      expect(rpcCalls[0].params).not.toHaveProperty('p_delivery_quote_id');
    });

    it('pickup permanece grátis e sem exigir cotação mesmo quando pricing_mode === distance', async () => {
      mockState.commerceSettings.pricing_mode = 'distance';
      const result = await createOrderAtomic(
        mockState.tenantId,
        {
          items: baseItems,
          customer: baseCustomer,
          fulfillmentType: 'pickup',
          scheduleType: 'asap',
          paymentMethod: 'pix',
        },
        'commerce'
      );

      expect(result.success).toBe(true);
      expect(result.deliveryFeeInCents).toBe(0);
      expect(result.totalInCents).toBe(7000);
      expect(rpcCalls).toHaveLength(1);
      expect(rpcCalls[0].fn).toBe('create_order_atomic');
      expect(rpcCalls[0].params).not.toHaveProperty('p_delivery_quote_id');
    });

    it('rejeita pedido distance sem deliveryQuoteId', async () => {
      mockState.commerceSettings.pricing_mode = 'distance';
      await expect(
        createOrderAtomic(
          mockState.tenantId,
          {
            items: baseItems,
            customer: baseCustomer,
            fulfillmentType: 'delivery',
            scheduleType: 'asap',
            paymentMethod: 'pix',
            address: baseAddress,
          },
          'commerce'
        )
      ).rejects.toThrow(/Cotação de entrega obrigatória/);
    });

    it('rejeita cotação de outro tenant (isolamento multi-tenant)', async () => {
      mockState.commerceSettings.pricing_mode = 'distance';
      mockState.deliveryQuoteRow = {
        id: QUOTE_ID,
        tenant_id: '00000000-0000-0000-0000-999999999999',
        status: 'active',
        used_order_id: null,
        expires_at: new Date(Date.now() + 600_000).toISOString(),
        address_hash: computeCanonicalAddressHash(baseAddress),
        cart_hash: computeCanonicalCartHash(baseItems),
        pricing_rule_version: 1,
        server_subtotal_cents: 7000,
        final_fee_cents: 1500,
      };

      await expect(
        createOrderAtomic(
          mockState.tenantId,
          {
            items: baseItems,
            customer: baseCustomer,
            fulfillmentType: 'delivery',
            scheduleType: 'asap',
            paymentMethod: 'pix',
            address: baseAddress,
            deliveryQuoteId: QUOTE_ID,
          },
          'commerce'
        )
      ).rejects.toThrow(/não localizada/);
    });

    it('rejeita cotação expirada', async () => {
      mockState.commerceSettings.pricing_mode = 'distance';
      mockState.deliveryQuoteRow = {
        id: QUOTE_ID,
        tenant_id: mockState.tenantId,
        status: 'active',
        used_order_id: null,
        expires_at: new Date(Date.now() - 10_000).toISOString(),
        address_hash: computeCanonicalAddressHash(baseAddress),
        cart_hash: computeCanonicalCartHash(baseItems),
        pricing_rule_version: 1,
        server_subtotal_cents: 7000,
        final_fee_cents: 1500,
      };

      await expect(
        createOrderAtomic(
          mockState.tenantId,
          {
            items: baseItems,
            customer: baseCustomer,
            fulfillmentType: 'delivery',
            scheduleType: 'asap',
            paymentMethod: 'pix',
            address: baseAddress,
            deliveryQuoteId: QUOTE_ID,
          },
          'commerce'
        )
      ).rejects.toThrow(/expirada/i);
    });

    it('rejeita alteração de pino/endereço após a cotação', async () => {
      mockState.commerceSettings.pricing_mode = 'distance';
      mockState.deliveryQuoteRow = {
        id: QUOTE_ID,
        tenant_id: mockState.tenantId,
        status: 'active',
        used_order_id: null,
        expires_at: new Date(Date.now() + 600_000).toISOString(),
        address_hash: computeCanonicalAddressHash({
          ...baseAddress,
          confirmedCoords: { lat: -12.2664, lng: -38.9663 },
        }),
        cart_hash: computeCanonicalCartHash(baseItems),
        pricing_rule_version: 1,
        server_subtotal_cents: 7000,
        final_fee_cents: 1500,
      };

      await expect(
        createOrderAtomic(
          mockState.tenantId,
          {
            items: baseItems,
            customer: baseCustomer,
            fulfillmentType: 'delivery',
            scheduleType: 'asap',
            paymentMethod: 'pix',
            address: baseAddress,
            confirmedPin: { lat: -12.2700, lng: -38.9700 },
            deliveryQuoteId: QUOTE_ID,
          },
          'commerce'
        )
      ).rejects.toThrow(/endereço/i);
    });

    it('rejeita alteração do carrinho após a cotação', async () => {
      mockState.commerceSettings.pricing_mode = 'distance';
      mockState.deliveryQuoteRow = {
        id: QUOTE_ID,
        tenant_id: mockState.tenantId,
        status: 'active',
        used_order_id: null,
        expires_at: new Date(Date.now() + 600_000).toISOString(),
        address_hash: computeCanonicalAddressHash(baseAddress),
        cart_hash: computeCanonicalCartHash([{ ...baseItems[0], quantity: 1 }]),
        pricing_rule_version: 1,
        server_subtotal_cents: 7000,
        final_fee_cents: 1500,
      };

      await expect(
        createOrderAtomic(
          mockState.tenantId,
          {
            items: baseItems,
            customer: baseCustomer,
            fulfillmentType: 'delivery',
            scheduleType: 'asap',
            paymentMethod: 'pix',
            address: baseAddress,
            deliveryQuoteId: QUOTE_ID,
          },
          'commerce'
        )
      ).rejects.toThrow(/itens/i);
    });

    it('rejeita divergência de sessão de checkout', async () => {
      mockState.commerceSettings.pricing_mode = 'distance';
      mockState.deliveryQuoteRow = {
        id: QUOTE_ID,
        tenant_id: mockState.tenantId,
        checkout_session_id: 'sess-A',
        status: 'active',
        used_order_id: null,
        expires_at: new Date(Date.now() + 600_000).toISOString(),
        address_hash: computeCanonicalAddressHash(baseAddress),
        cart_hash: computeCanonicalCartHash(baseItems),
        pricing_rule_version: 1,
        server_subtotal_cents: 7000,
        final_fee_cents: 1500,
      };

      await expect(
        createOrderAtomic(
          mockState.tenantId,
          {
            items: baseItems,
            customer: baseCustomer,
            fulfillmentType: 'delivery',
            scheduleType: 'asap',
            paymentMethod: 'pix',
            address: baseAddress,
            deliveryQuoteId: QUOTE_ID,
            checkoutSessionId: 'sess-B',
          },
          'commerce'
        )
      ).rejects.toThrow(/Sessão de checkout divergente/);
    });

    it('cria pedido em transação única enviando p_delivery_quote_* ao RPC quando válido (inclusive entrega grátis/subsidiada e agendamento)', async () => {
      mockState.commerceSettings.pricing_mode = 'distance';
      const pin = { lat: -12.2664, lng: -38.9663 };
      const addrHash = computeCanonicalAddressHash({ ...baseAddress, confirmedCoords: pin });
      const cartHash = computeCanonicalCartHash(baseItems);

      mockState.deliveryQuoteRow = {
        id: QUOTE_ID,
        tenant_id: mockState.tenantId,
        checkout_session_id: 'sess-valid',
        status: 'active',
        used_order_id: null,
        expires_at: new Date(Date.now() + 600_000).toISOString(),
        address_hash: addrHash,
        cart_hash: cartHash,
        pricing_rule_version: 1,
        server_subtotal_cents: 7000,
        final_fee_cents: 0, // frete grátis / subsidiado validado na cotação
      };

      const tomorrow = new Date(Date.now() + 86_400_000);
      const tomorrowDate = tomorrow.toISOString().slice(0, 10);
      const tomorrowIso = zonedDateTimeToIso(tomorrowDate, '11:30', 'America/Sao_Paulo');

      const result = await createOrderAtomic(
        mockState.tenantId,
        {
          items: baseItems,
          customer: baseCustomer,
          fulfillmentType: 'delivery',
          scheduleType: 'scheduled',
          scheduledFor: tomorrowIso,
          scheduledWindow: '11:30 - 13:30',
          paymentMethod: 'pix',
          address: baseAddress,
          confirmedPin: pin,
          deliveryQuoteId: QUOTE_ID,
          checkoutSessionId: 'sess-valid',
        },
        'commerce'
      );

      expect(result.success).toBe(true);
      expect(result.deliveryFeeInCents).toBe(0);
      expect(result.totalInCents).toBe(7000);
      expect(rpcCalls).toHaveLength(1);
      expect(rpcCalls[0].fn).toBe('create_order_with_delivery_quote_atomic');
      expect(rpcCalls[0].params).toMatchObject({
        p_delivery_quote_id: QUOTE_ID,
        p_quote_address_hash: addrHash,
        p_quote_cart_hash: cartHash,
        p_quote_pricing_rule_version: 1,
        p_quote_checkout_session_id: 'sess-valid',
        p_delivery_fee_cents: 0,
        p_total_cents: 7000,
      });
    });

    it('rejeita cotação se a versão da regra comercial (pricing_rule_version) foi alterada pelo admin', async () => {
      mockState.commerceSettings.pricing_mode = 'distance';
      mockState.commerceSettings.pricing_rule_version = 2; // admin atualizou tarifas
      mockState.deliveryQuoteRow = {
        id: QUOTE_ID,
        tenant_id: mockState.tenantId,
        status: 'active',
        used_order_id: null,
        expires_at: new Date(Date.now() + 600_000).toISOString(),
        address_hash: computeCanonicalAddressHash(baseAddress),
        cart_hash: computeCanonicalCartHash(baseItems),
        pricing_rule_version: 1,
        server_subtotal_cents: 7000,
        final_fee_cents: 1400,
      };

      await expect(
        createOrderAtomic(
          mockState.tenantId,
          {
            items: baseItems,
            customer: baseCustomer,
            fulfillmentType: 'delivery',
            scheduleType: 'asap',
            paymentMethod: 'pix',
            address: baseAddress,
            deliveryQuoteId: QUOTE_ID,
          },
          'commerce'
        )
      ).rejects.toThrow(/Regras comerciais alteradas/i);
    });

    it('rejeita pedido se o subtotal do catálogo mudou após a emissão da cotação', async () => {
      mockState.commerceSettings.pricing_mode = 'distance';
      mockState.deliveryQuoteRow = {
        id: QUOTE_ID,
        tenant_id: mockState.tenantId,
        status: 'active',
        used_order_id: null,
        expires_at: new Date(Date.now() + 600_000).toISOString(),
        address_hash: computeCanonicalAddressHash(baseAddress),
        cart_hash: computeCanonicalCartHash(baseItems),
        pricing_rule_version: 1,
        server_subtotal_cents: 6000, // preço antigo antes da mudança no catálogo
        final_fee_cents: 1400,
      };

      await expect(
        createOrderAtomic(
          mockState.tenantId,
          {
            items: baseItems,
            customer: baseCustomer,
            fulfillmentType: 'delivery',
            scheduleType: 'asap',
            paymentMethod: 'pix',
            address: baseAddress,
            deliveryQuoteId: QUOTE_ID,
          },
          'commerce'
        )
      ).rejects.toThrow(/subtotal do pedido foi alterado/i);
    });

    it('integra cupom de desconto + frete por distância com total consistente enviado à RPC', async () => {
      mockState.commerceSettings.pricing_mode = 'distance';
      mockState.businessHours.coupon_campaigns = [
        {
          id: 'cup-1',
          code: 'BENZA10',
          name: '10% Off',
          discountType: 'percentage',
          discountValue: 10,
          usedCount: 0,
          isActive: true,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ];
      mockState.deliveryQuoteRow = {
        id: QUOTE_ID,
        tenant_id: mockState.tenantId,
        status: 'active',
        used_order_id: null,
        expires_at: new Date(Date.now() + 600_000).toISOString(),
        address_hash: computeCanonicalAddressHash(baseAddress),
        cart_hash: computeCanonicalCartHash(baseItems),
        pricing_rule_version: 1,
        server_subtotal_cents: 7000,
        final_fee_cents: 1400,
      };

      const result = await createOrderAtomic(
        mockState.tenantId,
        {
          items: baseItems,
          customer: baseCustomer,
          fulfillmentType: 'delivery',
          scheduleType: 'asap',
          paymentMethod: 'pix',
          couponCode: 'BENZA10',
          address: baseAddress,
          deliveryQuoteId: QUOTE_ID,
        },
        'commerce'
      );

      expect(result.success).toBe(true);
      expect(result.subtotalInCents).toBe(7000);
      expect(result.deliveryFeeInCents).toBe(1400);
      expect(result.totalInCents).toBe(7700); // 7000 + 1400 - 700
      expect(rpcCalls[0].fn).toBe('create_order_with_delivery_quote_atomic');
      expect(rpcCalls[0].params).toMatchObject({
        p_subtotal_cents: 7000,
        p_delivery_fee_cents: 1400,
        p_discount_cents: 700,
        p_total_cents: 7700,
      });
    });
  });
});