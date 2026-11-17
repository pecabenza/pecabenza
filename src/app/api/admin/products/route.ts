import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminAuthSession } from '@/lib/tenancy/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { createSafeErrorResponse } from '@/lib/security/error-response';
import { sanitizePlainText } from '@/lib/security/sanitize';
import { logger } from '@/lib/observability/logger';
import {
  resolveOrCreateCoverMediaId,
  hydrateProductsWithCoverUrls,
} from '@/modules/catalog/media-helper';
import { normalizeCompareAtPriceCents } from '@/modules/catalog/pricing';

export const dynamic = 'force-dynamic';

const VariantSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(100),
  unit_type: z.enum(['ml', 'l', 'g', 'kg', 'un', 'cx', 'portion', 'other']).default('ml'),
  unit_value: z.number().positive(),
  price_in_cents: z.number().int().nonnegative(),
  compare_at_price_cents: z.number().int().nonnegative().nullable().optional(),
  is_available: z.boolean().default(true),
});

const ModifierOptionSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(120),
  price_in_cents: z.number().int().nonnegative().default(0),
  is_available: z.boolean().default(true),
  display_order: z.number().int().min(0).optional(),
});

const ModifierGroupSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(120),
  is_required: z.boolean().default(false),
  min_selections: z.number().int().min(0).default(0),
  max_selections: z.number().int().min(1).default(1),
  display_order: z.number().int().min(0).optional(),
  options: z.array(ModifierOptionSchema).default([]),
});

const ProductSaveSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, 'Nome do prato é obrigatório').max(150),
  slug: z.string().min(1).max(150).optional(),
  category_id: z.string().nullable().optional(),
  category_name: z.string().optional(),
  status: z.enum(['active', 'draft', 'archived']).default('active'),
  is_featured: z.boolean().default(false),
  cover_image_url: z.string().nullable().optional(),
  asset_source: z.enum(['official', 'mockup', 'pending']).default('official'),
  is_mockup: z.boolean().default(false),
  short_description: z.string().max(300).nullable().optional(),
  full_description: z.string().max(2000).nullable().optional(),
  variants: z.array(VariantSchema).min(1, 'Ao menos uma porção/variação deve ser informada'),
  ingredients: z.string().nullable().optional(),
  allergens: z.string().nullable().optional(),
  shelf_life: z.string().nullable().optional(),
  after_thawing_instructions: z.string().nullable().optional(),
  conservation_instructions: z.string().nullable().optional(),
  preparation_instructions: z.string().nullable().optional(),
  modifier_groups: z.array(ModifierGroupSchema).optional(),
  suggested_product_ids: z.array(z.string().uuid()).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const session = await getAdminAuthSession(request);
    if (!session) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }

    const { tenant } = session;
    const adminClient = createAdminClient();

    const [productsRes, categoriesRes] = await Promise.all([
      adminClient
        .from('products')
        .select('*, variants:product_variants(*), information:product_information(*), category:product_categories(*)')
        .eq('tenant_id', tenant.id)
        .neq('status', 'archived')
        .order('created_at', { ascending: false }),
      adminClient
        .from('product_categories')
        .select('*')
        .eq('tenant_id', tenant.id)
        .order('display_order', { ascending: true }),
    ]);

    const hydratedProducts = await hydrateProductsWithCoverUrls(
      adminClient,
      tenant.id,
      productsRes.data || []
    );

    const groupsByProduct = new Map<string, any[]>();
    const suggestionsByProduct = new Map<string, string[]>();
    try {
      const [groupsRes, suggRes] = await Promise.all([
        adminClient
          .from('product_modifier_groups')
          .select('*, options:product_modifier_options(*)')
          .eq('tenant_id', tenant.id)
          .order('display_order', { ascending: true }),
        adminClient
          .from('product_suggestions')
          .select('product_id, suggested_product_id, display_order')
          .eq('tenant_id', tenant.id)
          .order('display_order', { ascending: true }),
      ]);

      for (const g of groupsRes.data || []) {
        const sortedOptions = (g.options || []).sort(
          (a: any, b: any) => (a.display_order ?? 0) - (b.display_order ?? 0)
        );
        const list = groupsByProduct.get(g.product_id) || [];
        list.push({ ...g, options: sortedOptions });
        groupsByProduct.set(g.product_id, list);
      }

      for (const s of suggRes.data || []) {
        const list = suggestionsByProduct.get(s.product_id) || [];
        list.push(s.suggested_product_id);
        suggestionsByProduct.set(s.product_id, list);
      }
    } catch {
      // Tabelas opcionais antes da migration 00017
    }

    const enrichedProducts = hydratedProducts.map((p: any) => ({
      ...p,
      modifier_groups: groupsByProduct.get(p.id) || [],
      suggested_product_ids: suggestionsByProduct.get(p.id) || [],
    }));

    return NextResponse.json({
      success: true,
      tenantId: tenant.id,
      products: enrichedProducts,
      categories: categoriesRes.data || [],
    });
  } catch (error) {
    return createSafeErrorResponse(error, 500, { action: 'admin_get_products' });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAdminAuthSession(request);
    if (!session) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }

    const { tenant, user } = session;
    const rawBody = await request.json();
    const validated = ProductSaveSchema.parse(rawBody);

    const adminClient = createAdminClient();

    // 1. Resolver ou criar categoria se informada por nome
    let categoryId = validated.category_id;
    if (!categoryId && validated.category_name) {
      const catSlug = validated.category_name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

      const { data: existingCat } = await adminClient
        .from('product_categories')
        .select('id')
        .eq('tenant_id', tenant.id)
        .eq('slug', catSlug)
        .maybeSingle();

      if (existingCat) {
        categoryId = existingCat.id;
      } else {
        const { data: newCat } = await adminClient
          .from('product_categories')
          .insert({
            tenant_id: tenant.id,
            name: validated.category_name,
            slug: catSlug,
            display_order: 1,
            is_active: true,
          })
          .select('id')
          .single();
        if (newCat) categoryId = newCat.id;
      }
    }

    // 2. Gerar slug do produto
    const slug = (
      validated.slug ||
      validated.name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
    );

    // 3. Resolver cover_media_id em media_assets (sem gravar coluna inexistente cover_image_url em products)
    const coverMediaId = await resolveOrCreateCoverMediaId(
      adminClient,
      tenant.id,
      validated.cover_image_url || null,
      validated.asset_source
    );

    // 4. Salvar produto
    let productId = validated.id;
    let savedProduct;

    if (productId && !productId.startsWith('p-temp-')) {
      // Atualizar existente
      const { data, error } = await adminClient
        .from('products')
        .update({
          name: sanitizePlainText(validated.name, 150),
          slug,
          category_id: categoryId || null,
          short_description: validated.short_description ? sanitizePlainText(validated.short_description, 300) : null,
          full_description: validated.full_description ? sanitizePlainText(validated.full_description, 2000) : null,
          cover_media_id: coverMediaId,
          asset_source: validated.asset_source,
          is_mockup: validated.is_mockup,
          status: validated.status,
          is_featured: validated.is_featured,
          updated_at: new Date().toISOString(),
        })
        .eq('id', productId)
        .eq('tenant_id', tenant.id)
        .select('*')
        .single();

      if (error) {
        logger.error('Erro ao atualizar produto', { tenantId: tenant.id, error: error.message });
        return NextResponse.json({ error: `Erro ao atualizar produto no banco: ${error.message}` }, { status: 500 });
      }
      savedProduct = data;
    } else {
      // Inserir novo produto
      const { data, error } = await adminClient
        .from('products')
        .insert({
          tenant_id: tenant.id,
          name: sanitizePlainText(validated.name, 150),
          slug,
          category_id: categoryId || null,
          short_description: validated.short_description ? sanitizePlainText(validated.short_description, 300) : null,
          full_description: validated.full_description ? sanitizePlainText(validated.full_description, 2000) : null,
          cover_media_id: coverMediaId,
          asset_source: validated.asset_source,
          is_mockup: validated.is_mockup,
          status: validated.status,
          is_featured: validated.is_featured,
        })
        .select('*')
        .single();

      if (error) {
        logger.error('Erro ao cadastrar produto', { tenantId: tenant.id, error: error.message });
        return NextResponse.json({ error: `Erro ao cadastrar novo produto no banco: ${error.message}` }, { status: 500 });
      }
      savedProduct = data;
      productId = data.id;
    }

    // 4. Salvar ficha técnica (product_information)
    const { data: existingInfo } = await adminClient
      .from('product_information')
      .select('id')
      .eq('tenant_id', tenant.id)
      .eq('product_id', productId)
      .maybeSingle();

    const infoPayload = {
      tenant_id: tenant.id,
      product_id: productId,
      ingredients: validated.ingredients ? sanitizePlainText(validated.ingredients, 1000) : null,
      allergens: validated.allergens ? sanitizePlainText(validated.allergens, 500) : null,
      shelf_life: validated.shelf_life ? sanitizePlainText(validated.shelf_life, 200) : null,
      after_thawing_instructions: validated.after_thawing_instructions ? sanitizePlainText(validated.after_thawing_instructions, 500) : null,
      conservation_instructions: validated.conservation_instructions ? sanitizePlainText(validated.conservation_instructions, 500) : null,
      preparation_instructions: validated.preparation_instructions ? sanitizePlainText(validated.preparation_instructions, 1000) : null,
    };

    if (existingInfo) {
      await adminClient
        .from('product_information')
        .update(infoPayload)
        .eq('id', existingInfo.id)
        .eq('tenant_id', tenant.id);
    } else {
      await adminClient.from('product_information').insert(infoPayload);
    }

    // 5. Sincronizar variações (product_variants)
    // Deletar variantes que não estão mais presentes se for edição
    const existingVariantsRes = await adminClient
      .from('product_variants')
      .select('id')
      .eq('tenant_id', tenant.id)
      .eq('product_id', productId);

    const existingVariantIds = (existingVariantsRes.data || []).map((v) => v.id);
    const sentVariantIds = validated.variants.map((v) => v.id).filter(Boolean);

    const toDelete = existingVariantIds.filter((id) => !sentVariantIds.includes(id));
    if (toDelete.length > 0) {
      await adminClient
        .from('product_variants')
        .delete()
        .eq('tenant_id', tenant.id)
        .in('id', toDelete);
    }

    // Inserir / Atualizar variantes enviadas
    for (let i = 0; i < validated.variants.length; i++) {
      const v = validated.variants[i];
      const compareAtPriceCents = normalizeCompareAtPriceCents(
        v.price_in_cents,
        v.compare_at_price_cents
      );

      if (v.id && !v.id.startsWith('v-temp-') && existingVariantIds.includes(v.id)) {
        await adminClient
          .from('product_variants')
          .update({
            name: sanitizePlainText(v.name, 100),
            unit_type: v.unit_type,
            unit_value: v.unit_value,
            price_in_cents: v.price_in_cents,
            compare_at_price_cents: compareAtPriceCents,
            is_available: v.is_available,
            display_order: i + 1,
          })
          .eq('id', v.id)
          .eq('tenant_id', tenant.id);
      } else {
        await adminClient.from('product_variants').insert({
          tenant_id: tenant.id,
          product_id: productId,
          name: sanitizePlainText(v.name, 100),
          unit_type: v.unit_type,
          unit_value: v.unit_value,
          price_in_cents: v.price_in_cents,
          compare_at_price_cents: compareAtPriceCents,
          is_available: v.is_available,
          display_order: i + 1,
        });
      }
    }

    // 5b. Sincronizar grupos de complementos (se informados)
    if (validated.modifier_groups !== undefined) {
      await adminClient
        .from('product_modifier_groups')
        .delete()
        .eq('tenant_id', tenant.id)
        .eq('product_id', productId);

      for (let gIdx = 0; gIdx < validated.modifier_groups.length; gIdx++) {
        const grp = validated.modifier_groups[gIdx];
        const minSel = grp.is_required ? Math.max(1, grp.min_selections) : grp.min_selections;
        const maxSel = Math.max(minSel || 1, grp.max_selections);

        const { data: insertedGroup } = await adminClient
          .from('product_modifier_groups')
          .insert({
            tenant_id: tenant.id,
            product_id: productId,
            name: sanitizePlainText(grp.name, 120),
            is_required: grp.is_required,
            min_selections: minSel,
            max_selections: maxSel,
            display_order: grp.display_order ?? gIdx + 1,
          })
          .select('id')
          .single();

        if (insertedGroup && grp.options.length > 0) {
          await adminClient.from('product_modifier_options').insert(
            grp.options.map((opt, oIdx) => ({
              tenant_id: tenant.id,
              group_id: insertedGroup.id,
              name: sanitizePlainText(opt.name, 120),
              price_in_cents: Math.max(0, opt.price_in_cents),
              is_available: opt.is_available,
              display_order: opt.display_order ?? oIdx + 1,
            }))
          );
        }
      }
    }

    // 5c. Sincronizar sugestões de produtos ("Peça também")
    if (validated.suggested_product_ids !== undefined) {
      await adminClient
        .from('product_suggestions')
        .delete()
        .eq('tenant_id', tenant.id)
        .eq('product_id', productId);

      const cleanIds = Array.from(
        new Set(validated.suggested_product_ids.filter((sid) => sid !== productId))
      );
      if (cleanIds.length > 0) {
        await adminClient.from('product_suggestions').insert(
          cleanIds.map((suggestedId, idx) => ({
            tenant_id: tenant.id,
            product_id: productId,
            suggested_product_id: suggestedId,
            display_order: idx + 1,
          }))
        );
      }
    }

    // 6. Registrar em audit_logs
    await adminClient.from('audit_logs').insert({
      tenant_id: tenant.id,
      actor_id: user.id,
      resource_type: 'products',
      resource_id: productId,
      action: validated.id ? 'UPDATE_PRODUCT' : 'CREATE_PRODUCT',
      payload_after: {
        name: savedProduct.name,
        slug: savedProduct.slug,
        status: savedProduct.status,
      },
    });

    const [hydratedSaved] = await hydrateProductsWithCoverUrls(adminClient, tenant.id, [savedProduct]);

    return NextResponse.json({
      success: true,
      product: hydratedSaved || savedProduct,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: 'Dados de produto inválidos.',
          details: error.errors.map((e) => ({ field: e.path.join('.'), message: e.message })),
        },
        { status: 400 }
      );
    }
    return createSafeErrorResponse(error, 500, { action: 'admin_save_product' });
  }
}

