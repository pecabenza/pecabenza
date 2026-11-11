import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/security/rate-limit';
import {
  getDriverPortalByToken,
  updateDeliveryStep,
  confirmDeliveryProof,
  recordDeliveryFailure,
  toggleRunLocationSharingByToken,
  recordDriverLocationPingByToken,
} from '@/modules/delivery/delivery.service';
import {
  deliveryStepSchema,
  confirmDeliveryProofSchema,
  recordDeliveryFailureSchema,
  toggleLocationSharingSchema,
  locationPingSchema,
} from '@/modules/delivery/delivery.schema';
import { sanitizePlainText } from '@/lib/security/sanitize';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    if (!token || token.trim().length < 24) {
      return NextResponse.json({ error: 'Token de rota inválido.' }, { status: 400 });
    }

    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'anonymous';
    const rateLimit = await checkRateLimit(clientIp, {
      limit: 120,
      windowSeconds: 60,
      prefix: 'driver_portal_action',
    });

    if (!rateLimit.success) {
      return NextResponse.json(
        { error: 'Limite de requisições excedido. Aguarde alguns segundos.' },
        { status: 429 }
      );
    }

    const portal = await getDriverPortalByToken(token);
    if (!portal) {
      return NextResponse.json({ error: 'Rota não localizada.' }, { status: 404 });
    }
    if (portal.expired || !portal.tenantId) {
      return NextResponse.json(
        { error: portal.reason || 'Esta rota já foi encerrada.' },
        { status: 410 }
      );
    }

    const raw = await request.json();
    const actionType = raw.type;

    if (actionType === 'toggle_location') {
      const parsed = toggleLocationSharingSchema.safeParse(raw);
      if (!parsed.success) {
        return NextResponse.json({ error: 'Parâmetro de consentimento inválido.' }, { status: 400 });
      }
      const res = await toggleRunLocationSharingByToken(token, parsed.data.enabled);
      return NextResponse.json(res, { status: 200 });
    }

    if (actionType === 'ping_location') {
      const parsed = locationPingSchema.safeParse(raw);
      if (!parsed.success) {
        return NextResponse.json({ error: 'Coordenadas de localização inválidas.' }, { status: 400 });
      }
      const res = await recordDriverLocationPingByToken(token, {
        latitude: parsed.data.latitude,
        longitude: parsed.data.longitude,
        accuracyMeters: parsed.data.accuracyMeters ?? null,
      });
      return NextResponse.json(res, { status: 200 });
    }

    // Para ações em entregas específicas, valida escopo estrito da rota do token
    const deliveryId = raw.deliveryId as string;
    const stopInRun = portal.stops?.find((s) => s.deliveryId === deliveryId);
    if (!stopInRun) {
      return NextResponse.json(
        { error: 'Esta entrega não pertence ao romaneio autorizado pelo seu link.' },
        { status: 403 }
      );
    }

    if (actionType === 'progress') {
      const parsed = deliveryStepSchema.safeParse(raw);
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.issues[0]?.message || 'Dados inválidos.' },
          { status: 400 }
        );
      }

      const res = await updateDeliveryStep(portal.tenantId, {
        deliveryId: parsed.data.deliveryId,
        toStatus: parsed.data.toStatus,
        source: 'driver',
        notes: parsed.data.notes ? sanitizePlainText(parsed.data.notes) : null,
      });
      return NextResponse.json(res, { status: 200 });
    }

    if (actionType === 'confirm_proof') {
      const parsed = confirmDeliveryProofSchema.safeParse(raw);
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.issues[0]?.message || 'Informe quem recebeu o pedido.' },
          { status: 400 }
        );
      }

      const res = await confirmDeliveryProof(portal.tenantId, {
        deliveryId: parsed.data.deliveryId,
        recipientName: sanitizePlainText(parsed.data.recipientName),
        relationship: parsed.data.relationship,
        paymentCollected: parsed.data.paymentCollected,
        photoPath: parsed.data.photoPath || null,
        notes: parsed.data.notes ? sanitizePlainText(parsed.data.notes) : null,
        source: 'driver',
      });
      return NextResponse.json(res, { status: 200 });
    }

    if (actionType === 'record_failure') {
      const parsed = recordDeliveryFailureSchema.safeParse(raw);
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.issues[0]?.message || 'Motivo da ocorrência é obrigatório.' },
          { status: 400 }
        );
      }

      const res = await recordDeliveryFailure(portal.tenantId, {
        deliveryId: parsed.data.deliveryId,
        action: parsed.data.action,
        failureReason: sanitizePlainText(parsed.data.failureReason),
        source: 'driver',
      });
      return NextResponse.json(res, { status: 200 });
    }

    return NextResponse.json({ error: 'Ação de entregador inválida.' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Erro ao processar ação do entregador.' },
      { status: 400 }
    );
  }
}

