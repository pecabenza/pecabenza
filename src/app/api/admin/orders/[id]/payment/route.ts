import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminAuthSession } from '@/lib/tenancy/admin-auth';
import { logger } from '@/lib/observability/logger';
import { confirmManualOrderPayment } from '@/modules/orders/orders.service';
import { PaymentService } from '@/modules/payments/payment.service';
import type { OrderPaymentMethod } from '@/types/database.types';

export const dynamic = 'force-dynamic';

const PaymentActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('generate_pix'),
  }),
  z.object({
    action: z.literal('confirm_manual'),
    paymentMethod: z
      .enum(['pix', 'cash', 'card_on_delivery', 'pos_card', 'credit_card'])
      .optional(),
    notes: z.string().trim().max(300).optional(),
  }),
]);

export async function POST(
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

    const body = await request.json();
    const parsed = PaymentActionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Ação de pagamento inválida.', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const data = parsed.data;

    if (data.action === 'generate_pix') {
      const pixResult = await PaymentService.createPixPayment(session.tenant.id, orderId);
      return NextResponse.json({ success: true, pixPayment: pixResult }, { status: 200 });
    }

    const confirmResult = await confirmManualOrderPayment(
      session.tenant.id,
      orderId,
      {
        paymentMethod: data.paymentMethod as OrderPaymentMethod | undefined,
        notes: data.notes,
      },
      {
        userId: session.user.id,
        role: session.role,
        email: session.user.email,
      }
    );

    logger.info('Pagamento manual confirmado pelo operador', {
      tenantId: session.tenant.id,
      orderId,
      actorId: session.user.id,
      paymentMethod: confirmResult.payment_method,
    });

    return NextResponse.json(confirmResult, { status: 200 });
  } catch (error: any) {
    logger.warn('Falha em ação financeira de pedido no painel admin', {
      error: error.message,
    });
    return NextResponse.json(
      { error: error.message || 'Falha ao processar ação de pagamento.' },
      { status: 400 }
    );
  }
}

