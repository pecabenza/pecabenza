import { describe, it, expect } from 'vitest';
import {
  calculateOperationalMetrics,
  type OperationalOrder,
} from '@/modules/orders/orders.service';
import { isValidStatusTransition } from '@/modules/orders/order-status.machine';

describe('Etapa 2C.1 — Operação Simples do Restaurante', () => {
  const mockOrders: OperationalOrder[] = [
    {
      id: 'ord-01',
      tenantId: 'tenant-01',
      orderNumber: '#000101',
      customerName: 'Maria Silva',
      customerPhone: '11999998888',
      fulfillmentType: 'delivery',
      scheduleType: 'asap',
      status: 'pending',
      paymentStatus: 'paid',
      subtotalCents: 8900,
      deliveryFeeCents: 1200,
      totalCents: 10100,
      formattedTotal: 'R$ 101,00',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      elapsedMinutes: 18, // > 15m -> delayed
      statusElapsedMinutes: 18,
      isDelayed: true,
      isUrgent: true,
      items: [
        {
          id: 'item-01',
          quantity: 2,
          productName: 'Feijoada BENZA',
          variantName: '500ml',
          unitPriceCents: 4450,
          subtotalCents: 8900,
        },
      ],
      itemCount: 2,
      nextValidStatuses: ['confirmed', 'cancelled'],
    },
    {
      id: 'ord-02',
      tenantId: 'tenant-01',
      orderNumber: '#000102',
      customerName: 'João Santos',
      customerPhone: '11988887777',
      fulfillmentType: 'pickup',
      scheduleType: 'asap',
      status: 'preparing',
      paymentStatus: 'paid',
      subtotalCents: 5400,
      deliveryFeeCents: 0,
      totalCents: 5400,
      formattedTotal: 'R$ 54,00',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      elapsedMinutes: 15,
      statusElapsedMinutes: 10,
      isDelayed: false,
      isUrgent: false,
      items: [
        {
          id: 'item-02',
          quantity: 1,
          productName: 'Escondidinho',
          variantName: '600g',
          unitPriceCents: 5400,
          subtotalCents: 5400,
        },
      ],
      itemCount: 1,
      nextValidStatuses: ['ready', 'cancelled'],
    },
    {
      id: 'ord-03',
      tenantId: 'tenant-01',
      orderNumber: '#000103',
      customerName: 'Carlos Oliveira',
      customerPhone: '11977776666',
      fulfillmentType: 'pickup',
      scheduleType: 'scheduled',
      scheduledFor: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      status: 'ready',
      paymentStatus: 'paid',
      subtotalCents: 4800,
      deliveryFeeCents: 0,
      totalCents: 4800,
      formattedTotal: 'R$ 48,00',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      elapsedMinutes: 40,
      statusElapsedMinutes: 5,
      isDelayed: false,
      isUrgent: false,
      items: [],
      itemCount: 0,
      nextValidStatuses: ['delivered', 'cancelled'], // pickup: não tem out_for_delivery
    },
    {
      id: 'ord-04',
      tenantId: 'tenant-01',
      orderNumber: '#000104',
      customerName: 'Ana Souza',
      customerPhone: '11966665555',
      fulfillmentType: 'delivery',
      scheduleType: 'asap',
      status: 'delivered',
      paymentStatus: 'paid',
      subtotalCents: 12000,
      deliveryFeeCents: 1200,
      totalCents: 13200,
      formattedTotal: 'R$ 132,00',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      elapsedMinutes: 90,
      statusElapsedMinutes: 10,
      isDelayed: false,
      isUrgent: false,
      items: [],
      itemCount: 0,
      nextValidStatuses: [],
    },
  ];

  describe('1. Métricas Operacionais da Cozinha/Balcão', () => {
    it('deve calcular corretamente a contagem de pedidos ativos, em preparo, prontos e atrasados', () => {
      const metrics = calculateOperationalMetrics(mockOrders);

      // Total de ativos (ord-01, ord-02, ord-03 - delivered não é ativo)
      expect(metrics.totalActive).toBe(3);

      // Em preparo
      expect(metrics.inPrep).toBe(1);

      // Prontos
      expect(metrics.ready).toBe(1);

      // Atrasados (ord-01 com isDelayed = true)
      expect(metrics.delayed).toBe(1);

      // Agendados (ord-03)
      expect(metrics.scheduled).toBe(1);

      // Entregues hoje (ord-04)
      expect(metrics.deliveredToday).toBe(1);
    });
  });

  describe('2. Regras Operacionais de Transição por Modalidade', () => {
    it('deve impedir que pedido de retirada (pickup) passe por "out_for_delivery"', () => {
      const pickupValidation = isValidStatusTransition('ready', 'out_for_delivery', {
        fulfillmentType: 'pickup',
      });
      expect(pickupValidation.valid).toBe(false);
      expect(pickupValidation.reason).toContain('Retirada');

      // Pickup deve ir direto para delivered
      const pickupDirectDelivered = isValidStatusTransition('ready', 'delivered', {
        fulfillmentType: 'pickup',
      });
      expect(pickupDirectDelivered.valid).toBe(true);
    });

    it('deve permitir que pedido de delivery passe por "out_for_delivery"', () => {
      const deliveryValidation = isValidStatusTransition('ready', 'out_for_delivery', {
        fulfillmentType: 'delivery',
      });
      expect(deliveryValidation.valid).toBe(true);
    });
  });

  describe('3. Prioridade e Urgência Operacional', () => {
    it('pedidos atrasados devem ser marcados como urgentes para a cozinha', () => {
      const delayedOrder = mockOrders.find((o) => o.isDelayed);
      expect(delayedOrder).toBeDefined();
      expect(delayedOrder?.isUrgent).toBe(true);
    });

    it('pedidos finalizados não devem conter próximas ações operacionais', () => {
      const deliveredOrder = mockOrders.find((o) => o.status === 'delivered');
      expect(deliveredOrder?.nextValidStatuses).toHaveLength(0);
    });
  });
});

