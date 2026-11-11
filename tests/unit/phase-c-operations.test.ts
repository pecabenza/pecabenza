import { describe, it, expect } from 'vitest';
import { mapOrderDetailToOperationalOrder } from '../../src/components/admin/orders/order-print-adapter';
import { computeSalesDashboardSummary } from '../../src/modules/orders/sales-dashboard.service';

describe('Fase C — C3: Adaptador de Impressão Térmica para Pedidos Administrativos', () => {
  it('deve converter detalhe completo do pedido para o formato OperationalOrder imprimível', () => {
    const order = mapOrderDetailToOperationalOrder({
      id: 'ord-1',
      tenant_id: 'ten-1',
      order_number: '#000410',
      public_tracking_token: 'tok-123',
      order_channel: 'whatsapp',
      customer_name: 'Maria Oliveira',
      customer_phone: '(11) 99999-1111',
      fulfillment_type: 'delivery',
      schedule_type: 'asap',
      status: 'confirmed',
      payment_method: 'cash',
      payment_status: 'pending',
      cash_change_for_cents: 10000,
      subtotal_cents: 4800,
      delivery_fee_cents: 1200,
      discount_cents: 0,
      total_cents: 6000,
      notes: 'Sem pimenta',
      created_at: '2026-11-10T15:00:00.000Z',
      items: [
        {
          id: 'it-1',
          snapshot_product_name: 'Feijoada BENZA',
          snapshot_variant_name: '500 ml (Individual farto)',
          quantity: 1,
          unit_price_cents: 4800,
          subtotal_cents: 4800,
        },
      ],
      address: {
        street: 'Rua das Flores',
        number: '100',
        complement: 'Apto 4',
        neighborhood: 'Pinheiros',
        city: 'São Paulo',
        state: 'SP',
        reference: 'Portão preto',
      },
    });

    expect(order.orderNumber).toBe('#000410');
    expect(order.orderChannel).toBe('whatsapp');
    expect(order.paymentMethod).toBe('cash');
    expect(order.cashChangeForCents).toBe(10000);
    expect(order.itemCount).toBe(1);
    expect(order.formattedTotal).toContain('60,00');
    expect(order.address?.street).toBe('Rua das Flores');
    expect(order.items[0].productName).toBe('Feijoada BENZA');
  });
});

describe('Fase C — C4: Painel Gerencial de Vendas, Faturamento, Ticket Médio e Canais', () => {
  it('deve calcular pedidos do dia, pago vs pendente, ticket médio, canais e top pratos excluindo cancelados', () => {
    const now = new Date('2026-11-10T18:00:00.000Z'); // 15:00 BRT em 2026-11-10

    const orders = [
      {
        id: 'o1',
        order_number: '#0001',
        status: 'delivered',
        payment_status: 'paid',
        payment_method: 'cash',
        order_channel: 'website',
        total_cents: 6000,
        created_at: '2026-11-10T16:00:00.000Z', // Hoje
      },
      {
        id: 'o2',
        order_number: '#0002',
        status: 'confirmed',
        payment_status: 'pending',
        payment_method: 'card_on_delivery',
        order_channel: 'whatsapp',
        total_cents: 9800,
        created_at: '2026-11-10T17:00:00.000Z', // Hoje
      },
      {
        id: 'o3',
        order_number: '#0003',
        status: 'delivered',
        payment_status: 'paid',
        payment_method: 'cash',
        order_channel: 'counter',
        total_cents: 4600,
        created_at: '2026-11-08T14:00:00.000Z', // 2 dias atrás
      },
      {
        id: 'o4',
        order_number: '#0004',
        status: 'cancelled',
        payment_status: 'unpaid',
        payment_method: 'pix',
        order_channel: 'website',
        total_cents: 15000,
        created_at: '2026-11-10T15:30:00.000Z', // Cancelado não entra na receita
      },
    ];

    const items = [
      { order_id: 'o1', snapshot_product_name: 'Feijoada BENZA', snapshot_variant_name: '500 ml', quantity: 1, subtotal_cents: 4800 },
      { order_id: 'o2', snapshot_product_name: 'Rabada BENZA', snapshot_variant_name: '1000 g', quantity: 1, subtotal_cents: 9800 },
      { order_id: 'o3', snapshot_product_name: 'Lasanha Tradicional', snapshot_variant_name: '500 ml', quantity: 1, subtotal_cents: 4600 },
      { order_id: 'o4', snapshot_product_name: 'Escondidinho BENZA', snapshot_variant_name: '500 g', quantity: 2, subtotal_cents: 8800 },
    ];

    const summary = computeSalesDashboardSummary(orders, items, now);

    expect(summary.todayCount).toBe(2);
    expect(summary.todayRevenueCents).toBe(15800);
    expect(summary.last7DaysCount).toBe(3);
    expect(summary.last30DaysCount).toBe(3);
    expect(summary.cancelledCount).toBe(1);

    expect(summary.paidCount).toBe(2);
    expect(summary.paidRevenueCents).toBe(10600);
    expect(summary.pendingCount).toBe(1);
    expect(summary.pendingRevenueCents).toBe(9800);

    // (6000 + 9800 + 4600) / 3 = 6800
    expect(summary.averageTicketCents).toBe(6800);

    expect(summary.byChannel.find((c) => c.channel === 'whatsapp')?.revenueCents).toBe(9800);
    expect(summary.byChannel.find((c) => c.channel === 'website')?.revenueCents).toBe(6000);
    expect(summary.byPaymentMethod.find((m) => m.method === 'cash')?.count).toBe(2);

    // Item do pedido cancelado não deve entrar no topProducts
    expect(summary.topProducts.some((p) => p.productName === 'Escondidinho BENZA')).toBe(false);
    expect(summary.topProducts).toHaveLength(3);
  });
});

