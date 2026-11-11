import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuthSession } from '@/lib/tenancy/admin-auth';
import { closeDeliveryRun } from '@/modules/delivery/delivery.service';

export const dynamic = 'force-dynamic';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAdminAuthSession(request);
    if (!session) {
      return NextResponse.json({ error: 'Acesso não autorizado.' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const action = body.action === 'cancel' ? 'cancel' : 'complete';

    const result = await closeDeliveryRun(session.tenant.id, id, action, session.user.id);
    return NextResponse.json(result, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Erro ao atualizar romaneio.' },
      { status: 400 }
    );
  }
}

