import { createAdminClient } from '@/lib/supabase/admin';
import type {
  Product,
  ProductCategory,
  ProductModifierGroup,
} from '@/types/database.types';
import { hydrateProductsWithCoverUrls } from './media-helper';

// Dados de fallback para desenvolvimento local caso o banco remoto não esteja conectado
const MOCK_PRODUCTS: Product[] = [
  {
    id: '00000000-0000-0000-0000-000000000101',
    tenant_id: '00000000-0000-0000-0000-000000000001',
    category_id: 'cat-01',
    name: 'Feijoada BENZA',
    slug: 'feijoada-benza',
    short_description: 'Feijão preto cozido com carnes e temperos clássicos.',
    full_description: 'A feijoada BENZA é preparada com feijão preto, carnes bovinas e suínas dessalgadas e tempero com alho, cebola e louro. Congelada após o preparo para consumo prático.',
    cover_media_id: null,
    cover_image_url: '/assets/brands/benza/products/mockup-feijoada.jpg',
    asset_source: 'mockup',
    is_mockup: true,
    status: 'active',
    is_featured: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    variants: [
      {
        id: 'var-01',
        tenant_id: '00000000-0000-0000-0000-000000000001',
        product_id: '00000000-0000-0000-0000-000000000101',
        name: '500 ml (Individual farto)',
        sku: 'BNZ-FEIJ-500',
        unit_type: 'ml',
        unit_value: 500,
        price_in_cents: 4800,
        is_available: true,
        display_order: 1,
        created_at: new Date().toISOString(),
      },
      {
        id: 'var-02',
        tenant_id: '00000000-0000-0000-0000-000000000001',
        product_id: '00000000-0000-0000-0000-000000000101',
        name: '1000 ml (Para compartilhar)',
        sku: 'BNZ-FEIJ-1000',
        unit_type: 'ml',
        unit_value: 1000,
        price_in_cents: 8900,
        is_available: true,
        display_order: 2,
        created_at: new Date().toISOString(),
      },
    ],
    information: {
      id: 'info-01',
      tenant_id: '00000000-0000-0000-0000-000000000001',
      product_id: '00000000-0000-0000-0000-000000000101',
      ingredients: 'Feijão preto, carne seca, lombo suíno, costelinha suína, paio, linguiça calabresa, alho, cebola, louro e azeite.',
      allergens: 'Não contém glúten. Pode conter derivados de soja.',
      shelf_life: 'Conforme indicado no rótulo do lote',
      after_thawing_instructions: 'Após descongelar, manter sob refrigeração e consumir em até 24 horas. Não recongelar.',
      conservation_instructions: 'Manter congelado conforme instruções da embalagem.',
      preparation_instructions: 'Levar ao fogo brando em panela com 2 colheres de sopa de água até aquecer completamente, mexendo delicadamente.',
      nutritional_info: {
        porcao: '250g',
        calorias: '380 kcal',
        proteinas: '28g',
        gorduras: '16g',
        carboidratos: '31g',
        sodio: '720mg',
      },
      created_at: new Date().toISOString(),
    },
    category: {
      id: 'cat-01',
      tenant_id: '00000000-0000-0000-0000-000000000001',
      name: 'Pratos Principais',
      slug: 'pratos-principais',
      display_order: 1,
      is_active: true,
      created_at: new Date().toISOString(),
    },
  },
  {
    id: '00000000-0000-0000-0000-000000000102',
    tenant_id: '00000000-0000-0000-0000-000000000001',
    category_id: 'cat-01',
    name: 'Lasanha Tradicional',
    slug: 'lasanha-tradicional',
    short_description: 'Massa em camadas com molho de carne, bechamel e queijo.',
    full_description: 'Receita tradicional de lasanha em camadas intercaladas com molho de carne, bechamel e queijo para gratinar.',
    cover_media_id: null,
    cover_image_url: '/assets/brands/benza/products/mockup-lasanha.jpg',
    asset_source: 'mockup',
    is_mockup: true,
    status: 'active',
    is_featured: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    variants: [
      {
        id: 'var-03',
        tenant_id: '00000000-0000-0000-0000-000000000001',
        product_id: '00000000-0000-0000-0000-000000000102',
        name: '500 ml (Individual)',
        sku: 'BNZ-LAS-500',
        unit_type: 'ml',
        unit_value: 500,
        price_in_cents: 4600,
        is_available: true,
        display_order: 1,
        created_at: new Date().toISOString(),
      },
      {
        id: 'var-04',
        tenant_id: '00000000-0000-0000-0000-000000000001',
        product_id: '00000000-0000-0000-0000-000000000102',
        name: '1000 ml (Duas pessoas)',
        sku: 'BNZ-LAS-1000',
        unit_type: 'ml',
        unit_value: 1000,
        price_in_cents: 8500,
        is_available: true,
        display_order: 2,
        created_at: new Date().toISOString(),
      },
    ],
    information: {
      id: 'info-02',
      tenant_id: '00000000-0000-0000-0000-000000000001',
      product_id: '00000000-0000-0000-0000-000000000102',
      ingredients: 'Farinha de trigo, ovos, carne bovina moída, tomate, leite integral, manteiga, queijo mozarela, parmesão e temperos.',
      allergens: 'Contém glúten, leite e ovos. Contém lactose.',
      shelf_life: 'Conforme indicado no rótulo do lote',
      after_thawing_instructions: 'Após descongelar, manter sob refrigeração e consumir em até 24 horas. Não recongelar.',
      conservation_instructions: 'Manter congelado conforme instruções da embalagem.',
      preparation_instructions: 'Forno pré-aquecido a 180°C por 25 a 30 minutos na embalagem forneável (remover tampa plástica).',
      nutritional_info: {
        porcao: '250g',
        calorias: '410 kcal',
        proteinas: '22g',
        gorduras: '19g',
        carboidratos: '38g',
        sodio: '640mg',
      },
      created_at: new Date().toISOString(),
    },
    category: {
      id: 'cat-01',
      tenant_id: '00000000-0000-0000-0000-000000000001',
      name: 'Pratos Principais',
      slug: 'pratos-principais',
      display_order: 1,
      is_active: true,
      created_at: new Date().toISOString(),
    },
  },
];

