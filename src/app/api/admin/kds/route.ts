import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuthSession } from '@/lib/tenancy/admin-auth';
import { listKdsOrders } from '@/modules/orders/orders.service';
import { logger } from '@/lib/observability/logger';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const session = await getAdminAuthSession(request);
    if (!session) {
      return NextResponse.json(
        { error: 'Acesso não autorizado ao KDS da cozinha.' },
        { status: 401 }
      );
    }

    const { orders, metrics, slaConfig } = await listKdsOrders(session.tenant.id);

    return NextResponse.json(
      {
        orders,
        metrics,
        slaConfig,
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (error: any) {
    logger.error('Erro ao consultar fila do KDS', {
      error: error.message,
    });
    return NextResponse.json(
      { error: error.message || 'Erro ao carregar o KDS.' },
      { status: 500 }
    );
  }
}

