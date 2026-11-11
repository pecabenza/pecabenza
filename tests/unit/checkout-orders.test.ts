import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  validateCartItems,
  createOrderAtomic,
} from '../../src/modules/orders/orders.service';
import {
  CartValidationInputSchema,
  CreateOrderInputSchema,
} from '../../src/modules/orders/orders.schema';
import { isCommerceEnabled } from '../../src/lib/tenancy/site-mode';

const mockSupabaseState = {
  realVariants: [] as any[],
  stockSettings: [] as any[],
  inventoryBatches: [] as any[],
  commerceSettings: null as any,
  businessHours: {
    is_store_open: true,
    enforce_schedule: false,
    enabled_payment_methods: ['pix', 'cash', 'card_on_delivery'],
  } as any,
  existingIdempotentOrder: null as any,
  rpcResult: {
    data: { order_id: '00000000-0000-0000-0000-000000009001', order_number: '#000901' } as any,
    error: null as any,
  },
};

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    rpc: vi.fn(async () => mockSupabaseState.rpcResult),
    from: vi.fn((table: string) => {
      if (table === 'product_variants') {
        return {
          select: () => ({
            eq: () => ({
              in: async () => ({ data: mockSupabaseState.realVariants, error: null }),
            }),
          }),
        };
      }
      if (table === 'product_variant_stock_settings') {
        return {
          select: () => ({
            eq: () => ({
              in: async () => ({ data: mockSupabaseState.stockSettings, error: null }),
            }),
          }),
        };
      }
      if (table === 'inventory_batches') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  gte: () => ({
                    in: async () => ({ data: mockSupabaseState.inventoryBatches, error: null }),
                  }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'tenant_commerce_settings') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: mockSupabaseState.commerceSettings, error: null }),
            }),
          }),
        };
      }
      if (table === 'tenant_settings') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { business_hours: mockSupabaseState.businessHours },
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
                maybeSingle: async () => ({
                  data: mockSupabaseState.existingIdempotentOrder,
                  error: null,
                }),
              }),
            }),
          }),
          update: () => ({
            eq: () => ({
              eq: () => ({
                select: () => ({
                  maybeSingle: async () => ({
                    data: { public_tracking_token: 'mock-tracking-token-abc' },
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'order_status_events') {
        return {
          insert: async () => ({ error: null }),
        };
      }
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
      };
    }),
  })),
}));

