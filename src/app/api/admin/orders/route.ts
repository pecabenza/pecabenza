import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuthSession } from '@/lib/tenancy/admin-auth';
import { listAdminOrders } from '@/modules/orders/orders.service';
import { CanonicalOrderStatus } from '@/modules/orders/order-status.machine';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const session = await getAdminAuthSession(request);
    if (!session) {
      return NextResponse.json({ error: 'Acesso não autorizado.' }, { status: 401 });
    }

    const url = new URL(request.url);
    const status = url.searchParams.get('status') as CanonicalOrderStatus | undefined;
    const limit = Number(url.searchParams.get('limit')) || 50;
    const offset = Number(url.searchParams.get('offset')) || 0;

    const orders = await listAdminOrders(session.tenant.id, {
      status,
      limit,
      offset,
    });

    return NextResponse.json({ orders }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Erro ao listar pedidos.' }, { status: 500 });
  }
}

