export type CanonicalOrderStatus =
  | 'pending'
  | 'confirmed'
  | 'preparing'
  | 'ready'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled';

export type CanonicalPaymentStatus =
  | 'pending'
  | 'processing'
  | 'paid'
  | 'failed'
  | 'expired'
  | 'cancelled'
  | 'refunded';

export type StatusEventSource =
  | 'system'
  | 'admin'
  | 'payment_webhook'
  | 'delivery_provider'
  | 'driver';

/**
 * Matriz estrita de transições de status de pedidos no SysFood.
 * Define a máquina de estados canônica do e-commerce/restaurante.
 */
export const ALLOWED_STATUS_TRANSITIONS: Record<CanonicalOrderStatus, CanonicalOrderStatus[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['preparing', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready: ['out_for_delivery', 'delivered', 'cancelled'],
  out_for_delivery: ['delivered', 'cancelled'],
  delivered: [], // Estado terminal
  cancelled: [], // Estado terminal
};

export interface ValidateTransitionOptions {
  fulfillmentType?: 'delivery' | 'pickup';
}

/**
 * Validador da máquina de estados comercial e operacional.
 */
export function isValidStatusTransition(
  fromStatus: CanonicalOrderStatus,
  toStatus: CanonicalOrderStatus,
  options?: ValidateTransitionOptions
): { valid: boolean; reason?: string } {
  // Transição para o mesmo status é idempotente / no-op
  if (fromStatus === toStatus) {
    return { valid: true };
  }

  // Verifica se o status atual permite transições
  const allowedNext = ALLOWED_STATUS_TRANSITIONS[fromStatus];
  if (!allowedNext || allowedNext.length === 0) {
    return {
      valid: false,
      reason: `O pedido já está no status terminal '${fromStatus}' e não pode mais ser alterado.`,
    };
  }

  // Regra específica de modalidade de retirada (pickup)
  if (options?.fulfillmentType === 'pickup' && toStatus === 'out_for_delivery') {
    return {
      valid: false,
      reason: "Pedidos na modalidade Retirada (pickup) não passam por 'saiu para entrega'; transicione diretamente para 'entregue'.",
    };
  }

  if (!allowedNext.includes(toStatus)) {
    return {
      valid: false,
      reason: `Transição inválida de '${fromStatus}' para '${toStatus}'. Transições permitidas: ${allowedNext.join(', ')}.`,
    };
  }

  return { valid: true };
}

/**
 * Descrições amigáveis voltadas para exibição na timeline pública e no painel administrativo
 */
export const ORDER_STATUS_LABELS: Record<CanonicalOrderStatus, string> = {
  pending: 'Aguardando Confirmação',
  confirmed: 'Pedido Confirmado',
  preparing: 'Em Preparação',
  ready: 'Pronto',
  out_for_delivery: 'Saiu para Entrega',
  delivered: 'Entregue',
  cancelled: 'Cancelado',
};

export const PAYMENT_STATUS_LABELS: Record<CanonicalPaymentStatus, string> = {
  pending: 'Pendente',
  processing: 'Processando',
  paid: 'Pago',
  failed: 'Falhou',
  expired: 'Expirado',
  cancelled: 'Cancelado',
  refunded: 'Estornado',
};

