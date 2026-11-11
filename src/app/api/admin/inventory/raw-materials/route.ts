import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuthSession } from '@/lib/tenancy/admin-auth';
import {
  listRawMaterials,
  createRawMaterial,
  updateRawMaterial,
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
    const category = searchParams.get('category') || undefined;
    const activeOnly = searchParams.get('activeOnly') === 'true';

    const items = await listRawMaterials(session.tenant.id, { category, activeOnly });
    return NextResponse.json({ items }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Erro ao carregar insumos.' },
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
    if (!body.name || !body.category || !body.unitOfMeasure) {
      return NextResponse.json(
        { error: 'Nome, categoria e unidade de medida são obrigatórios.' },
        { status: 400 }
      );
    }

    const created = await createRawMaterial(session.tenant.id, {
      name: sanitizePlainText(body.name),
      sku: body.sku ? sanitizePlainText(body.sku) : null,
      category: body.category,
      unitOfMeasure: body.unitOfMeasure,
      minStockLevel: Number(body.minStockLevel || 0),
    });

    return NextResponse.json({ item: created }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Erro ao cadastrar insumo.' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getAdminAuthSession(request);
    if (!session) {
      return NextResponse.json({ error: 'Acesso não autorizado.' }, { status: 401 });
    }

    const body = await request.json();
    if (!body.id) {
      return NextResponse.json({ error: 'ID do insumo é obrigatório.' }, { status: 400 });
    }

    await updateRawMaterial(session.tenant.id, body.id, {
      name: body.name ? sanitizePlainText(body.name) : undefined,
      sku: body.sku !== undefined ? (body.sku ? sanitizePlainText(body.sku) : null) : undefined,
      category: body.category,
      unitOfMeasure: body.unitOfMeasure,
      minStockLevel: body.minStockLevel !== undefined ? Number(body.minStockLevel) : undefined,
      isActive: body.isActive !== undefined ? Boolean(body.isActive) : undefined,
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Erro ao atualizar insumo.' },
      { status: 500 }
    );
  }
}

