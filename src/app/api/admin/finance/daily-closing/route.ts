import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuthSession } from '@/lib/tenancy/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { PAYMENT_METHOD_LABELS } from '@/modules/orders/order-status.machine';

export const dynamic = 'force-dynamic';

function getTodayBrazilIso(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

export async function GET(request: NextRequest) {
  try {
    const session = await getAdminAuthSession(request);
    if (!session) {
      return NextResponse.json({ error: 'Acesso não autorizado.' }, { status: 401 });
    }
    if (session.role !== 'tenant_admin') {
      return NextResponse.json(
        { error: 'Módulo financeiro restrito a administradores.' },
        { status: 403 }
      );
    }

    const rawDate = request.nextUrl.searchParams.get('date') || getTodayBrazilIso();
    const targetDate = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : getTodayBrazilIso();

    const startIso = `${targetDate}T00:00:00.000-03:00`;
    const endIso = `${targetDate}T23:59:59.999-03:00`;

    const supabase = createAdminClient();

    const [{ data: orders, error: ordersErr }, { data: financeRows }] = await Promise.all([
      supabase
        .from('orders')
        .select(
          'id, order_number, total_cents, delivery_fee_cents, discount_cents, payment_method, payment_status, status, created_at'
        )
        .eq('tenant_id', session.tenant.id)
        .neq('status', 'cancelled')
        .gte('created_at', startIso)
        .lte('created_at', endIso)
        .order('created_at', { ascending: true }),
      supabase
        .from('finance_entries')
        .select('entry_type, status, amount_cents')
        .eq('tenant_id', session.tenant.id)
        .eq('occurred_on', targetDate)
        .eq('entry_type', 'expense'),
    ]);

    if (ordersErr) {
      return NextResponse.json(
        { error: `Erro ao consultar vendas do dia: ${ordersErr.message}` },
        { status: 500 }
      );
    }

    const validOrders = orders || [];
    const orderIds = validOrders.map((o) => o.id);

    let itemsRows: Array<{
      order_id: string;
      snapshot_product_name: string;
      snapshot_variant_name: string | null;
      quantity: number;
      subtotal_cents: number;
    }> = [];

    if (orderIds.length > 0) {
      const { data: itemsData, error: itemsErr } = await supabase
        .from('order_items')
        .select('order_id, snapshot_product_name, snapshot_variant_name, quantity, subtotal_cents')
        .in('order_id', orderIds);

      if (itemsErr) {
        return NextResponse.json(
          { error: `Erro ao consultar itens vendidos: ${itemsErr.message}` },
          { status: 500 }
        );
      }
      itemsRows = itemsData || [];
    }

    let totalSalesCents = 0;
    let paidSalesCents = 0;
    let pendingSalesCents = 0;
    let paidOrdersCount = 0;
    let pendingOrdersCount = 0;
    let deliveryFeesCents = 0;
    let discountsCents = 0;

    const methodMap = new Map<
      string,
      { method: string; label: string; count: number; totalCents: number; paidCents: number }
    >();

    for (const o of validOrders) {
      const total = o.total_cents || 0;
      totalSalesCents += total;
      deliveryFeesCents += o.delivery_fee_cents || 0;
      discountsCents += o.discount_cents || 0;

      const isPaid = o.payment_status === 'paid';
      if (isPaid) {
        paidSalesCents += total;
        paidOrdersCount += 1;
      } else {
        pendingSalesCents += total;
        pendingOrdersCount += 1;
      }

      const methodKey = o.payment_method || 'other';
      const label =
        PAYMENT_METHOD_LABELS[methodKey as keyof typeof PAYMENT_METHOD_LABELS] || methodKey;
      const existing = methodMap.get(methodKey) || {
        method: methodKey,
        label,
        count: 0,
        totalCents: 0,
        paidCents: 0,
      };
      existing.count += 1;
      existing.totalCents += total;
      if (isPaid) existing.paidCents += total;
      methodMap.set(methodKey, existing);
    }

    const productMap = new Map<
      string,
      { productName: string; variantName: string; quantity: number; totalCents: number }
    >();
    let totalItemsQuantity = 0;

    for (const it of itemsRows) {
      const qty = it.quantity || 0;
      totalItemsQuantity += qty;
      const variant = (it.snapshot_variant_name || '').trim();
      const key = `${it.snapshot_product_name}__${variant}`;
      const existing = productMap.get(key) || {
        productName: it.snapshot_product_name,
        variantName: variant,
        quantity: 0,
        totalCents: 0,
      };
      existing.quantity += qty;
      existing.totalCents += it.subtotal_cents || 0;
      productMap.set(key, existing);
    }

    const byProduct = Array.from(productMap.values()).sort(
      (a, b) => b.quantity - a.quantity || b.totalCents - a.totalCents
    );
    const byPaymentMethod = Array.from(methodMap.values()).sort(
      (a, b) => b.totalCents - a.totalCents
    );

    let expensesPaidCents = 0;
    let expensesPendingCents = 0;
    for (const exp of financeRows || []) {
      if (exp.status === 'paid') expensesPaidCents += exp.amount_cents || 0;
      else expensesPendingCents += exp.amount_cents || 0;
    }

    return NextResponse.json(
      {
        date: targetDate,
        tenantName: session.tenant.name,
        ordersCount: validOrders.length,
        paidOrdersCount,
        pendingOrdersCount,
        totalItemsQuantity,
        totalSalesCents,
        paidSalesCents,
        pendingSalesCents,
        deliveryFeesCents,
        discountsCents,
        expensesPaidCents,
        expensesPendingCents,
        netCashDayCents: paidSalesCents - expensesPaidCents,
        byPaymentMethod,
        byProduct,
      },
      { status: 200 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Erro ao gerar fechamento do dia.' },
      { status: 500 }
    );
  }
}

