import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuthSession } from '@/lib/tenancy/admin-auth';
import { getStationKdsQueue } from '@/modules/orders/orders.service';
import { logger } from '@/lib/observability/logger';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ stationSlug: string }> }
) {
  try {
    const session = await getAdminAuthSession(request);
    if (!session) {
      return NextResponse.json(
        { error: 'Acesso não autorizado à estação do KDS.' },
        { status: 401 }
      );
    }

    const { stationSlug } = await params;
    if (!stationSlug) {
      return NextResponse.json(
        { error: 'Slug da estação é obrigatório.' },
        { status: 400 }
      );
    }

    const data = await getStationKdsQueue(session.tenant.id, stationSlug);

    return NextResponse.json(
      {
        ...data,
        role: session.role,
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (error: any) {
    logger.error('Erro ao consultar fila de estação do KDS', {
      error: error.message,
    });
    return NextResponse.json(
      { error: error.message || 'Erro ao carregar estação do KDS.' },
      { status: 400 }
    );
  }
}

