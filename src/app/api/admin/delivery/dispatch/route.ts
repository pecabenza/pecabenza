import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuthSession } from '@/lib/tenancy/admin-auth';
import {
  getDispatchBoardData,
  dispatchDeliveryRun,
} from '@/modules/delivery/delivery.service';
import { dispatchRunSchema } from '@/modules/delivery/delivery.schema';
import { sanitizePlainText } from '@/lib/security/sanitize';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const session = await getAdminAuthSession(request);
    if (!session) {
      return NextResponse.json({ error: 'Acesso não autorizado.' }, { status: 401 });
    }

    const data = await getDispatchBoardData(session.tenant.id);
    return NextResponse.json(data, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Erro ao carregar painel de expedição.' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAdminAuthSession(request);
    if (!session) {
      return NextResponse.json({ error: 'Acesso não autorizado.' }, { status: 401 });
    }

    const raw = await request.json();
    const parsed = dispatchRunSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Dados inválidos para despacho.' },
        { status: 400 }
      );
    }

    const origin = request.headers.get('origin') || `${request.nextUrl.protocol}//${request.nextUrl.host}`;

    const result = await dispatchDeliveryRun(session.tenant.id, {
      driverId: parsed.data.driverId,
      orderIds: parsed.data.orderIds,
      routeStrategy: parsed.data.routeStrategy,
      tokenExpiresHours: parsed.data.tokenExpiresHours,
      notes: parsed.data.notes ? sanitizePlainText(parsed.data.notes) : null,
      actorUserId: session.user.id,
      baseUrl: origin,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Falha ao despachar romaneio.' },
      { status: 400 }
    );
  }
}

