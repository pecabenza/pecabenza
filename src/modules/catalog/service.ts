import { createAdminClient } from '@/lib/supabase/admin';
import type { Product, ProductCategory } from '@/types/database.types';

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
      return MOCK_PRODUCTS;
    }
    return data as Product[];
  } catch {
    return MOCK_PRODUCTS;
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
      const found = MOCK_PRODUCTS.find((p) => p.slug === slug);
      return found || null;
    }
    return data as Product;
  } catch {
    const found = MOCK_PRODUCTS.find((p) => p.slug === slug);
    return found || null;
  }
}
