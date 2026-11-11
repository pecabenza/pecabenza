import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuthSession } from '@/lib/tenancy/admin-auth';
import {
  listInventoryBatches,
  recordRawMaterialReceipt,
  recordFinishedProductReceipt,
  adjustInventoryBatch,
} from '@/modules/inventory/inventory.service';
import { sanitizePlainText } from '@/lib/security/sanitize';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const session = await getAdminAuthSession(request);
    if (!session) {
      return NextResponse.json({ error: 'Acesso não autorizado.' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const batchType = (searchParams.get('batchType') as any) || undefined;
    const rawMaterialId = searchParams.get('rawMaterialId') || undefined;
    const variantId = searchParams.get('variantId') || undefined;
    const status = searchParams.get('status') || undefined;

    const batches = await listInventoryBatches(session.tenant.id, {
      batchType,
      rawMaterialId,
      variantId,
      status,
    });

    return NextResponse.json({ batches }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Erro ao listar lotes.' },
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
    const action = body.action || 'receive_raw_material';

    if (action === 'receive_raw_material') {
      if (!body.rawMaterialId || !body.batchCode || !body.expirationDate || !body.quantity) {
        return NextResponse.json(
          { error: 'Insumo, código do lote, validade e quantidade são obrigatórios.' },
          { status: 400 }
        );
      }

      const res = await recordRawMaterialReceipt(session.tenant.id, {
        rawMaterialId: body.rawMaterialId,
        batchCode: sanitizePlainText(body.batchCode),
        manufactureDate: body.manufactureDate || new Date().toISOString().split('T')[0],
        expirationDate: body.expirationDate,
        quantity: Number(body.quantity),
        unitCostCents: Math.round(Number(body.unitCostCents || 0)),
        supplierName: body.supplierName ? sanitizePlainText(body.supplierName) : null,
        invoiceNumber: body.invoiceNumber ? sanitizePlainText(body.invoiceNumber) : null,
        storageLocation: body.storageLocation ? sanitizePlainText(body.storageLocation) : 'camara_fria',
        actorUserId: session.user.id,
        notes: body.notes ? sanitizePlainText(body.notes) : null,
      });

      return NextResponse.json(res, { status: 201 });
    }

    if (action === 'receive_finished_product') {
      if (!body.variantId || !body.batchCode || !body.expirationDate || !body.quantity) {
        return NextResponse.json(
          { error: 'Produto/Variante, código do lote, validade e quantidade são obrigatórios.' },
          { status: 400 }
        );
      }

      const res = await recordFinishedProductReceipt(session.tenant.id, {
        variantId: body.variantId,
        batchCode: sanitizePlainText(body.batchCode),
        manufactureDate: body.manufactureDate || new Date().toISOString().split('T')[0],
        expirationDate: body.expirationDate,
        quantity: Math.round(Number(body.quantity)),
        unitCostCents: Math.round(Number(body.unitCostCents || 0)),
        supplierName: body.supplierName ? sanitizePlainText(body.supplierName) : null,
        storageLocation: body.storageLocation ? sanitizePlainText(body.storageLocation) : 'freezer_principal',
        actorUserId: session.user.id,
        notes: body.notes ? sanitizePlainText(body.notes) : null,
      });

      return NextResponse.json(res, { status: 201 });
    }

    if (action === 'adjust_batch') {
      if (!body.batchId || body.newQuantity === undefined || !body.reason) {
        return NextResponse.json(
          { error: 'ID do lote, nova quantidade e motivo do ajuste são obrigatórios.' },
          { status: 400 }
        );
      }

      await adjustInventoryBatch(session.tenant.id, {
        batchId: body.batchId,
        newQuantity: Number(body.newQuantity),
        reason: sanitizePlainText(body.reason),
        actorUserId: session.user.id,
      });

      return NextResponse.json({ success: true }, { status: 200 });
    }

    return NextResponse.json({ error: 'Ação de lote não reconhecida.' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Erro ao processar operação de lote.' },
      { status: 500 }
    );
  }
}

