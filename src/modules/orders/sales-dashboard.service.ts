import { createAdminClient } from '@/lib/supabase/admin';

export interface SalesOrderRow {
  id: string;
  order_number: string;
  status: string;
  payment_status: string;
  payment_method: string | null;
  order_channel: string | null;
  total_cents: number;
  created_at: string;
  customer_name?: string | null;
}

export interface SalesItemRow {
  order_id: string;
  snapshot_product_name: string;
  snapshot_variant_name: string | null;
  quantity: number;
  subtotal_cents: number;
}

export interface ChannelBreakdown {
  channel: string;
  count: number;
  revenueCents: number;
}

export interface PaymentMethodBreakdown {
  method: string;
  count: number;
  revenueCents: number;
}

export interface TopSellingProduct {
  productName: string;
  quantity: number;
  revenueCents: number;
}

export interface SalesDashboardSummary {
  todayCount: number;
  todayRevenueCents: number;
  last7DaysCount: number;
  last7DaysRevenueCents: number;
  last30DaysCount: number;
  last30DaysRevenueCents: number;
  paidRevenueCents: number;
  paidCount: number;
  pendingRevenueCents: number;
  pendingCount: number;
  cancelledCount: number;
  averageTicketCents: number;
  byChannel: ChannelBreakdown[];
  byPaymentMethod: PaymentMethodBreakdown[];
  topProducts: TopSellingProduct[];
  recentOrders: SalesOrderRow[];
}

function getDateKeyInTimezone(date: Date, timeZone = 'America/Sao_Paulo'): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const y = parts.find((p) => p.type === 'year')?.value || '2026';
  const m = parts.find((p) => p.type === 'month')?.value || '01';
  const d = parts.find((p) => p.type === 'day')?.value || '01';
  return `${y}-${m}-${d}`;
}

/**
 * Motor puro de cálculo gerencial para o painel de vendas (C4).
 * Exclui pedidos cancelados dos indicadores de faturamento e ticket médio,
 * contabilizando cancelamentos separadamente para transparência operacional.
 */
export function computeSalesDashboardSummary(
  orders: SalesOrderRow[],
  items: SalesItemRow[] = [],
  now: Date = new Date(),
  timeZone = 'America/Sao_Paulo'
): SalesDashboardSummary {
  const todayKey = getDateKeyInTimezone(now, timeZone);
  const cutoff7d = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  const cutoff30d = now.getTime() - 30 * 24 * 60 * 60 * 1000;

  let todayCount = 0;
  let todayRevenueCents = 0;
  let last7DaysCount = 0;
  let last7DaysRevenueCents = 0;
  let last30DaysCount = 0;
  let last30DaysRevenueCents = 0;
  let paidRevenueCents = 0;
  let paidCount = 0;
  let pendingRevenueCents = 0;
  let pendingCount = 0;
  let cancelledCount = 0;

  const validOrderIds = new Set<string>();
  const channelMap = new Map<string, ChannelBreakdown>();
  const methodMap = new Map<string, PaymentMethodBreakdown>();

  for (const order of orders) {
    const total = Math.max(0, Number(order.total_cents || 0));
    const createdAtDate = new Date(order.created_at);
    const createdMs = createdAtDate.getTime();

    if (order.status === 'cancelled') {
      if (createdMs >= cutoff30d) {
        cancelledCount += 1;
      }
      continue;
    }

    if (createdMs < cutoff30d) {
      continue;
    }

    validOrderIds.add(order.id);
    last30DaysCount += 1;
    last30DaysRevenueCents += total;

    if (createdMs >= cutoff7d) {
      last7DaysCount += 1;
      last7DaysRevenueCents += total;
    }

    if (getDateKeyInTimezone(createdAtDate, timeZone) === todayKey) {
      todayCount += 1;
      todayRevenueCents += total;
    }

    if (order.payment_status === 'paid') {
      paidCount += 1;
      paidRevenueCents += total;
    } else {
      pendingCount += 1;
      pendingRevenueCents += total;
    }

    const ch = order.order_channel || 'website';
    const prevCh = channelMap.get(ch) || { channel: ch, count: 0, revenueCents: 0 };
    prevCh.count += 1;
    prevCh.revenueCents += total;
    channelMap.set(ch, prevCh);

    const pm = order.payment_method || 'pix';
    const prevPm = methodMap.get(pm) || { method: pm, count: 0, revenueCents: 0 };
    prevPm.count += 1;
    prevPm.revenueCents += total;
    methodMap.set(pm, prevPm);
  }

  const productMap = new Map<string, TopSellingProduct>();
  for (const item of items) {
    if (!validOrderIds.has(item.order_id)) continue;
    const name = item.snapshot_product_name || 'Prato';
    const prev = productMap.get(name) || { productName: name, quantity: 0, revenueCents: 0 };
    prev.quantity += Number(item.quantity || 0);
    prev.revenueCents += Math.max(0, Number(item.subtotal_cents || 0));
    productMap.set(name, prev);
  }

  const averageTicketCents =
    last30DaysCount > 0 ? Math.round(last30DaysRevenueCents / last30DaysCount) : 0;

  return {
    todayCount,
    todayRevenueCents,
    last7DaysCount,
    last7DaysRevenueCents,
    last30DaysCount,
    last30DaysRevenueCents,
    paidRevenueCents,
    paidCount,
    pendingRevenueCents,
    pendingCount,
    cancelledCount,
    averageTicketCents,
    byChannel: Array.from(channelMap.values()).sort((a, b) => b.revenueCents - a.revenueCents),
    byPaymentMethod: Array.from(methodMap.values()).sort((a, b) => b.revenueCents - a.revenueCents),
    topProducts: Array.from(productMap.values())
      .sort((a, b) => b.quantity - a.quantity || b.revenueCents - a.revenueCents)
      .slice(0, 5),
    recentOrders: orders.slice(0, 5),
  };
}

export async function getTenantSalesDashboardSummary(
  tenantId: string
): Promise<SalesDashboardSummary> {
  const supabase = createAdminClient();
  const sinceIso = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();

  const { data: orders, error: ordersErr } = await supabase
    .from('orders')
    .select(
      'id, order_number, status, payment_status, payment_method, order_channel, total_cents, created_at, customer_name'
    )
    .eq('tenant_id', tenantId)
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false })
    .limit(500);

  if (ordersErr || !orders) {
    return computeSalesDashboardSummary([], []);
  }

  const validIds = orders.filter((o) => o.status !== 'cancelled').map((o) => o.id);
  let items: SalesItemRow[] = [];

  if (validIds.length > 0) {
    const { data: itemRows } = await supabase
      .from('order_items')
      .select('order_id, snapshot_product_name, snapshot_variant_name, quantity, subtotal_cents')
      .eq('tenant_id', tenantId)
      .in('order_id', validIds.slice(0, 300));
    if (itemRows) {
      items = itemRows as SalesItemRow[];
    }
  }

  return computeSalesDashboardSummary(orders as SalesOrderRow[], items);
}

