import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QuickOrderInputSchema } from '@/modules/orders/orders.schema';
import {
  isValidStatusTransition,
  ORDER_CHANNEL_LABELS,
  PAYMENT_METHOD_LABELS,
  FULFILLMENT_TYPE_LABELS,
} from '@/modules/orders/order-status.machine';
import {
  formatWhatsAppOrderSummary,
  createQuickOrder,
} from '@/modules/orders/orders.service';

// Mock do Supabase Admin Client para testes unitários isolados
const mockRpc = vi.fn();
const mockFrom = vi.fn();

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    rpc: mockRpc,
    from: mockFrom,
  }),
}));

describe('Etapa 3C — Pedido Rápido e Atendimento Multicanal (Unit Tests)', () => {
  const TENANT_ID = '00000000-0000-0000-0000-000000000001';
  const PRODUCT_ID = '11111111-1111-4111-8111-111111111111';
  const VARIANT_ID = '22222222-2222-4222-8222-222222222222';

  beforeEach(() => {
    vi.clearAllMocks();

    mockFrom.mockImplementation((table: string) => {
      if (table === 'product_variants') {
        return {
          select: () => ({
            eq: () => ({
              in: async () => ({
                data: [
                  {
                    id: VARIANT_ID,
                    tenant_id: TENANT_ID,
                    product_id: PRODUCT_ID,
                    name: '500ml',
                    unit_type: 'ml',
                    unit_value: 500,
                    price_in_cents: 4500, // R$ 45,00 autoritativo no servidor
                    is_available: true,
                    product: {
                      id: PRODUCT_ID,
                      tenant_id: TENANT_ID,
                      name: 'Nhoque Artesanal ao Sugo',
                      status: 'active',
                      cover_image_url: null,
                    },
                  },
                ],
                error: null,
              }),
            }),
          }),
        };
      }

      if (table === 'products') {
        return {
          select: () => ({
            eq: () => ({
              in: async () => ({
                data: [
                  {
                    id: PRODUCT_ID,
                    tenant_id: TENANT_ID,
                    name: 'Nhoque Artesanal ao Sugo',
                    status: 'active',
                    cover_image_url: null,
                  },
                ],
                error: null,
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
                  tenant_id: TENANT_ID,
                  delivery_enabled: true,
                  pickup_enabled: true,
                  fixed_delivery_fee_cents: 1200,
                  free_delivery_threshold_cents: 15000,
                  min_order_value_cents: 2500,
                  asap_enabled: true,
                  scheduled_enabled: true,
                  estimated_delivery_time_min: 45,
                  estimated_pickup_time_min: 25,
                },
                error: null,
              }),
            }),
          }),
        };
      }

      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
      };
    });

    mockRpc.mockResolvedValue({
      data: {
        success: true,
        idempotent: false,
        order_id: '33333333-3333-4333-8333-333333333333',
        order_number: '#000350',
        public_tracking_token: 'abc123def456ghi789jkl012mno345pqr678',
      },
      error: null,
    });
  });

  describe('1. Validação Zod de Entrada Multicanal (QuickOrderInputSchema)', () => {
    it('deve exigir telefone válido para pedidos via WhatsApp, Telefone ou Entrega', () => {
      const invalidWhatsApp = QuickOrderInputSchema.safeParse({
        orderChannel: 'whatsapp',
        fulfillmentType: 'pickup',
        customer: { name: 'João WhatsApp', phone: '' },
        items: [{ productId: PRODUCT_ID, variantId: VARIANT_ID, quantity: 1 }],
      });
      expect(invalidWhatsApp.success).toBe(false);

      const validWhatsApp = QuickOrderInputSchema.safeParse({
        orderChannel: 'whatsapp',
        fulfillmentType: 'pickup',
        customer: { name: 'João WhatsApp', phone: '11999998888' },
        items: [{ productId: PRODUCT_ID, variantId: VARIANT_ID, quantity: 1 }],
      });
      expect(validWhatsApp.success).toBe(true);
    });

    it('deve permitir pedido presencial no Balcão (counter) com Retirada ou Consumo Local sem telefone obrigatório', () => {
      const counterDineIn = QuickOrderInputSchema.safeParse({
        orderChannel: 'counter',
        fulfillmentType: 'dine_in',
        customer: { name: 'Mesa 07', phone: '' },
        items: [{ productId: PRODUCT_ID, variantId: VARIANT_ID, quantity: 2 }],
        paymentMethod: 'pos_card',
        markAsPaidNow: true,
      });
      expect(counterDineIn.success).toBe(true);
    });

    it('deve exigir endereço completo quando a modalidade for delivery (mesmo se originado no balcão)', () => {
      const missingAddr = QuickOrderInputSchema.safeParse({
        orderChannel: 'phone',
        fulfillmentType: 'delivery',
        customer: { name: 'Cliente Telefone', phone: '11988887777' },
        items: [{ productId: PRODUCT_ID, variantId: VARIANT_ID, quantity: 1 }],
      });
      expect(missingAddr.success).toBe(false);
    });
  });

  describe('2. Máquina de Estados com Suporte a Consumo no Local (dine_in)', () => {
    it('deve bloquear transição ready -> out_for_delivery para dine_in e permitir ready -> delivered', () => {
      const blockedOutForDelivery = isValidStatusTransition('ready', 'out_for_delivery', {
        fulfillmentType: 'dine_in',
      });
      expect(blockedOutForDelivery.valid).toBe(false);

      const allowedDirectDelivered = isValidStatusTransition('ready', 'delivered', {
        fulfillmentType: 'dine_in',
      });
      expect(allowedDirectDelivered.valid).toBe(true);
    });

    it('deve expor rótulos canônicos para canais, métodos de pagamento e modalidades', () => {
      expect(ORDER_CHANNEL_LABELS.whatsapp).toBe('WhatsApp');
      expect(ORDER_CHANNEL_LABELS.counter).toBe('Balcão');
      expect(PAYMENT_METHOD_LABELS.cash).toBe('Dinheiro');
      expect(PAYMENT_METHOD_LABELS.card_on_delivery).toBe('Cartão na Entrega');
      expect(FULFILLMENT_TYPE_LABELS.dine_in).toBe('Consumo no Local');
    });
  });

  describe('3. Segurança Financeira, Preço Autoritativo e Separação Pedido vs Pagamento', () => {
    it('deve ignorar preço adulterado pelo cliente e impedir confirmação automática falsa de Pix', async () => {
      const result = await createQuickOrder(
        TENANT_ID,
        {
          orderChannel: 'whatsapp',
          fulfillmentType: 'pickup',
          scheduleType: 'asap',
          customer: { name: 'Maria Pix', phone: '11977776666' },
          items: [
            {
              productId: PRODUCT_ID,
              variantId: VARIANT_ID,
              quantity: 2,
              clientPriceInCents: 100, // Tentativa de fraude: R$ 1,00 no lugar de R$ 45,00
            },
          ],
          paymentMethod: 'pix',
          markAsPaidNow: true, // Deve ser ignorado para Pix!
          discountCents: 0,
          confirmImmediately: true,
          idempotencyKey: 'qo_test_pix_security_001',
        },
        {
          userId: 'aaaa1111-1111-4111-8111-111111111111',
          role: 'tenant_admin',
        },
        {
          tenantName: 'BENZA',
          baseUrl: 'https://pecabenza.com.br',
        }
      );

      // 2x R$ 45,00 = R$ 90,00 (9000 centavos)
      expect(result.subtotalInCents).toBe(9000);
      expect(result.totalInCents).toBe(9000);
      // Pedido confirmado para cozinha, mas pagamento Pix estritamente PENDENTE
      expect(result.status).toBe('confirmed');
      expect(result.paymentStatus).toBe('pending');
      expect(result.whatsappSummaryText).toContain('https://pecabenza.com.br/pedido/');
      expect(result.whatsappSummaryText).toContain('Aguardando pagamento');
    });

    it('deve calcular troco corretamente para pagamento em dinheiro e rejeitar troco menor que o total', async () => {
      await expect(
        createQuickOrder(
          TENANT_ID,
          {
            orderChannel: 'phone',
            fulfillmentType: 'pickup',
            scheduleType: 'asap',
            customer: { name: 'Carlos Troco', phone: '11966665555' },
            items: [{ productId: PRODUCT_ID, variantId: VARIANT_ID, quantity: 1 }], // R$ 45,00
            paymentMethod: 'cash',
            markAsPaidNow: false,
            cashChangeForCents: 3000, // R$ 30,00 < R$ 45,00 -> inválido
            discountCents: 0,
            confirmImmediately: true,
          },
          { userId: 'aaaa1111-1111-4111-8111-111111111111', role: 'tenant_manager' }
        )
      ).rejects.toThrow(/maior ou igual ao total/i);

      const validCash = await createQuickOrder(
        TENANT_ID,
        {
          orderChannel: 'phone',
          fulfillmentType: 'pickup',
          scheduleType: 'asap',
          customer: { name: 'Carlos Troco', phone: '11966665555' },
          items: [{ productId: PRODUCT_ID, variantId: VARIANT_ID, quantity: 1 }], // R$ 45,00
          paymentMethod: 'cash',
          markAsPaidNow: false,
          cashChangeForCents: 10000, // R$ 100,00 -> Troco de R$ 55,00
          discountCents: 0,
          confirmImmediately: true,
        },
        { userId: 'aaaa1111-1111-4111-8111-111111111111', role: 'tenant_manager' }
      );

      expect(validCash.cashChangeForCents).toBe(10000);
      expect(validCash.cashChangeAmountCents).toBe(5500);
      expect(validCash.whatsappSummaryText).toContain('Troco:');
    });

    it('deve restringir descontos acima de 20% apenas ao perfil tenant_admin', async () => {
      // Subtotal = R$ 45,00 (4500). 20% = 900. Desconto de R$ 15,00 (1500) = 33.3%
      await expect(
        createQuickOrder(
          TENANT_ID,
          {
            orderChannel: 'counter',
            fulfillmentType: 'pickup',
            scheduleType: 'asap',
            customer: { name: 'Cliente Desconto', phone: '' },
            items: [{ productId: PRODUCT_ID, variantId: VARIANT_ID, quantity: 1 }],
            paymentMethod: 'pos_card',
            markAsPaidNow: true,
            discountCents: 1500,
            confirmImmediately: true,
          },
          { userId: 'bbbb2222-2222-4222-8222-222222222222', role: 'tenant_manager' }
        )
      ).rejects.toThrow(/tenant_admin/i);

      // Com tenant_admin deve permitir e marcar como pago no POS presencial
      const adminApproved = await createQuickOrder(
        TENANT_ID,
        {
          orderChannel: 'counter',
          fulfillmentType: 'pickup',
          scheduleType: 'asap',
          customer: { name: 'Cliente Desconto', phone: '' },
          items: [{ productId: PRODUCT_ID, variantId: VARIANT_ID, quantity: 1 }],
          paymentMethod: 'pos_card',
          markAsPaidNow: true,
          discountCents: 1500,
          confirmImmediately: true,
        },
        { userId: 'aaaa1111-1111-4111-8111-111111111111', role: 'tenant_admin' }
      );

      expect(adminApproved.discountInCents).toBe(1500);
      expect(adminApproved.totalInCents).toBe(3000);
      expect(adminApproved.paymentStatus).toBe('paid');
    });
  });

  describe('4. Resumo Formatado para WhatsApp (formatWhatsAppOrderSummary)', () => {
    it('deve gerar mensagem clara com itens, modalidade, forma de pagamento e link público', () => {
      const msg = formatWhatsAppOrderSummary({
        tenantName: 'BENZA Gastronomia',
        orderNumber: '#000777',
        publicTrackingToken: 'tok_public_999888777666555444333',
        customerName: 'Fernanda Costa',
        fulfillmentType: 'delivery',
        scheduleType: 'asap',
        paymentMethod: 'card_on_delivery',
        paymentStatus: 'pending',
        subtotalInCents: 4500,
        deliveryFeeInCents: 1200,
        discountInCents: 500,
        totalInCents: 5200,
        items: [
          {
            productName: 'Lasanha Bolonhesa',
            variantName: '600g',
            quantity: 1,
            subtotalInCents: 4500,
          },
        ],
        baseUrl: 'https://pecabenza.com.br',
      });

      expect(msg).toContain('*BENZA Gastronomia — Pedido #000777*');
      expect(msg).toContain('1x Lasanha Bolonhesa (600g)');
      expect(msg).toContain('Cartão na Entrega');
      expect(msg).toContain('https://pecabenza.com.br/pedido/tok_public_999888777666555444333');
    });
  });
});
