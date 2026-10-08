-- ==============================================================================
-- Migration 00002: Media Assets & Cross-Tenant Safe Product Catalog
-- ==============================================================================

-- 1. Tabela de Mídia e Armazenamento (Supabase Storage Metadata)
CREATE TABLE IF NOT EXISTS public.media_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  bucket varchar(60) NOT NULL DEFAULT 'tenant-assets',
  storage_path text NOT NULL,
  original_filename varchar(255) NOT NULL,
  mime_type varchar(100) NOT NULL,
  byte_size bigint NOT NULL,
  width integer,
  height integer,
  alt_text varchar(255),
  is_private boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_media_assets_composite UNIQUE (tenant_id, id)
);

CREATE INDEX IF NOT EXISTS idx_media_assets_tenant ON public.media_assets(tenant_id);

-- 2. Tabela de Categorias de Produtos
CREATE TABLE IF NOT EXISTS public.product_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name varchar(100) NOT NULL,
  slug varchar(100) NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_product_categories_slug UNIQUE (tenant_id, slug),
  CONSTRAINT uq_product_categories_composite UNIQUE (tenant_id, id)
);

CREATE INDEX IF NOT EXISTS idx_product_categories_tenant ON public.product_categories(tenant_id, display_order);

-- 3. Tabela de Produtos (com Composite FK para Categoria e Mídia)
CREATE TABLE IF NOT EXISTS public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  category_id uuid,
  name varchar(150) NOT NULL,
  slug varchar(150) NOT NULL,
  short_description text,
  full_description text,
  cover_media_id uuid,
  status varchar(20) NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'archived')),
  is_featured boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_products_slug UNIQUE (tenant_id, slug),
  CONSTRAINT uq_products_composite UNIQUE (tenant_id, id),
  CONSTRAINT fk_products_category_cross_tenant_safe
    FOREIGN KEY (tenant_id, category_id)
    REFERENCES public.product_categories(tenant_id, id)
    ON DELETE SET NULL,
  CONSTRAINT fk_products_cover_media_cross_tenant_safe
    FOREIGN KEY (tenant_id, cover_media_id)
    REFERENCES public.media_assets(tenant_id, id)
    ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_products_tenant_status ON public.products(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_products_featured ON public.products(tenant_id, is_featured) WHERE status = 'active';

-- 4. Tabela de Variações de Produto (com Unidade de Medida Configurável e Composite FK)
CREATE TABLE IF NOT EXISTS public.product_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_id uuid NOT NULL,
  name varchar(100) NOT NULL,
  sku varchar(60),
  unit_type varchar(20) NOT NULL DEFAULT 'ml' CHECK (unit_type IN ('ml', 'l', 'g', 'kg', 'un', 'cx', 'portion', 'other')),
  unit_value numeric(10,2) NOT NULL DEFAULT 1.00,
  price_in_cents integer NOT NULL DEFAULT 0,
  is_available boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_product_variants_composite UNIQUE (tenant_id, id),
  CONSTRAINT fk_product_variants_product_cross_tenant_safe
    FOREIGN KEY (tenant_id, product_id)
    REFERENCES public.products(tenant_id, id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_product_variants_lookup ON public.product_variants(tenant_id, product_id, display_order);

-- 5. Ficha Informativa de Produto (Alimentos / Conservação / Preparo)
CREATE TABLE IF NOT EXISTS public.product_information (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_id uuid NOT NULL,
  ingredients text,
  allergens text,
  conservation_instructions text,
  preparation_instructions text,
  nutritional_info jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_product_information_product UNIQUE (tenant_id, product_id),
  CONSTRAINT fk_product_information_product_cross_tenant_safe
    FOREIGN KEY (tenant_id, product_id)
    REFERENCES public.products(tenant_id, id)
    ON DELETE CASCADE
);

-- ==============================================================================
-- POLÍTICAS RLS (Row Level Security) - Catálogo e Mídia
-- ==============================================================================

ALTER TABLE public.media_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_information ENABLE ROW LEVEL SECURITY;

-- Media Assets: Públicas visíveis para leitura pública; Privadas apenas para membros
CREATE POLICY "Public read public media" ON public.media_assets
  FOR SELECT USING (is_private = false);

CREATE POLICY "Members read all media" ON public.media_assets
  FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id));

CREATE POLICY "Admin manage media" ON public.media_assets
  FOR ALL TO authenticated
  USING (public.has_tenant_role(tenant_id, 'tenant_admin'));

-- Product Categories: Leitura pública se ativa de tenant ativo; Admin gerencia
CREATE POLICY "Public read active categories" ON public.product_categories
  FOR SELECT USING (
    is_active = true AND
    EXISTS (SELECT 1 FROM public.tenants WHERE tenants.id = product_categories.tenant_id AND tenants.status = 'active')
  );

CREATE POLICY "Admin manage categories" ON public.product_categories
  FOR ALL TO authenticated
  USING (public.has_tenant_role(tenant_id, 'tenant_admin'));

-- Products: Leitura pública se ativo; Admin gerencia
CREATE POLICY "Public read active products" ON public.products
  FOR SELECT USING (
    status = 'active' AND
    EXISTS (SELECT 1 FROM public.tenants WHERE tenants.id = products.tenant_id AND tenants.status = 'active')
  );

CREATE POLICY "Admin manage products" ON public.products
  FOR ALL TO authenticated
  USING (public.has_tenant_role(tenant_id, 'tenant_admin'));

-- Product Variants: Leitura pública se disponível e produto ativo
CREATE POLICY "Public read active variants" ON public.product_variants
  FOR SELECT USING (
    is_available = true AND
    EXISTS (
      SELECT 1 FROM public.products 
      WHERE products.id = product_variants.product_id 
        AND products.status = 'active'
    )
  );

CREATE POLICY "Admin manage variants" ON public.product_variants
  FOR ALL TO authenticated
  USING (public.has_tenant_role(tenant_id, 'tenant_admin'));

-- Product Information: Leitura pública se produto ativo
CREATE POLICY "Public read product info" ON public.product_information
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.products 
      WHERE products.id = product_information.product_id 
        AND products.status = 'active'
    )
  );

CREATE POLICY "Admin manage product info" ON public.product_information
  FOR ALL TO authenticated
  USING (public.has_tenant_role(tenant_id, 'tenant_admin'));
