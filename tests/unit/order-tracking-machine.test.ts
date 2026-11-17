import { describe, it, expect } from 'vitest';
import {
  isValidStatusTransition,
  ALLOWED_STATUS_TRANSITIONS,
  ORDER_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
} from '@/modules/orders/order-status.machine';
import { getPublicOrderTracking } from '@/modules/orders/orders.service';
import {
  generateShortTrackingToken,
  isValidPublicTrackingToken,
} from '@/modules/orders/tracking-token';

describe('Etapa 2C — Máquina de Estados e Acompanhamento Seguro de Pedidos', () => {
  describe('1. Validações da Máquina de Estados (State Machine)', () => {
    it('deve aceitar transições operacionais canônicas sequenciais válidas', () => {
      // pending -> confirmed
      expect(isValidStatusTransition('pending', 'confirmed').valid).toBe(true);

      // confirmed -> preparing
      expect(isValidStatusTransition('confirmed', 'preparing').valid).toBe(true);

      // preparing -> ready
      expect(isValidStatusTransition('preparing', 'ready').valid).toBe(true);

      // ready -> out_for_delivery (quando delivery)
      expect(isValidStatusTransition('ready', 'out_for_delivery', { fulfillmentType: 'delivery' }).valid).toBe(true);

      // out_for_delivery -> delivered
      expect(isValidStatusTransition('out_for_delivery', 'delivered').valid).toBe(true);
    });

    it('deve permitir transição direta de ready para delivered quando modalidade for retirada (pickup)', () => {
      expect(isValidStatusTransition('ready', 'delivered', { fulfillmentType: 'pickup' }).valid).toBe(true);
    });

    it('deve REJEITAR transição para out_for_delivery quando modalidade for retirada (pickup)', () => {
      const result = isValidStatusTransition('ready', 'out_for_delivery', { fulfillmentType: 'pickup' });
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Retirada');
    });

    it('deve permitir cancelamento a partir de estados não-terminais', () => {
      expect(isValidStatusTransition('pending', 'cancelled').valid).toBe(true);
      expect(isValidStatusTransition('confirmed', 'cancelled').valid).toBe(true);
      expect(isValidStatusTransition('preparing', 'cancelled').valid).toBe(true);
      expect(isValidStatusTransition('ready', 'cancelled').valid).toBe(true);
      expect(isValidStatusTransition('out_for_delivery', 'cancelled').valid).toBe(true);
    });

    it('deve REJEITAR transições a partir de estados terminais (delivered ou cancelled)', () => {
      // delivered não pode voltar para preparing ou ready
      expect(isValidStatusTransition('delivered', 'preparing').valid).toBe(false);
      expect(isValidStatusTransition('delivered', 'cancelled').valid).toBe(false);

      // cancelled não pode voltar para ready ou delivered
      expect(isValidStatusTransition('cancelled', 'ready').valid).toBe(false);
      expect(isValidStatusTransition('cancelled', 'confirmed').valid).toBe(false);
    });

    it('deve REJEITAR saltos ilegítimos no fluxo (ex: pending direto para delivered)', () => {
      const jumpToDelivered = isValidStatusTransition('pending', 'delivered');
      expect(jumpToDelivered.valid).toBe(false);
      expect(jumpToDelivered.reason).toContain('Transição inválida');

      const jumpToReady = isValidStatusTransition('pending', 'ready');
      expect(jumpToReady.valid).toBe(false);
    });

    it('deve tratar transição para o mesmo status como válida e idempotente', () => {
      expect(isValidStatusTransition('preparing', 'preparing').valid).toBe(true);
      expect(isValidStatusTransition('confirmed', 'confirmed').valid).toBe(true);
    });
  });

  describe('2. Rótulos e Dicionário de Status', () => {
    it('deve conter rótulos humanizados em português para todos os status canônicos', () => {
      expect(ORDER_STATUS_LABELS.pending).toBe('Aguardando Confirmação');
      expect(ORDER_STATUS_LABELS.confirmed).toBe('Pedido Confirmado');
      expect(ORDER_STATUS_LABELS.preparing).toBe('Em Preparação');
      expect(ORDER_STATUS_LABELS.ready).toBe('Pronto');
      expect(ORDER_STATUS_LABELS.out_for_delivery).toBe('Saiu para Entrega');
      expect(ORDER_STATUS_LABELS.delivered).toBe('Entregue');
      expect(ORDER_STATUS_LABELS.cancelled).toBe('Cancelado');

      expect(PAYMENT_STATUS_LABELS.paid).toBe('Pago');
      expect(PAYMENT_STATUS_LABELS.pending).toBe('Pendente');
    });
  });

  describe('3. Proteção e Segurança do Token de Rastreio Público', () => {
    it('deve rejeitar tokens vazios, curtos ou inválidos', async () => {
      expect(await getPublicOrderTracking('')).toBeNull();
      expect(await getPublicOrderTracking('12345')).toBeNull();
      expect(await getPublicOrderTracking('token com espaco')).toBeNull();
      expect(await getPublicOrderTracking(null as any)).toBeNull();
    });

    it('deve gerar token curto de 10 caracteres sem caracteres ambíguos e aceitar tokens curtos e legados', () => {
      const shortToken = generateShortTrackingToken();
      expect(shortToken).toHaveLength(10);
      expect(isValidPublicTrackingToken(shortToken)).toBe(true);
      expect(/[0O1IL]/.test(shortToken)).toBe(false);

      const legacyHexToken = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6';
      expect(isValidPublicTrackingToken(legacyHexToken)).toBe(true);
      expect(isValidPublicTrackingToken('curto')).toBe(false);
    });
  });
});

