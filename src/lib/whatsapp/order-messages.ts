import { formatBrl } from '@/modules/cart/cart.utils';
import {
  PAYMENT_METHOD_LABELS,
  type CanonicalOrderStatus,
  type CanonicalPaymentStatus,
} from '@/modules/orders/order-status.machine';
import { toShortTrackingToken } from '@/modules/orders/tracking-token';
import type { FulfillmentType, OrderPaymentMethod } from '@/types/database.types';

export type WhatsAppMessageStage = 'confirmed' | 'ready' | 'out_for_delivery' | 'delivered';

export type WhatsAppTemplatesMap = Partial<Record<WhatsAppMessageStage, string>>;

export const DEFAULT_WHATSAPP_TEMPLATES: Record<WhatsAppMessageStage, string> = {
  confirmed: [
    'Olá, *{cliente}*! Seu pedido *{pedido}* na *BENZA* foi confirmado! ✅',
    '',
    '*Resumo do pedido:*',
    '{itens}',
    '',
    '*Total:* {total}',
    '{pagamento}',
    '{rastreio}',
  ].join('\n'),
  ready: [
    'Olá, *{cliente}*! Seu pedido *{pedido}* já está *pronto* na *BENZA*! 🍲',
    '',
    '*Total:* {total} — {pagamento}',
    '{rastreio}',
  ].join('\n'),
  out_for_delivery: [
    'Olá, *{cliente}*! Seu pedido *{pedido}* *saiu para entrega*! 🛵💨',
    '',
    '{pagamento}',
    '{rastreio}',
  ].join('\n'),
  delivered: [
    'Olá, *{cliente}*! Confirmamos que seu pedido *{pedido}* foi *entregue*! ✅',
    '',
    'Obrigado por escolher a *BENZA*! Bom apetite e conte sempre com a gente. 🍽️',
  ].join('\n'),
};

export interface WhatsAppOrderMessageInput {
  orderNumber: string;
  customerName: string;
  fulfillmentType: FulfillmentType;
  paymentMethod?: string;
  paymentStatus: CanonicalPaymentStatus;
  cashChangeForCents?: number | null;
  totalCents: number;
  publicTrackingToken?: string;
  originUrl?: string;
  items: Array<{
    snapshot_product_name: string;
    snapshot_variant_name: string;
    quantity: number;
    subtotal_cents: number;
  }>;
}

export function normalizeBrazilianWhatsAppPhone(phone?: string | null): string | null {
  const digits = (phone || '').replace(/\D/g, '');
  if (digits.length < 10) return null;
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    return digits;
  }
  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`;
  }
  return digits;
}

export function buildWhatsAppDeepLink(phone: string | null | undefined, message: string): string | null {
  const normalized = normalizeBrazilianWhatsAppPhone(phone);
  if (!normalized) return null;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}

export function getDefaultWhatsAppStageForStatus(status: CanonicalOrderStatus): WhatsAppMessageStage {
  if (status === 'ready') return 'ready';
  if (status === 'out_for_delivery') return 'out_for_delivery';
  if (status === 'delivered') return 'delivered';
  return 'confirmed';
}

export function buildOrderWhatsAppMessage(
  stage: WhatsAppMessageStage,
  order: WhatsAppOrderMessageInput,
  customTemplates?: WhatsAppTemplatesMap | null
): string {
  const firstName = order.customerName.trim().split(/\s+/)[0] || order.customerName;
  const shortToken = toShortTrackingToken(order.publicTrackingToken);
  const trackingUrl = shortToken
    ? `${(order.originUrl || '').replace(/\/$/, '')}/pedido/${shortToken}`
    : '';
  const trackingLine = trackingUrl ? `Acompanhe aqui: ${trackingUrl}` : '';

  const paymentLabel =
    PAYMENT_METHOD_LABELS[(order.paymentMethod || 'pix') as OrderPaymentMethod] || 'Pix';
  const paymentNote =
    order.paymentStatus === 'paid'
      ? `Pagamento confirmado (${paymentLabel}).`
      : order.paymentMethod === 'cash' && order.cashChangeForCents
      ? `Pagamento na entrega em Dinheiro (troco para ${formatBrl(order.cashChangeForCents)}).`
      : `Pagamento (${paymentLabel}): ${formatBrl(order.totalCents)}.`;

  const itemsLines = order.items
    .map(
      (it) =>
        `• ${it.quantity}x ${it.snapshot_product_name} (${it.snapshot_variant_name}) — ${formatBrl(it.subtotal_cents)}`
    )
    .join('\n');

  const customRaw = customTemplates?.[stage]?.trim();
  const template = customRaw || DEFAULT_WHATSAPP_TEMPLATES[stage];

  return template
    .replace(/\{cliente\}/g, firstName)
    .replace(/\{pedido\}/g, order.orderNumber)
    .replace(/\{total\}/g, formatBrl(order.totalCents))
    .replace(/\{itens\}/g, itemsLines)
    .replace(/\{pagamento\}/g, paymentNote)
    .replace(/\{rastreio\}/g, trackingLine)
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