function sanitizeStorefrontProduct(product: Product, tenantId: string): Product {
  const activeVariants = (product.variants || [])
    .filter((v) => v.is_available !== false)
    .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));

  let coverImageUrl = product.cover_image_url;
  if (!coverImageUrl && tenantId === '00000000-0000-0000-0000-000000000001') {
    const mockFallback = MOCK_PRODUCTS.find((m) => m.slug === product.slug);
    if (mockFallback?.cover_image_url) {
      coverImageUrl = mockFallback.cover_image_url;
    }
  }

  return {
    ...product,
    cover_image_url: coverImageUrl,
    variants: activeVariants,
  };
}

async function hydrateProductModifiersAndSuggestions(
  supabase: ReturnType<typeof createAdminClient>,
  tenantId: string,
  products: Product[]
): Promise<Product[]> {
  if (products.length === 0) return products;
  const productIds = products.map((p) => p.id);

  // Carregamento resiliente: se migration 00017 ainda não tiver sido aplicada, segue sem quebrar o catálogo
  const groupsByProduct = new Map<string, ProductModifierGroup[]>();
  try {
    const { data: groupsData } = await supabase
      .from('product_modifier_groups')
      .select('*, options:product_modifier_options(*)')
      .eq('tenant_id', tenantId)
      .in('product_id', productIds)
      .order('display_order', { ascending: true });

    if (groupsData) {
      for (const rawGroup of groupsData as ProductModifierGroup[]) {
        const availableOptions = (rawGroup.options || [])
          .filter((o) => o.is_available !== false)
          .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
        const normalized: ProductModifierGroup = {
          ...rawGroup,
          options: availableOptions,
        };
        const current = groupsByProduct.get(rawGroup.product_id) || [];
        current.push(normalized);
        groupsByProduct.set(rawGroup.product_id, current);
      }
    }
  } catch {
    // Tabela opcional ainda não migrada
  }

  const suggestionIdsByProduct = new Map<string, string[]>();
  try {
    const { data: suggestionsData } = await supabase
      .from('product_suggestions')
      .select('product_id, suggested_product_id, display_order')
      .eq('tenant_id', tenantId)
      .in('product_id', productIds)
      .order('display_order', { ascending: true });

    if (suggestionsData) {
      for (const row of suggestionsData as Array<{
        product_id: string;
        suggested_product_id: string;
      }>) {
        const list = suggestionIdsByProduct.get(row.product_id) || [];
        list.push(row.suggested_product_id);
        suggestionIdsByProduct.set(row.product_id, list);
      }
    }
  } catch {
    // Tabela opcional ainda não migrada
  }

  const productById = new Map(products.map((p) => [p.id, p]));

  return products.map((p) => {
    const suggestedIds = suggestionIdsByProduct.get(p.id) || [];
    const resolvedSuggestions = suggestedIds
      .map((sid) => productById.get(sid))
      .filter((item): item is Product => Boolean(item));
    return {
      ...p,
      modifier_groups: groupsByProduct.get(p.id) || [],
      suggested_product_ids: suggestedIds,
      suggestions: resolvedSuggestions,
    };
  });
}

