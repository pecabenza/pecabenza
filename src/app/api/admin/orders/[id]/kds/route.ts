import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminAuthSession } from '@/lib/tenancy/admin-auth';
import { logger } from '@/lib/observability/logger';
import {
  startOrderPreparation,
  updateOrderItemOperationStatus,
  completeOrderPreparation,
} from '@/modules/orders/orders.service';

export const dynamic = 'force-dynamic';

const KdsActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('start_preparation'),
  }),
  z.object({
    action: z.literal('update_item_status'),
    orderItemId: z.string().uuid('ID do item inválido.'),
    status: z.enum(['pending', 'preparing', 'ready']),
  }),
  z.object({
    action: z.literal('complete_preparation'),
  }),
]);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAdminAuthSession(request);
    if (!session) {
      return NextResponse.json(
        { error: 'Acesso não autorizado ao KDS da cozinha.' },
        { status: 401 }
      );
    }

    const { id: orderId } = await params;
    if (!orderId) {
      return NextResponse.json({ error: 'ID do pedido é obrigatório.' }, { status: 400 });
    }

    const body = await request.json();
    const parsed = KdsActionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Ação de KDS inválida.', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const payload = parsed.data;
    const tenantId = session.tenant.id;
    const actorId = session.user.id;

    if (payload.action === 'start_preparation') {
      const result = await startOrderPreparation(tenantId, orderId, actorId);
      logger.info('preparation_started', {
        tenantId,
        orderId,
        actorId,
        eventType: 'preparation_started',
      });
      return NextResponse.json(result, { status: 200 });
    }

    if (payload.action === 'update_item_status') {
      const result = await updateOrderItemOperationStatus(
        tenantId,
        orderId,
        payload.orderItemId,
        payload.status,
        actorId
      );
      if (payload.status === 'ready') {
        logger.info('item_ready', {
          tenantId,
          orderId,
          orderItemId: payload.orderItemId,
          actorId,
          eventType: 'item_ready',
        });
      }
      return NextResponse.json(result, { status: 200 });
    }

    if (payload.action === 'complete_preparation') {
      const result = await completeOrderPreparation(tenantId, orderId, actorId);
      logger.info('order_ready', {
        tenantId,
        orderId,
        actorId,
        eventType: 'order_ready',
      });
      return NextResponse.json(result, { status: 200 });
    }

    return NextResponse.json({ error: 'Ação não suportada.' }, { status: 400 });
  } catch (error: any) {
    logger.warn('Operação KDS rejeitada', {
      error: error.message,
    });
    return NextResponse.json(
      { error: error.message || 'Falha ao executar operação no KDS.' },
      { status: 400 }
    );
  }
}

