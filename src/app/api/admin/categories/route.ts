import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminAuthSession } from '@/lib/tenancy/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { createSafeErrorResponse } from '@/lib/security/error-response';

export const dynamic = 'force-dynamic';

const CategoryUpsertSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, 'Nome da categoria é obrigatório').max(100),
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

export async function GET(request: NextRequest) {
  try {
    const session = await getAdminAuthSession(request);
    if (!session) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }

    const adminClient = createAdminClient();
    const { data, error } = await adminClient
      .from('product_categories')
      .select('*')
      .eq('tenant_id', session.tenant.id)
      .order('display_order', { ascending: true })
      .order('name', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, categories: data || [] });
  } catch (error) {
    return createSafeErrorResponse(error, 500, { action: 'admin_get_categories' });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAdminAuthSession(request);
    if (!session) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }

    const rawBody = await request.json();
    const parsed = CategoryUpsertSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Dados inválidos.' },
        { status: 400 }
      );
    }

    const { tenant, user } = session;
    const adminClient = createAdminClient();
    const { id, name, display_order, is_active } = parsed.data;
    const slug = buildSlug(name);

    if (id) {
      const { data: updated, error } = await adminClient
        .from('product_categories')
        .update({
          name,
          slug,
          ...(display_order !== undefined ? { display_order } : {}),
          ...(is_active !== undefined ? { is_active } : {}),
        })
        .eq('id', id)
        .eq('tenant_id', tenant.id)
        .select()
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, category: updated });
    }

    const { data: existingBySlug } = await adminClient
      .from('product_categories')
      .select('id')
      .eq('tenant_id', tenant.id)
      .eq('slug', slug)
      .maybeSingle();

    if (existingBySlug) {
      return NextResponse.json(
        { error: 'Já existe uma categoria com este nome.' },
        { status: 409 }
      );
    }

    let nextOrder = display_order;
    if (nextOrder === undefined) {
      const { data: maxRow } = await adminClient
        .from('product_categories')
        .select('display_order')
        .eq('tenant_id', tenant.id)
        .order('display_order', { ascending: false })
        .limit(1)
        .maybeSingle();
      nextOrder = (maxRow?.display_order ?? 0) + 1;
    }

    const { data: created, error } = await adminClient
      .from('product_categories')
      .insert({
        tenant_id: tenant.id,
        name,
        slug,
        display_order: nextOrder,
        is_active: is_active ?? true,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await adminClient.from('audit_logs').insert({
      tenant_id: tenant.id,
      actor_id: user.id,
      resource_type: 'product_categories',
      resource_id: created.id,
      action: 'CREATE_CATEGORY',
      payload_after: { name, slug, display_order: nextOrder },
    });

    return NextResponse.json({ success: true, category: created });
  } catch (error) {
    return createSafeErrorResponse(error, 500, { action: 'admin_upsert_category' });
  }
}

