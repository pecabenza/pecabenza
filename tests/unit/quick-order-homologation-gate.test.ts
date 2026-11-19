import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QuickOrderInputSchema } from '@/modules/orders/orders.schema';
import {
  createQuickOrder,
  getPublicOrderTracking,
  searchTenantCustomers,
} from '@/modules/orders/orders.service';
import {
  parseBrlInputToCents,
  clampCartItemQuantity,
  validateQuickOrderDiscount,
  buildPosCartItemKey,
} from '@/modules/orders/quick-order-pos.utils';
import {
  generateShortTrackingToken,
  generateUniqueShortTrackingToken,
  isValidPublicTrackingToken,
  toShortTrackingToken,
} from '@/modules/orders/tracking-token';

const mockRpc = vi.fn();
const mockFrom = vi.fn();

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    rpc: mockRpc,
    from: mockFrom,
  }),
}));

describe('Gate Final de Homologação — Pedido Rápido (Etapa 2) & Acompanhamento/Segurança (Etapas 3 e 4)', () => {
  const TENANT_A = '00000000-0000-0000-0000-000000000001';
  const TENANT_B = '00000000-0000-0000-0000-000000000002';
  const PRODUCT_ID = '11111111-1111-4111-8111-111111111111';
  const VARIANT_ID = '22222222-2222-4222-8222-222222222222';

  let stockAvailableQty = 5;
  let requireModifierGroup = false;

  beforeEach(() => {
    vi.clearAllMocks();
    stockAvailableQty = 5;
    requireModifierGroup = false;

    mockFrom.mockImplementation((table: string) => {
      if (table === 'product_variants') {
        return {
          select: () => ({
            eq: (_col: string, val: string) => ({
              in: async () => ({
                data:
                  val === TENANT_A
                    ? [
                        {
                          id: VARIANT_ID,
                          tenant_id: TENANT_A,
                          product_id: PRODUCT_ID,
                          name: '500g',
                          unit_type: 'g',
                          unit_value: 500,
                          price_in_cents: 3690,
                          is_available: true,
                          product: {
                            id: PRODUCT_ID,
                            tenant_id: TENANT_A,
                            name: 'Feijoada BENZA',
                            status: 'active',
                            cover_image_url: null,
                          },
                        },
                      ]
                    : [],
                error: null,
              }),
            }),
          }),
        };
      }

      if (table === 'product_variant_stock_settings') {
        return {
          select: () => ({
            eq: () => ({
              in: async () => ({
                data: [{ variant_id: VARIANT_ID, track_inventory: true }],
                error: null,
              }),
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
                    in: async () => ({
                      data: [
                        {
                          variant_id: VARIANT_ID,
                          current_quantity: stockAvailableQty,
                          reserved_quantity: 0,
                        },
                      ],
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          }),
        };
      }

      if (table === 'product_modifier_groups') {
        return {
          select: () => ({
            eq: () => ({
              in: () => ({
                order: async () => ({
                  data: [
                    {
                      id: 'grp-acomp',
                      tenant_id: TENANT_A,
                      product_id: PRODUCT_ID,
                      name: 'Acompanhamento',
                      is_required: requireModifierGroup,
                      min_selections: requireModifierGroup ? 1 : 0,
                      max_selections: 2,
                      display_order: 1,
                      options: [
                        {
                          id: 'opt-farofa',
                          tenant_id: TENANT_A,
                          group_id: 'grp-acomp',
                          name: 'Farofa de Dendê',
                          price_in_cents: 400,
                          is_available: true,
                        },
                        {
                          id: 'opt-torresmo',
                          tenant_id: TENANT_A,
                          group_id: 'grp-acomp',
                          name: 'Torresmo Crocante',
                          price_in_cents: 700,
                          is_available: true,
                        },
                      ],
                    },
                  ],
                  error: null,
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
              maybeSingle: async () => ({
                data: {
                  tenant_id: TENANT_A,
                  delivery_enabled: true,
                  pickup_enabled: true,
                  fixed_delivery_fee_cents: 1000,
                  free_delivery_threshold_cents: 15000,
                  min_order_value_cents: 2000,
                  asap_enabled: true,
                  scheduled_enabled: true,
                  estimated_delivery_time_min: 45,
                  estimated_pickup_time_min: 20,
                  business_hours: {
                    delivered_thank_you_message:
                      'Seu pedido foi entregue! 🤎 Obrigado por escolher a BENZA. Esperamos que cada garfada seja especial. Bom apetite!',
                  },
                },
                error: null,
              }),
            }),
          }),
        };
      }

      if (table === 'orders') {
        const trackingOrderData = {
          id: 'ord-track-1',
          tenant_id: TENANT_A,
          order_number: '#1050',
          public_tracking_token: '7K9M2P4X8B',
          fulfillment_type: 'delivery',
          schedule_type: 'asap',
          scheduled_for: null,
          status: 'delivered',
          payment_status: 'paid',
          subtotal_cents: 3690,
          delivery_fee_cents: 1000,
          total_cents: 4690,
          notes: null,
          created_at: new Date().toISOString(),
          customer_name: 'Maria Oliveira',
          customer_phone: '75999887766',
        };
        return {
          select: () => ({
            eq: (_col1: string, val1: string) => ({
              eq: (_col2: string, val2: string) => ({
                maybeSingle: async () => {
                  if (val1 === TENANT_A && val2 === '7K9M2P4X8B') {
                    return { data: trackingOrderData, error: null };
                  }
                  return { data: null, error: null };
                },
              }),
              maybeSingle: async () => {
                if (val1 === '7K9M2P4X8B') {
                  return { data: trackingOrderData, error: null };
                }
                return { data: null, error: null };
              },
              neq: () => ({
                order: () => ({
                  limit: () => ({
                    ilike: async () => ({
                      data: [
                        {
                          id: 'ord-hist-1',
                          order_number: '#1010',
                          customer_name: 'Maria Oliveira',
                          customer_phone: '75999887766',
                          customer_email: 'maria@example.com',
                          created_at: new Date().toISOString(),
                        },
                      ],
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          }),
          update: () => ({
            eq: () => ({
              eq: async () => ({ error: null }),
            }),
          }),
        };
      }

      if (table === 'order_addresses') {
        return {
          select: () => ({
            eq: () => ({
              in: async () => ({
                data: [
                  {
                    order_id: 'ord-hist-1',
                    zip_code: '44001-000',
                    street: 'Av. Getúlio Vargas',
                    number: '250',
                    complement: 'Apto 302',
                    neighborhood: 'Centro',
                    city: 'Feira de Santana',
                    state: 'BA',
                    reference: 'Próximo à prefeitura',
                  },
                ],
                error: null,
              }),
              maybeSingle: async () => ({
                data: {
                  street: 'Av. Getúlio Vargas',
                  neighborhood: 'Centro',
                  city: 'Feira de Santana',
                  state: 'BA',
                },
                error: null,
              }),
            }),
          }),
        };
      }

      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
            order: async () => ({ data: [], error: null }),
          }),
        }),
      };
    });
  });

  it('1 a 6. Deve suportar canais WhatsApp, Telefone e Balcão + Retirada, Entrega com CEP e Entrega sem CEP (sem CEP fictício)', async () => {
    // 1. WhatsApp + Entrega sem CEP
    mockRpc.mockResolvedValueOnce({
      data: { order_id: 'o-wa', order_number: '#1001', public_tracking_token: 'WA23456789' },
      error: null,
    });
    const waOrder = await createQuickOrder(
      TENANT_A,
      QuickOrderInputSchema.parse({
        orderChannel: 'whatsapp',
        fulfillmentType: 'delivery',
        customer: { name: 'Ana Souza', phone: '75988887777' },
        items: [{ productId: PRODUCT_ID, variantId: VARIANT_ID, quantity: 1 }],
        address: {
          zipCode: '',
          street: 'Rua Castro Alves',
          number: '88',
          neighborhood: 'Kalilândia',
          city: 'Feira de Santana',
          state: 'BA',
        },
      }),
      { userId: 'u1', role: 'tenant_admin' }
    );
    expect(waOrder.orderChannel).toBe('whatsapp');
    expect(waOrder.address?.zipCode).toBe('');
    expect(waOrder.deliveryFeeInCents).toBe(1000);

    // 2. Telefone + Entrega com CEP válido
    mockRpc.mockResolvedValueOnce({
      data: { order_id: 'o-ph', order_number: '#1002', public_tracking_token: 'PH23456789' },
      error: null,
    });
    const phoneOrder = await createQuickOrder(
      TENANT_A,
      QuickOrderInputSchema.parse({
        orderChannel: 'phone',
        fulfillmentType: 'delivery',
        customer: { name: 'Carlos Lima', phone: '75988886666' },
        items: [{ productId: PRODUCT_ID, variantId: VARIANT_ID, quantity: 1 }],
        address: {
          zipCode: '44001-000',
          street: 'Av. Senhor dos Passos',
          number: '500',
          neighborhood: 'Centro',
          city: 'Feira de Santana',
          state: 'BA',
        },
      }),
      { userId: 'u1', role: 'tenant_admin' }
    );
    expect(phoneOrder.orderChannel).toBe('phone');
    expect(phoneOrder.address?.zipCode).toBe('44001-000');

    // 3 & 4. Balcão + Retirada (sem telefone obrigatório e sem frete)
    mockRpc.mockResolvedValueOnce({
      data: { order_id: 'o-ct', order_number: '#1003', public_tracking_token: 'CT23456789' },
      error: null,
    });
    const counterOrder = await createQuickOrder(
      TENANT_A,
      QuickOrderInputSchema.parse({
        orderChannel: 'counter',
        fulfillmentType: 'pickup',
        customer: { name: 'Cliente Balcão', phone: '' },
        items: [{ productId: PRODUCT_ID, variantId: VARIANT_ID, quantity: 1 }],
      }),
      { userId: 'u1', role: 'tenant_admin' }
    );
    expect(counterOrder.orderChannel).toBe('counter');
    expect(counterOrder.deliveryFeeInCents).toBe(0);
    expect(counterOrder.totalInCents).toBe(3690);
  });

  it('7. Deve buscar clientes recorrentes com histórico e último endereço', async () => {
    const customers = await searchTenantCustomers(TENANT_A, 'Maria');
    expect(customers).toHaveLength(1);
    expect(customers[0].customerName).toBe('Maria Oliveira');
    expect(customers[0].lastAddress?.city).toBe('Feira de Santana');
  });

  it('8, 9, 10 e Estoque Acumulado. Deve validar complementos obrigatórios/opcionais, separar itens idênticos com complementos diferentes e somar estoque acumulado', async () => {
    requireModifierGroup = true;

    // Sem complemento obrigatório -> erro
    await expect(
      createQuickOrder(
        TENANT_A,
        {
          orderChannel: 'whatsapp',
          fulfillmentType: 'pickup',
          scheduleType: 'asap',
          paymentMethod: 'pix',
          markAsPaidNow: false,
          discountCents: 0,
          confirmImmediately: true,
          customer: { name: 'Maria', phone: '75999990000' },
          items: [{ productId: PRODUCT_ID, variantId: VARIANT_ID, quantity: 1 }],
        },
        { userId: 'u1', role: 'tenant_admin' }
      )
    ).rejects.toThrow();

    // Dois itens da mesma variante com complementos diferentes mas excedendo saldo total (stockAvailableQty = 5, pedindo 3 + 3 = 6) -> erro de estoque acumulado
    await expect(
      createQuickOrder(
        TENANT_A,
        {
          orderChannel: 'whatsapp',
          fulfillmentType: 'pickup',
          scheduleType: 'asap',
          paymentMethod: 'pix',
          markAsPaidNow: false,
          discountCents: 0,
          confirmImmediately: true,
          customer: { name: 'Maria', phone: '75999990000' },
          items: [
            {
              productId: PRODUCT_ID,
              variantId: VARIANT_ID,
              quantity: 3,
              selectedModifierOptionIds: ['opt-farofa'],
            },
            {
              productId: PRODUCT_ID,
              variantId: VARIANT_ID,
              quantity: 3,
              selectedModifierOptionIds: ['opt-torresmo'],
            },
          ],
        },
        { userId: 'u1', role: 'tenant_admin' }
      )
    ).rejects.toThrow(/Quantidade insuficiente/);
  });

  it('13 e 14. Deve respeitar confirmImmediately (envio ao KDS + reserva de estoque) e idempotência em requisições repetidas', async () => {
    // Quando confirmImmediately = false -> nasce pending e NÃO chama reserve_order_inventory_atomic
    mockRpc.mockResolvedValueOnce({
      data: {
        order_id: 'o-pending',
        order_number: '#1004',
        public_tracking_token: 'PD23456789',
        idempotent: false,
      },
      error: null,
    });

    const pendingOrder = await createQuickOrder(
      TENANT_A,
      {
        orderChannel: 'whatsapp',
        fulfillmentType: 'pickup',
        scheduleType: 'asap',
        paymentMethod: 'pix',
        markAsPaidNow: false,
        discountCents: 0,
        confirmImmediately: false,
        idempotencyKey: 'qo_idem_key_12345',
        customer: { name: 'Pedro', phone: '75999991111' },
        items: [{ productId: PRODUCT_ID, variantId: VARIANT_ID, quantity: 1 }],
      },
      { userId: 'u1', role: 'tenant_admin' }
    );
    expect(pendingOrder.status).toBe('pending');
    expect(mockRpc).toHaveBeenCalledTimes(1);

    // Quando idempotent = true (repetição de requisição com mesma chave) -> não duplica reserva de estoque
    mockRpc.mockResolvedValueOnce({
      data: {
        order_id: 'o-idem',
        order_number: '#1005',
        public_tracking_token: 'ID23456789',
        idempotent: true,
      },
      error: null,
    });

    const idemOrder = await createQuickOrder(
      TENANT_A,
      {
        orderChannel: 'whatsapp',
        fulfillmentType: 'pickup',
        scheduleType: 'asap',
        paymentMethod: 'pix',
        markAsPaidNow: false,
        discountCents: 0,
        confirmImmediately: true,
        idempotencyKey: 'qo_idem_key_12345',
        customer: { name: 'Pedro', phone: '75999991111' },
        items: [{ productId: PRODUCT_ID, variantId: VARIANT_ID, quantity: 1 }],
      },
      { userId: 'u1', role: 'tenant_admin' }
    );
    expect(idemOrder.idempotent).toBe(true);
    // Apenas a chamada create_quick_order_atomic (sem segunda chamada reserve_order_inventory_atomic)
    expect(mockRpc).toHaveBeenCalledTimes(2);
  });

  it('Etapa 3 & 4 — Rastreamento público: deve mascarar PII, retornar mensagem pós-entrega e bloquear acesso cruzado entre tenants', async () => {
    // Mesmo tenant -> retorna dados com PII mascarado e mensagem pós-entrega
    const tracking = await getPublicOrderTracking('7K9M2P4X8B', TENANT_A);
    expect(tracking).not.toBeNull();
    expect(tracking?.customer.name).toBe('Maria O.');
    expect(tracking?.customer.phone).toBe('7599****-7766');
    expect(tracking?.deliveredThankYouMessage).toContain('Bom apetite!');

    // Tenant diferente -> bloqueia acesso (retorna null)
    const crossTenantAttempt = await getPublicOrderTracking('7K9M2P4X8B', TENANT_B);
    expect(crossTenantAttempt).toBeNull();
  });
});
