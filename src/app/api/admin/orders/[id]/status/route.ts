import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminAuthSession } from '@/lib/tenancy/admin-auth';
import { logger } from '@/lib/observability/logger';
import { updateOrderStatus } from '@/modules/orders/orders.service';
import { CanonicalOrderStatus } from '@/modules/orders/order-status.machine';

export const dynamic = 'force-dynamic';

const UpdateStatusSchema = z.object({
  status: z.enum([
    'pending',
    'confirmed',
    'preparing',
    'ready',
    'out_for_delivery',
    'delivered',
    'cancelled',
  ]),
  reason: z.string().trim().max(300).optional(),
  notes: z.string().trim().max(500).optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAdminAuthSession(request);
    if (!session) {
      return NextResponse.json({ error: 'Acesso não autorizado ao painel administrativo.' }, { status: 401 });
    }

    const { id: orderId } = await params;
    if (!orderId) {
      return NextResponse.json({ error: 'ID do pedido é obrigatório.' }, { status: 400 });
    }

    const body = await request.json();
    const parseResult = UpdateStatusSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Dados inválidos.', details: parseResult.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { status, reason, notes } = parseResult.data;

    const result = await updateOrderStatus(
      session.tenant.id,
      orderId,
      status as CanonicalOrderStatus,
      'admin',
      session.user.id,
      {
        reason,
        notes,
        actorEmail: session.user.email,
      }
    );

    logger.info('Status de pedido atualizado via painel admin', {
      tenantId: session.tenant.id,
      orderId,
      toStatus: status,
      actorId: session.user.id,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error: any) {
    logger.warn('Rejeição na atualização de status de pedido', {
      error: error.message,
    });
    return NextResponse.json({ error: error.message || 'Falha ao atualizar status.' }, { status: 400 });
  }
}

