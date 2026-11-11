import type { OperationalOrder } from '@/modules/orders/orders.service';
import type { CanonicalOrderStatus } from '@/modules/orders/order-status.machine';
import { formatBrl } from '@/modules/cart/cart.utils';

/**
 * Converte o payload retornado por `GET /api/admin/orders/[id]` no formato `OperationalOrder`
 * esperado por `OrderPrintModal`, evitando duplicação entre `/admin/pedidos` e `/admin/pedidos/[id]`.
 */
export function mapOrderDetailToOperationalOrder(detail: any): OperationalOrder {
  const items = Array.isArray(detail.items) ? detail.items : [];
  const itemCount = items.reduce((acc: number, it: any) => acc + Number(it.quantity || 0), 0);

  return {
    id: detail.id,
    tenantId: detail.tenant_id,
    orderNumber: detail.order_number,
    publicTrackingToken: detail.public_tracking_token,
    orderChannel: detail.order_channel || 'website',
    customerName: detail.customer_name,
    customerPhone: detail.customer_phone || '',
    customerEmail: detail.customer_email || null,
    fulfillmentType: detail.fulfillment_type,
    scheduleType: detail.schedule_type || 'asap',
    scheduledFor: detail.scheduled_for || null,
    preparationDueAt: detail.preparation_due_at || null,
    status: detail.status as CanonicalOrderStatus,
    paymentMethod: detail.payment_method || 'pix',
    paymentStatus: detail.payment_status || 'pending',
    cashChangeForCents: detail.cash_change_for_cents ?? null,
    subtotalCents: Number(detail.subtotal_cents || 0),
    deliveryFeeCents: Number(detail.delivery_fee_cents || 0),
    discountCents: Number(detail.discount_cents || 0),
    totalCents: Number(detail.total_cents || 0),
    formattedTotal: formatBrl(Number(detail.total_cents || 0)),
    notes: detail.notes || null,
    createdByUserId: detail.created_by_user_id || null,
    createdAt: detail.created_at,
    updatedAt: detail.updated_at || detail.created_at,
    elapsedMinutes: 0,
    statusElapsedMinutes: 0,
    isDelayed: false,
    isUrgent: false,
    items: items.map((it: any) => ({
      id: it.id,
      quantity: Number(it.quantity || 1),
      productName: it.snapshot_product_name || 'Item',
      variantName: it.snapshot_variant_name || '',
      unitPriceCents: Number(it.unit_price_cents || 0),
      subtotalCents: Number(it.subtotal_cents || 0),
    })),
    itemCount,
    address: detail.address
      ? {
          street: detail.address.street,
          number: detail.address.number,
          complement: detail.address.complement || null,
          neighborhood: detail.address.neighborhood,
          city: detail.address.city,
          state: detail.address.state,
          reference: detail.address.reference || null,
        }
      : null,
    nextValidStatuses: [],
  };
}