export async function getTenantCategories(tenantId: string): Promise<ProductCategory[]> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('product_categories')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .order('display_order', { ascending: true })
      .order('name', { ascending: true });

    if (error || !data || data.length === 0) {
      if (tenantId === '00000000-0000-0000-0000-000000000001') {
        const unique = new Map<string, ProductCategory>();
        for (const p of MOCK_PRODUCTS) {
          if (p.category) unique.set(p.category.id, p.category);
        }
        return Array.from(unique.values());
      }
      return [];
    }

    return data as ProductCategory[];
  } catch {
    return [];
  }
}

export async function getTenantProducts(tenantId: string): Promise<Product[]> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('products')
      .select('*, variants:product_variants(*), information:product_information(*), category:product_categories(*)')
      .eq('tenant_id', tenantId)
      .eq('status', 'active')
      .order('is_featured', { ascending: false });

    if (error || !data || data.length === 0) {
      if (tenantId === '00000000-0000-0000-0000-000000000001') {
        return MOCK_PRODUCTS;
      }
      return [];
    }

    const hydrated = await hydrateProductsWithCoverUrls(supabase, tenantId, data as Product[]);
    const sanitized = hydrated.map((p) => sanitizeStorefrontProduct(p, tenantId));
    return await hydrateProductModifiersAndSuggestions(supabase, tenantId, sanitized);
  } catch {
    if (tenantId === '00000000-0000-0000-0000-000000000001') {
      return MOCK_PRODUCTS;
    }
    return [];
  }
}

export async function getTenantProductBySlug(tenantId: string, slug: string): Promise<Product | null> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('products')
      .select('*, variants:product_variants(*), information:product_information(*), category:product_categories(*)')
      .eq('tenant_id', tenantId)
      .eq('slug', slug)
      .eq('status', 'active')
      .maybeSingle();

    if (error || !data) {
      if (tenantId === '00000000-0000-0000-0000-000000000001') {
        const found = MOCK_PRODUCTS.find((p) => p.slug === slug);
        return found || null;
      }
      return null;
    }

    const [hydrated] = await hydrateProductsWithCoverUrls(supabase, tenantId, [data as Product]);
    if (!hydrated) return null;
    const sanitized = sanitizeStorefrontProduct(hydrated, tenantId);
    const [enriched] = await hydrateProductModifiersAndSuggestions(supabase, tenantId, [sanitized]);

    // Se houver sugestões que não estão no array [sanitized], buscar esses produtos ativos
    if (enriched.suggested_product_ids && enriched.suggested_product_ids.length > 0) {
      const { data: suggestedRows } = await supabase
        .from('products')
        .select('*, variants:product_variants(*), category:product_categories(*)')
        .eq('tenant_id', tenantId)
        .eq('status', 'active')
        .in('id', enriched.suggested_product_ids);

      if (suggestedRows && suggestedRows.length > 0) {
        const hydratedSuggested = await hydrateProductsWithCoverUrls(
          supabase,
          tenantId,
          suggestedRows as Product[]
        );
        const byId = new Map(
          hydratedSuggested.map((s) => [s.id, sanitizeStorefrontProduct(s, tenantId)])
        );
        enriched.suggestions = enriched.suggested_product_ids
          .map((sid) => byId.get(sid))
          .filter((item): item is Product => Boolean(item));
      }
    }

    return enriched;
  } catch {
    if (tenantId === '00000000-0000-0000-0000-000000000001') {
      const found = MOCK_PRODUCTS.find((p) => p.slug === slug);
      return found || null;
    }
    return null;
  }
}
