import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuthSession } from '@/lib/tenancy/admin-auth';
import { listRecipes, createRecipe } from '@/modules/inventory/inventory.service';
import { sanitizePlainText } from '@/lib/security/sanitize';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const session = await getAdminAuthSession(request);
    if (!session) {
      return NextResponse.json({ error: 'Acesso não autorizado.' }, { status: 401 });
    }

    const recipes = await listRecipes(session.tenant.id);
    return NextResponse.json({ recipes }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Erro ao listar fichas técnicas.' },
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
    if (!body.productId || !body.name || !body.expectedYieldQuantity) {
      return NextResponse.json(
        { error: 'Produto, nome e rendimento esperado são obrigatórios.' },
        { status: 400 }
      );
    }

    const recipe = await createRecipe(session.tenant.id, {
      productId: body.productId,
      variantId: body.variantId || null,
      name: sanitizePlainText(body.name),
      expectedYieldQuantity: Number(body.expectedYieldQuantity),
      yieldUnit: body.yieldUnit ? sanitizePlainText(body.yieldUnit) : 'un',
      expectedLossPercentage: Number(body.expectedLossPercentage || 0),
      shelfLifeDays: Number(body.shelfLifeDays || 90),
      preparationInstructions: body.preparationInstructions ? sanitizePlainText(body.preparationInstructions) : null,
      items: Array.isArray(body.items)
        ? body.items.map((it: any) => ({
            rawMaterialId: it.rawMaterialId,
            grossQuantity: Number(it.grossQuantity),
            netQuantity: Number(it.netQuantity || it.grossQuantity),
            unitOfMeasure: it.unitOfMeasure,
            notes: it.notes ? sanitizePlainText(it.notes) : undefined,
          }))
        : [],
    });

    return NextResponse.json({ recipe }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Erro ao criar ficha técnica.' },
      { status: 500 }
    );
  }
}

