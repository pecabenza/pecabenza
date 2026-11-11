import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuthSession } from '@/lib/tenancy/admin-auth';
import { getInventoryDashboardKPIs } from '@/modules/inventory/inventory.service';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const session = await getAdminAuthSession(request);
    if (!session) {
      return NextResponse.json({ error: 'Acesso não autorizado.' }, { status: 401 });
    }

    const kpis = await getInventoryDashboardKPIs(session.tenant.id);
    return NextResponse.json({ kpis }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Erro ao carregar dashboard de estoque.' },
      { status: 500 }
    );
  }
}

