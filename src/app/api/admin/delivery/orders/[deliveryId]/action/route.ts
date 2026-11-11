import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuthSession } from '@/lib/tenancy/admin-auth';
import {
  updateDeliveryStep,
  confirmDeliveryProof,
  recordDeliveryFailure,
  processDeliverySanitaryQuarantine,
} from '@/modules/delivery/delivery.service';
import {
  deliveryStepSchema,
  confirmDeliveryProofSchema,
  recordDeliveryFailureSchema,
} from '@/modules/delivery/delivery.schema';
import { sanitizePlainText } from '@/lib/security/sanitize';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ deliveryId: string }> }
) {
  try {
    const session = await getAdminAuthSession(request);
    if (!session) {
      return NextResponse.json({ error: 'Acesso não autorizado.' }, { status: 401 });
    }

    const { deliveryId } = await params;
    const raw = await request.json();
    const actionType = raw.type;

    if (actionType === 'progress') {
      const parsed = deliveryStepSchema.safeParse({ ...raw, deliveryId });
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.issues[0]?.message || 'Dados inválidos.' },
          { status: 400 }
        );
      }

      const res = await updateDeliveryStep(session.tenant.id, {
        deliveryId: parsed.data.deliveryId,
        toStatus: parsed.data.toStatus,
        source: 'admin',
        actorUserId: session.user.id,
        notes: parsed.data.notes ? sanitizePlainText(parsed.data.notes) : null,
      });

      return NextResponse.json(res, { status: 200 });
    }

    if (actionType === 'confirm_proof') {
      const parsed = confirmDeliveryProofSchema.safeParse({ ...raw, deliveryId });
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.issues[0]?.message || 'Dados inválidos para comprovação.' },
          { status: 400 }
        );
      }

      const res = await confirmDeliveryProof(session.tenant.id, {
        deliveryId: parsed.data.deliveryId,
        recipientName: sanitizePlainText(parsed.data.recipientName),
        relationship: parsed.data.relationship,
        paymentCollected: parsed.data.paymentCollected,
        photoPath: parsed.data.photoPath || null,
        notes: parsed.data.notes ? sanitizePlainText(parsed.data.notes) : null,
        source: 'admin',
        actorUserId: session.user.id,
      });

      return NextResponse.json(res, { status: 200 });
    }

    if (actionType === 'record_failure') {
      const parsed = recordDeliveryFailureSchema.safeParse({ ...raw, deliveryId });
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.issues[0]?.message || 'Dados inválidos para ocorrência.' },
          { status: 400 }
        );
      }

      const res = await recordDeliveryFailure(session.tenant.id, {
        deliveryId: parsed.data.deliveryId,
        action: parsed.data.action,
        failureReason: sanitizePlainText(parsed.data.failureReason),
        source: 'admin',
        actorUserId: session.user.id,
        sendToSanitaryQuarantine: Boolean(raw.sendToSanitaryQuarantine),
      });

      return NextResponse.json(res, { status: 200 });
    }

    if (actionType === 'sanitary_quarantine') {
      const sanitaryAction = raw.sanitaryAction === 'discard_loss' ? 'discard_loss' : 'quarantine';
      const reason = sanitizePlainText(raw.reason || 'Retorno de entrega congelada para inspeção');

      const res = await processDeliverySanitaryQuarantine(session.tenant.id, {
        deliveryId,
        sanitaryAction,
        reason,
        actorUserId: session.user.id,
      });

      return NextResponse.json(res, { status: 200 });
    }

    return NextResponse.json({ error: 'Ação de entrega não reconhecida.' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Falha ao processar ação logística.' },
      { status: 400 }
    );
  }
}

