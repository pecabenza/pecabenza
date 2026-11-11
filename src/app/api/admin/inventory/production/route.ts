import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuthSession } from '@/lib/tenancy/admin-auth';
import {
  listProductionOrders,
  createProductionOrder,
  completeProductionOrder,
} from '@/modules/inventory/inventory.service';
import { sanitizePlainText } from '@/lib/security/sanitize';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const session = await getAdminAuthSession(request);
    if (!session) {
      return NextResponse.json({ error: 'Acesso não autorizado.' }, { status: 401 });
    }

    const orders = await listProductionOrders(session.tenant.id);
    return NextResponse.json({ orders }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Erro ao listar ordens de produção.' },
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

    const body = await request.json();
    const action = body.action || 'create';

    if (action === 'create') {
      if (!body.recipeId || !body.orderCode) {
        return NextResponse.json(
          { error: 'Ficha técnica e código da ordem são obrigatórios.' },
          { status: 400 }
        );
      }

      const res = await createProductionOrder(session.tenant.id, {
        recipeId: body.recipeId,
        orderCode: sanitizePlainText(body.orderCode),
        plannedMultiplier: Number(body.plannedMultiplier || 1.0),
        actorUserId: session.user.id,
        notes: body.notes ? sanitizePlainText(body.notes) : null,
      });

      return NextResponse.json(res, { status: 201 });
    }

    if (action === 'complete') {
      if (!body.productionOrderId || !body.actualYieldQuantity || !body.batchCode) {
        return NextResponse.json(
          { error: 'ID da ordem, rendimento real e código do lote gerado são obrigatórios.' },
          { status: 400 }
        );
      }

      const res = await completeProductionOrder(session.tenant.id, {
        productionOrderId: body.productionOrderId,
        actualYieldQuantity: Number(body.actualYieldQuantity),
        batchCode: sanitizePlainText(body.batchCode),
        staffConsumptionQuantity: Number(body.staffConsumptionQuantity || 0),
        wasteSpoilageQuantity: Number(body.wasteSpoilageQuantity || 0),
        deviationReason: body.deviationReason ? sanitizePlainText(body.deviationReason) : null,
        storageLocation: body.storageLocation ? sanitizePlainText(body.storageLocation) : 'freezer_principal',
        actorUserId: session.user.id,
      });

      return NextResponse.json(res, { status: 200 });
    }

    return NextResponse.json({ error: 'Ação de produção não reconhecida.' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Erro ao processar ordem de produção.' },
      { status: 500 }
    );
  }
}

