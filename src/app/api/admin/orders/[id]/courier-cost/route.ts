import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminAuthSession } from '@/lib/tenancy/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { sanitizePlainText } from '@/lib/security/sanitize';
import { logger } from '@/lib/observability/logger';

export const dynamic = 'force-dynamic';

const CourierCostSchema = z.object({
  actualCourierCostCents: z.number().int().min(0).max(500_000),
  courierProvider: z.enum(['99', 'uber', 'own_driver', 'other']),
  courierActualDistanceMeters: z.number().int().min(0).max(500_000).nullable().optional(),
  courierCostNotes: z.string().trim().max(300).nullable().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAdminAuthSession(request);
    if (!session) {
      return NextResponse.json({ error: 'Acesso não autorizado.' }, { status: 401 });
    }

    const { id: orderId } = await params;
    if (!orderId) {
      return NextResponse.json({ error: 'ID do pedido é obrigatório.' }, { status: 400 });
    }

    const raw = await request.json();
    const parsed = CourierCostSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Dados inválidos de custo de entrega.' },
        { status: 400 }
      );
    }

    const cleanNotes = parsed.data.courierCostNotes
      ? sanitizePlainText(parsed.data.courierCostNotes).slice(0, 300)
      : null;

    const supabase = createAdminClient();
    const { data: rpcData, error: rpcErr } = await supabase.rpc(
      'record_order_courier_cost_atomic',
      {
        p_tenant_id: session.tenant.id,
        p_order_id: orderId,
        p_recorded_by_user_id: session.user.id,
        p_actual_courier_cost_cents: parsed.data.actualCourierCostCents,
        p_courier_provider: parsed.data.courierProvider,
        p_courier_actual_distance_meters: parsed.data.courierActualDistanceMeters ?? null,
        p_courier_cost_notes: cleanNotes,
      }
    );

    if (rpcErr) {
      const isNotFound = rpcErr.message?.includes('ORDER_NOT_FOUND');
      return NextResponse.json(
        { error: rpcErr.message || 'Falha ao registrar custo real.' },
        { status: isNotFound ? 404 : 400 }
      );
    }

    logger.info('Custo real de entrega registrado atomicamente', {
      tenantId: session.tenant.id,
      orderId,
      courierProvider: parsed.data.courierProvider,
      actualCourierCostCents: parsed.data.actualCourierCostCents,
      deliveryFeeCents: rpcData.delivery_fee_cents,
      differenceCents: rpcData.difference_cents,
    });

    return NextResponse.json(
      {
        orderId,
        orderNumber: rpcData.order_number,
        deliveryFeeCents: rpcData.delivery_fee_cents,
        totalCents: rpcData.total_cents,
        actualCourierCostCents: rpcData.actual_courier_cost_cents,
        courierProvider: parsed.data.courierProvider,
        courierActualDistanceMeters: parsed.data.courierActualDistanceMeters ?? null,
        courierCostRecordedAt: rpcData.recorded_at,
        courierCostNotes: cleanNotes,
        differenceCents: rpcData.difference_cents,
      },
      { status: 200 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Erro ao registrar custo real da entrega.' },
      { status: 500 }
    );
  }
}