describe('Etapa 2A & Fase B (B2) — Checkout Base, Estoque, Regras Comerciais e Atomicidade Estrita', () => {
  const TENANT_BENZA = '00000000-0000-0000-0000-000000000001';

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabaseState.realVariants = [];
    mockSupabaseState.stockSettings = [];
    mockSupabaseState.inventoryBatches = [];
    mockSupabaseState.commerceSettings = null;
    mockSupabaseState.businessHours = {
      is_store_open: true,
      enforce_schedule: false,
      enabled_payment_methods: ['pix', 'cash', 'card_on_delivery'],
    };
    mockSupabaseState.existingIdempotentOrder = null;
    mockSupabaseState.rpcResult = {
      data: { order_id: '00000000-0000-0000-0000-000000009001', order_number: '#000901' },
      error: null,
    };
  });

  describe('1. Servidor como Única Fonte de Verdade & Mitigação de Adulteração de Preço', () => {
    it('deve IGNORAR preço adulterado no localStorage (ex: R$ 0,01) e recalcular com o preço oficial do banco', async () => {
      // Cliente malicioso alterou localStorage para R$ 0,01 (1 centavo)
      const tamperedItems = [
        {
          productId: '00000000-0000-0000-0000-000000000101',
          variantId: 'var-01',
          quantity: 2,
          clientPriceInCents: 1, // R$ 0,01
        },
      ];

      const result = await validateCartItems(TENANT_BENZA, tamperedItems);

      // Preço real no catálogo mock/banco da var-01 é 4800 centavos (R$ 48,00)
      expect(result.subtotalInCents).toBe(9600); // 2 * 4800
      expect(result.validatedItems[0].unitPriceInCents).toBe(4800);
      expect(result.validatedItems[0].subtotalInCents).toBe(9600);

      // Deve ter detectado a divergência e emitido aviso
      expect(result.hasPriceChanges).toBe(true);
      expect(result.isValid).toBe(false); // Exige revisão pelo cliente
      expect(result.issues[0].type).toBe('price_change');
      expect(result.issues[0].message).toContain('foi atualizado');
    });

    it('deve aprovar carrinho quando o preço em cache do cliente for idêntico ao oficial do banco', async () => {
      const validItems = [
        {
          productId: '00000000-0000-0000-0000-000000000101',
          variantId: 'var-01',
          quantity: 1,
          clientPriceInCents: 4800, // Preço correto
        },
      ];

      const result = await validateCartItems(TENANT_BENZA, validItems);

      expect(result.isValid).toBe(true);
      expect(result.hasPriceChanges).toBe(false);
      expect(result.subtotalInCents).toBe(4800);
      expect(result.issues.length).toBe(0);
    });
  });

  describe('2. Isolamento Multi-Tenant Estrito (Cross-Tenant Prevention)', () => {
    it('deve REJEITAR variante pertencente ao Tenant 02 (Cacau & Flor) em requisição feita no Tenant 01 (BENZA)', async () => {
      const crossTenantItems = [
        {
          productId: '00000000-0000-0000-0000-000000000201', // Produto de Cacau & Flor
          variantId: 'var-cacau-01',
          quantity: 1,
          clientPriceInCents: 2200,
        },
      ];

      const result = await validateCartItems(TENANT_BENZA, crossTenantItems);

      expect(result.isValid).toBe(false);
      expect(result.issues.some((i) => i.type === 'cross_tenant')).toBe(true);
      expect(result.subtotalInCents).toBe(0);
    });
  });

  describe('3. Validação de Quantidade e Integridade do Payload Zod', () => {
    it('deve rejeitar carrinho vazio', () => {
      const result = CartValidationInputSchema.safeParse({ items: [] });
      expect(result.success).toBe(false);
    });

    it('deve rejeitar quantidade negativa ou fracionária', () => {
      const resultNegative = CartValidationInputSchema.safeParse({
        items: [{ productId: 'p1', variantId: 'v1', quantity: -2 }],
      });
      expect(resultNegative.success).toBe(false);

      const resultDecimal = CartValidationInputSchema.safeParse({
        items: [{ productId: 'p1', variantId: 'v1', quantity: 1.5 }],
      });
      expect(resultDecimal.success).toBe(false);
    });
  });

  describe('4. Modalidades de Recebimento, Frete e Regras Comerciais', () => {
    it('deve adicionar taxa fixa de entrega quando modalidade for delivery', async () => {
      const orderPayload = {
        items: [
          {
            productId: '00000000-0000-0000-0000-000000000101',
            variantId: 'var-01',
            quantity: 1,
            clientPriceInCents: 4800,
          },
        ],
        customer: {
          name: 'Eduardo Gastronomia',
          phone: '(11) 98765-4321',
          email: 'cliente@teste.com',
        },
        fulfillmentType: 'delivery' as const,
        scheduleType: 'asap' as const,
        paymentMethod: 'pix' as const,
        address: {
          zipCode: '01310-100',
          street: 'Avenida Paulista',
          number: '1000',
          neighborhood: 'Bela Vista',
          city: 'São Paulo',
          state: 'SP',
        },
      };

      const order = await createOrderAtomic(TENANT_BENZA, orderPayload, 'commerce');

      expect(order.success).toBe(true);
      expect(order.subtotalInCents).toBe(4800);
      expect(order.deliveryFeeInCents).toBe(1200); // Taxa padrão de R$ 12,00
      expect(order.totalInCents).toBe(6000); // 4800 + 1200 = R$ 60,00
      expect(order.status).toBe('awaiting_payment');
    });

    it('deve isentar taxa de entrega quando modalidade for retirada (pickup)', async () => {
      const orderPayload = {
        items: [
          {
            productId: '00000000-0000-0000-0000-000000000101',
            variantId: 'var-01',
            quantity: 1,
            clientPriceInCents: 4800,
          },
        ],
        customer: {
          name: 'Eduardo Gastronomia',
          phone: '(11) 98765-4321',
        },
        fulfillmentType: 'pickup' as const,
        scheduleType: 'asap' as const,
        paymentMethod: 'pix' as const,
      };

      const order = await createOrderAtomic(TENANT_BENZA, orderPayload, 'commerce');

      expect(order.success).toBe(true);
      expect(order.subtotalInCents).toBe(4800);
      expect(order.deliveryFeeInCents).toBe(0);
      expect(order.totalInCents).toBe(4800);
    });

    it('deve exigir endereço completo quando for modalidade de entrega', () => {
      const invalidDelivery = {
        items: [{ productId: 'p1', variantId: 'v1', quantity: 1 }],
        customer: { name: 'Cliente', phone: '11999998888' },
        fulfillmentType: 'delivery',
        scheduleType: 'asap',
      };

      const result = CreateOrderInputSchema.safeParse(invalidDelivery);
      expect(result.success).toBe(false);
    });
  });

  describe('5. Validação de Agendamento', () => {
    it('deve rejeitar agendamento com data no passado', () => {
      const pastDate = new Date(Date.now() - 86400000 * 2).toISOString(); // 2 dias atrás

      const invalidScheduled = {
        items: [{ productId: 'p1', variantId: 'v1', quantity: 1 }],
        customer: { name: 'Cliente', phone: '11999998888' },
        fulfillmentType: 'pickup',
        scheduleType: 'scheduled',
        scheduledFor: pastDate,
      };

      const result = CreateOrderInputSchema.safeParse(invalidScheduled);
      expect(result.success).toBe(false);
    });

    it('deve aceitar agendamento futuro válido', () => {
      const futureDate = new Date(Date.now() + 86400000 * 3).toISOString(); // 3 dias à frente

      const validScheduled = {
        items: [{ productId: 'p1', variantId: 'v1', quantity: 1 }],
        customer: { name: 'Cliente', phone: '11999998888' },
        fulfillmentType: 'pickup',
        scheduleType: 'scheduled',
        scheduledFor: futureDate,
      };

      const result = CreateOrderInputSchema.safeParse(validScheduled);
      expect(result.success).toBe(true);
    });
  });

  describe('6. Bloqueio por Site Mode (prelaunch e institutional)', () => {
    it('deve bloquear criação de pedidos se o tenant estiver em prelaunch', async () => {
      const orderPayload = {
        items: [
          {
            productId: '00000000-0000-0000-0000-000000000101',
            variantId: 'var-01',
            quantity: 1,
            clientPriceInCents: 4800,
          },
        ],
        customer: { name: 'Cliente Teste', phone: '11999998888' },
        fulfillmentType: 'pickup' as const,
        scheduleType: 'asap' as const,
        paymentMethod: 'pix' as const,
      };

      await expect(
        createOrderAtomic(TENANT_BENZA, orderPayload, 'prelaunch')
      ).rejects.toThrow('pré-lançamento');
    });

    it('deve bloquear criação de pedidos se o tenant estiver em modo institutional', async () => {
      const orderPayload = {
        items: [
          {
            productId: '00000000-0000-0000-0000-000000000101',
            variantId: 'var-01',
            quantity: 1,
            clientPriceInCents: 4800,
          },
        ],
        customer: { name: 'Cliente Teste', phone: '11999998888' },
        fulfillmentType: 'pickup' as const,
        scheduleType: 'asap' as const,
        paymentMethod: 'pix' as const,
      };

      await expect(
        createOrderAtomic(TENANT_BENZA, orderPayload, 'institutional')
      ).rejects.toThrow('institucional');
    });

    it('helper isCommerceEnabled deve retornar true exclusivamente para modo commerce', () => {
      expect(isCommerceEnabled('commerce')).toBe(true);
      expect(isCommerceEnabled('prelaunch')).toBe(false);
      expect(isCommerceEnabled('institutional')).toBe(false);
      expect(isCommerceEnabled(null)).toBe(false);
    });
  });

  describe('7. Fase B (B2) — Eliminação de Fallback Fictício, Loja Pausada, Pagamento e Estoque', () => {
    const basePayload = {
      items: [
        {
          productId: '00000000-0000-0000-0000-000000000101',
          variantId: 'var-01',
          quantity: 1,
          clientPriceInCents: 4800,
        },
      ],
      customer: { name: 'Cliente Real', phone: '11988887777' },
      fulfillmentType: 'pickup' as const,
      scheduleType: 'asap' as const,
      paymentMethod: 'cash' as const,
    };

    it('NUNCA deve retornar sucesso fictício quando a RPC create_order_atomic falhar', async () => {
      mockSupabaseState.rpcResult = {
        data: null,
        error: { message: 'deadlock detected on create_order_atomic' },
      };

      await expect(createOrderAtomic(TENANT_BENZA, basePayload, 'commerce')).rejects.toThrow(
        'Falha ao registrar pedido no banco de dados'
      );
    });

    it('NUNCA deve retornar sucesso fictício se o banco não devolver order_id e order_number', async () => {
      mockSupabaseState.rpcResult = {
        data: { order_id: null, order_number: null },
        error: null,
      };

      await expect(createOrderAtomic(TENANT_BENZA, basePayload, 'commerce')).rejects.toThrow(
        'Falha de integridade'
      );
    });

    it('deve bloquear pedido quando a loja estiver pausada pelo operador', async () => {
      mockSupabaseState.businessHours = {
        is_store_open: false,
        pause_reason: 'Cozinha em manutenção',
        enforce_schedule: false,
        enabled_payment_methods: ['pix', 'cash'],
      };

      await expect(createOrderAtomic(TENANT_BENZA, basePayload, 'commerce')).rejects.toThrow(
        'Cozinha em manutenção'
      );
    });

    it('deve bloquear forma de pagamento não habilitada na configuração comercial', async () => {
      mockSupabaseState.businessHours = {
        is_store_open: true,
        enforce_schedule: false,
        enabled_payment_methods: ['pix'],
      };

      await expect(createOrderAtomic(TENANT_BENZA, basePayload, 'commerce')).rejects.toThrow(
        'não está habilitada'
      );
    });

    it('deve validar estoque em lotes ativos exclusivamente quando track_inventory = true', async () => {
      const realVarId = '00000000-0000-0000-0000-000000000501';
      mockSupabaseState.realVariants = [
        {
          id: realVarId,
          product_id: '00000000-0000-0000-0000-000000000401',
          tenant_id: TENANT_BENZA,
          name: 'Porção Individual',
          price_in_cents: 4500,
          is_available: true,
          unit_value: 350,
          unit_type: 'g',
          product: {
            id: '00000000-0000-0000-0000-000000000401',
            name: 'Lasagna Artesanal',
            status: 'active',
            tenant_id: TENANT_BENZA,
          },
        },
      ];
      mockSupabaseState.stockSettings = [{ variant_id: realVarId, track_inventory: true }];
      mockSupabaseState.inventoryBatches = [
        { variant_id: realVarId, current_quantity: 1, reserved_quantity: 0 },
      ];

      const outOfStockResult = await validateCartItems(TENANT_BENZA, [
        {
          productId: '00000000-0000-0000-0000-000000000401',
          variantId: realVarId,
          quantity: 3,
          clientPriceInCents: 4500,
        },
      ]);

      expect(outOfStockResult.isValid).toBe(false);
      expect(outOfStockResult.hasUnavailableItems).toBe(true);
      expect(outOfStockResult.issues[0].message).toContain('Disponível: 1');

      // Quando track_inventory = false, não bloqueia por ausência de lote
      mockSupabaseState.stockSettings = [{ variant_id: realVarId, track_inventory: false }];
      const untrackedResult = await validateCartItems(TENANT_BENZA, [
        {
          productId: '00000000-0000-0000-0000-000000000401',
          variantId: realVarId,
          quantity: 3,
          clientPriceInCents: 4500,
        },
      ]);

      expect(untrackedResult.isValid).toBe(true);
    });
  });
});

