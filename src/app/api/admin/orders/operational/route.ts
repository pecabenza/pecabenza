import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuthSession } from '@/lib/tenancy/admin-auth';
import { listOperationalOrders } from '@/modules/orders/orders.service';
import { logger } from '@/lib/observability/logger';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const session = await getAdminAuthSession(request);
    if (!session) {
      return NextResponse.json({ error: 'Acesso não autorizado ao painel operacional.' }, { status: 401 });
    }

    const { orders, metrics } = await listOperationalOrders(session.tenant.id);

    return NextResponse.json(
      {
        orders,
        metrics,
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (error: any) {
    logger.error('Erro ao listar pedidos operacionais', {
      error: error.message,
    });
    return NextResponse.json(
      { error: error.message || 'Erro ao carregar visão operacional.' },
      { status: 500 }
    );
  }
}

