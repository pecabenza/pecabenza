import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminAuthSession } from '@/lib/tenancy/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { createSafeErrorResponse } from '@/lib/security/error-response';

export const dynamic = 'force-dynamic';

const PatchCategorySchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  display_order: z.number().int().min(0).optional(),
  is_active: z.boolean().optional(),
});

function buildSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || `cat-${Date.now()}`;
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAdminAuthSession(request);
    if (!session) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }

    const { id } = await context.params;
    const rawBody = await request.json();
    const parsed = PatchCategorySchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Dados inválidos para atualizar categoria.' },
        { status: 400 }
      );
    }

    const patch: Record<string, unknown> = {};
    if (parsed.data.name !== undefined) {
      patch.name = parsed.data.name;
      patch.slug = buildSlug(parsed.data.name);
    }
    if (parsed.data.display_order !== undefined) {
      patch.display_order = parsed.data.display_order;
    }
    if (parsed.data.is_active !== undefined) {
      patch.is_active = parsed.data.is_active;
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'Nenhum campo para atualizar.' }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const { data: category, error } = await adminClient
      .from('product_categories')
      .update(patch)
      .eq('id', id)
      .eq('tenant_id', session.tenant.id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, category });
  } catch (error) {
    return createSafeErrorResponse(error, 500, { action: 'admin_patch_category' });
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAdminAuthSession(request);
    if (!session) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }

    const { id } = await context.params;
    const adminClient = createAdminClient();

    const { error } = await adminClient
      .from('product_categories')
      .delete()
      .eq('id', id)
      .eq('tenant_id', session.tenant.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return createSafeErrorResponse(error, 500, { action: 'admin_delete_category' });
  }
}

