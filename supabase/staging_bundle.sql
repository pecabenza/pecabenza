-- ==============================================================================
-- BUNDLE DE MIGRATIONS DE STAGING - SAAS SYSFOOD (MIGRATIONS 00001 A 00006)
-- Gerado automaticamente para execução no Supabase SQL Editor
-- ==============================================================================


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- INÍCIO: 00001_multi_tenant_foundation.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ==============================================================================
-- Migration 00001: Multi-Tenant Foundation, RBAC Helper Functions & Immutable Audit
-- ==============================================================================

-- 1. Extensões necessárias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Tabela de Tenants
CREATE TABLE IF NOT EXISTS public.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(150) NOT NULL,
  slug varchar(60) NOT NULL UNIQUE,
  status varchar(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'cancelled')),
  site_mode varchar(20) NOT NULL DEFAULT 'prelaunch' CHECK (site_mode IN ('prelaunch', 'live')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Suporte a integridade cross-tenant
ALTER TABLE public.tenants ADD CONSTRAINT uq_tenants_id_tenant UNIQUE (id);

-- 3. Tabela de Domínios por Tenant
CREATE TABLE IF NOT EXISTS public.tenant_domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  hostname varchar(255) NOT NULL UNIQUE,
  is_primary boolean NOT NULL DEFAULT false,
  is_verified boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_tenant_domains_composite UNIQUE (tenant_id, id)
);

CREATE INDEX IF NOT EXISTS idx_tenant_domains_hostname ON public.tenant_domains(hostname);

-- 4. Tabela de Membros da Equipe do Tenant
CREATE TABLE IF NOT EXISTS public.tenant_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role varchar(30) NOT NULL DEFAULT 'tenant_admin' CHECK (role IN ('tenant_admin', 'tenant_manager')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_tenant_members_user UNIQUE (tenant_id, user_id),
  CONSTRAINT uq_tenant_members_composite UNIQUE (tenant_id, id)
);

CREATE INDEX IF NOT EXISTS idx_tenant_members_lookup ON public.tenant_members(user_id, tenant_id) WHERE is_active = true;

-- 5. Funções Auxiliares Seguras de RBAC (SECURITY DEFINER + search_path fixo, Anti-Recursão)
CREATE OR REPLACE FUNCTION public.is_tenant_member(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM public.tenant_members
    WHERE tenant_id = p_tenant_id 
      AND user_id = auth.uid() 
      AND is_active = true
  );
$$;

CREATE OR REPLACE FUNCTION public.has_tenant_role(p_tenant_id uuid, p_role text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM public.tenant_members
    WHERE tenant_id = p_tenant_id 
      AND user_id = auth.uid() 
      AND role = p_role
      AND is_active = true
  );
$$;

-- 6. Tabela de Configurações Operacionais do Tenant
CREATE TABLE IF NOT EXISTS public.tenant_settings (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  contact_email varchar(255),
  contact_phone varchar(30),
  contact_whatsapp varchar(30),
  instagram_handle varchar(100),
  address_summary text,
  prelaunch_banner_text text NOT NULL DEFAULT 'Em breve',
  prelaunch_cta_text varchar(80) NOT NULL DEFAULT 'Em breve',
  business_hours jsonb NOT NULL DEFAULT '{}'::jsonb,
  seo_defaults jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 7. Tabela de Identidade Visual / Branding do Tenant
CREATE TABLE IF NOT EXISTS public.tenant_branding (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  logo_url text,
  favicon_url text,
  font_family_heading varchar(80) NOT NULL DEFAULT 'Inter',
  font_family_body varchar(80) NOT NULL DEFAULT 'Inter',
  color_primary varchar(30) NOT NULL DEFAULT '#A84B2C',
  color_secondary varchar(30) NOT NULL DEFAULT '#D99B26',
  color_accent varchar(30) NOT NULL DEFAULT '#2C1A14',
  color_background varchar(30) NOT NULL DEFAULT '#FDFBF7',
  color_surface varchar(30) NOT NULL DEFAULT '#FFFFFF',
  color_text varchar(30) NOT NULL DEFAULT '#1C1917',
  border_radius varchar(20) NOT NULL DEFAULT '0.5rem',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 8. Tabela de Auditoria Imutável (Append-Only)
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id),
  action varchar(60) NOT NULL,
  resource_type varchar(60) NOT NULL,
  resource_id varchar(100) NOT NULL,
  payload_before jsonb,
  payload_after jsonb,
  ip_address varchar(45),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_time ON public.audit_logs(tenant_id, created_at DESC);

-- Trigger de Imutabilidade Total de audit_logs
CREATE OR REPLACE FUNCTION public.prevent_audit_log_tampering()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs é estritamente imutável. Atualizações ou exclusões são proibidas.';
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_audit_log_update_delete ON public.audit_logs;
CREATE TRIGGER trg_prevent_audit_log_update_delete
BEFORE UPDATE OR DELETE ON public.audit_logs
FOR EACH ROW EXECUTE FUNCTION public.prevent_audit_log_tampering();

-- ==============================================================================
-- POLÍTICAS RLS (Row Level Security) - Fundação
-- ==============================================================================

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_branding ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Tenants: Leitura pública se ativo, ou membro autenticado
CREATE POLICY "Public read active tenants" ON public.tenants
  FOR SELECT USING (status = 'active');

CREATE POLICY "Admin manage their tenant" ON public.tenants
  FOR UPDATE TO authenticated
  USING (public.has_tenant_role(id, 'tenant_admin'));

-- Tenant Domains: Leitura pública para resolução de host
CREATE POLICY "Public read verified domains" ON public.tenant_domains
  FOR SELECT USING (is_verified = true);

CREATE POLICY "Admin manage domains" ON public.tenant_domains
  FOR ALL TO authenticated
  USING (public.has_tenant_role(tenant_id, 'tenant_admin'));

-- Tenant Members: O usuário só enxerga seus próprios vínculos
CREATE POLICY "Users read own memberships" ON public.tenant_members
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admin manage tenant members" ON public.tenant_members
  FOR ALL TO authenticated
  USING (public.has_tenant_role(tenant_id, 'tenant_admin'));

-- Tenant Settings: Leitura pública (tenant ativo), edição apenas tenant_admin
CREATE POLICY "Public read tenant settings" ON public.tenant_settings
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.tenants WHERE tenants.id = tenant_settings.tenant_id AND tenants.status = 'active')
  );

CREATE POLICY "Admin manage tenant settings" ON public.tenant_settings
  FOR ALL TO authenticated
  USING (public.has_tenant_role(tenant_id, 'tenant_admin'));

-- Tenant Branding: Leitura pública (tenant ativo), edição apenas tenant_admin
CREATE POLICY "Public read tenant branding" ON public.tenant_branding
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.tenants WHERE tenants.id = tenant_branding.tenant_id AND tenants.status = 'active')
  );

CREATE POLICY "Admin manage tenant branding" ON public.tenant_branding
  FOR ALL TO authenticated
  USING (public.has_tenant_role(tenant_id, 'tenant_admin'));

-- Audit Logs: Inserção por qualquer usuário autenticado que atue no tenant, leitura pelo admin, sem UPDATE/DELETE
CREATE POLICY "Insert audit log" ON public.audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (public.is_tenant_member(tenant_id));

CREATE POLICY "Admin read audit logs" ON public.audit_logs
  FOR SELECT TO authenticated
  USING (public.has_tenant_role(tenant_id, 'tenant_admin'));


-- FIM: 00001_multi_tenant_foundation.sql


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- INÍCIO: 00002_catalog_and_media.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

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


-- FIM: 00002_catalog_and_media.sql


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- INÍCIO: 00003_cms_and_sections.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ==============================================================================
-- Migration 00003: CMS Pages, Sections Engine & Leads Collection
-- ==============================================================================

-- 1. Tabela de Páginas do Tenant
CREATE TABLE IF NOT EXISTS public.tenant_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  slug varchar(100) NOT NULL,
  title varchar(150) NOT NULL,
  meta_title varchar(150),
  meta_description text,
  og_media_id uuid,
  status varchar(20) NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published')),
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_tenant_pages_slug UNIQUE (tenant_id, slug),
  CONSTRAINT uq_tenant_pages_composite UNIQUE (tenant_id, id),
  CONSTRAINT fk_tenant_pages_og_media_cross_tenant_safe
    FOREIGN KEY (tenant_id, og_media_id)
    REFERENCES public.media_assets(tenant_id, id)
    ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_tenant_pages_lookup ON public.tenant_pages(tenant_id, slug, status);

-- 2. Tabela de Seções de Página (Sistema de Blocos do CMS)
CREATE TABLE IF NOT EXISTS public.tenant_page_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  page_id uuid NOT NULL,
  section_type varchar(60) NOT NULL,
  variant varchar(40) NOT NULL DEFAULT 'editorial',
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_tenant_page_sections_composite UNIQUE (tenant_id, id),
  CONSTRAINT fk_tenant_page_sections_page_cross_tenant_safe
    FOREIGN KEY (tenant_id, page_id)
    REFERENCES public.tenant_pages(tenant_id, id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tenant_page_sections_order ON public.tenant_page_sections(tenant_id, page_id, display_order) WHERE is_active = true;

-- 3. Tabela de Leads / Contatos de Pré-lançamento
CREATE TABLE IF NOT EXISTS public.site_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name varchar(150) NOT NULL,
  email varchar(255) NOT NULL,
  phone varchar(30),
  source_page varchar(100) NOT NULL DEFAULT 'home',
  consent_given boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_site_leads_tenant ON public.site_leads(tenant_id, created_at DESC);

-- ==============================================================================
-- POLÍTICAS RLS (Row Level Security) - CMS e Leads
-- ==============================================================================

ALTER TABLE public.tenant_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_page_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_leads ENABLE ROW LEVEL SECURITY;

-- Tenant Pages: Leitura pública se publicada e tenant ativo; Admin gerencia
CREATE POLICY "Public read published pages" ON public.tenant_pages
  FOR SELECT USING (
    status = 'published' AND
    EXISTS (SELECT 1 FROM public.tenants WHERE tenants.id = tenant_pages.tenant_id AND tenants.status = 'active')
  );

CREATE POLICY "Admin manage pages" ON public.tenant_pages
  FOR ALL TO authenticated
  USING (public.has_tenant_role(tenant_id, 'tenant_admin'));

-- Tenant Page Sections: Leitura pública se ativa em página publicada; Admin gerencia
CREATE POLICY "Public read active sections" ON public.tenant_page_sections
  FOR SELECT USING (
    is_active = true AND
    EXISTS (
      SELECT 1 FROM public.tenant_pages 
      WHERE tenant_pages.id = tenant_page_sections.page_id 
        AND tenant_pages.status = 'published'
        AND EXISTS (SELECT 1 FROM public.tenants WHERE tenants.id = tenant_pages.tenant_id AND tenants.status = 'active')
    )
  );

CREATE POLICY "Admin manage sections" ON public.tenant_page_sections
  FOR ALL TO authenticated
  USING (public.has_tenant_role(tenant_id, 'tenant_admin'));

-- Site Leads: Visitante anônimo pode cadastrar lead; Admin do tenant consulta
CREATE POLICY "Public insert leads" ON public.site_leads
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.tenants WHERE tenants.id = site_leads.tenant_id AND tenants.status = 'active')
  );

CREATE POLICY "Admin read leads" ON public.site_leads
  FOR SELECT TO authenticated
  USING (public.has_tenant_role(tenant_id, 'tenant_admin'));


-- FIM: 00003_cms_and_sections.sql


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- INÍCIO: 00004_seed_benza.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ==============================================================================
-- Migration 00004: Seed Inaugural BENZA (Tenant 01) — Versão Homologada (Etapa 1B)
-- Textos revisados: linguagem elegante, sóbria e factual, sem claims não homologados
-- ==============================================================================

DO $$
DECLARE
  v_tenant_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_category_id uuid := gen_random_uuid();
  v_prod_feijoada_id uuid := gen_random_uuid();
  v_prod_lasanha_id uuid := gen_random_uuid();
  v_page_home_id uuid := gen_random_uuid();
  v_page_sobre_id uuid := gen_random_uuid();
  v_page_produtos_id uuid := gen_random_uuid();
  v_page_contato_id uuid := gen_random_uuid();
BEGIN
  -- 1. Inserir Tenant BENZA
  INSERT INTO public.tenants (id, name, slug, status, site_mode)
  VALUES (
    v_tenant_id,
    'BENZA',
    'benza',
    'active',
    'prelaunch'
  )
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    slug = EXCLUDED.slug,
    site_mode = EXCLUDED.site_mode;

  -- 2. Domínios
  INSERT INTO public.tenant_domains (tenant_id, hostname, is_primary, is_verified)
  VALUES 
    (v_tenant_id, 'benza.localhost', true, true),
    (v_tenant_id, 'localhost', false, true),
    (v_tenant_id, 'benza.com.br', false, true)
  ON CONFLICT (hostname) DO NOTHING;

  -- 3. Configurações Operacionais (Sem claims agressivos ou não homologados)
  INSERT INTO public.tenant_settings (
    tenant_id,
    contact_email,
    contact_phone,
    contact_whatsapp,
    instagram_handle,
    address_summary,
    prelaunch_banner_text,
    prelaunch_cta_text,
    business_hours,
    seo_defaults
  ) VALUES (
    v_tenant_id,
    'contato@benza.com.br',
    '+55 11 98765-4321',
    '+55 11 98765-4321',
    'benza.gastronomia',
    'São Paulo, SP — Atendimento e encomendas programadas',
    'Em breve: pratos prontos congelados para o seu dia a dia e momentos especiais.',
    'Em breve',
    '{"producao": "Segunda a Quarta", "entregas": "Quinta a Domingo"}'::jsonb,
    '{"default_meta_title": "BENZA — Pratos Prontos e Conforto Gastronômico", "default_meta_description": "Cardápio de pratos preparados e porcionados para aquecer na sua mesa."}'::jsonb
  )
  ON CONFLICT (tenant_id) DO UPDATE SET
    contact_email = EXCLUDED.contact_email,
    prelaunch_banner_text = EXCLUDED.prelaunch_banner_text,
    prelaunch_cta_text = EXCLUDED.prelaunch_cta_text;

  -- 4. Identidade Visual / Branding (Paleta Oficial BENZA)
  INSERT INTO public.tenant_branding (
    tenant_id,
    logo_url,
    favicon_url,
    font_family_heading,
    font_family_body,
    color_primary,
    color_secondary,
    color_accent,
    color_background,
    color_surface,
    color_text,
    border_radius
  ) VALUES (
    v_tenant_id,
    null,
    null,
    'Playfair Display',
    'Plus Jakarta Sans',
    '#A84B2C', -- Terracota acolhedor
    '#D99B26', -- Mostarda / Dourado elegante
    '#2C1A14', -- Marrom profundo
    '#FDFBF7', -- Creme / Marfim suave
    '#FFFFFF', -- Superfície pura
    '#1C1917', -- Texto grafite escuro
    '0.75rem'
  )
  ON CONFLICT (tenant_id) DO UPDATE SET
    color_primary = EXCLUDED.color_primary,
    color_secondary = EXCLUDED.color_secondary,
    color_accent = EXCLUDED.color_accent,
    color_background = EXCLUDED.color_background;

  -- 5. Categoria de Produtos
  INSERT INTO public.product_categories (id, tenant_id, name, slug, display_order, is_active)
  VALUES (v_category_id, v_tenant_id, 'Pratos Principais', 'pratos-principais', 1, true)
  ON CONFLICT (tenant_id, slug) DO NOTHING;

  -- 6. Produto 01: Feijoada
  INSERT INTO public.products (
    id,
    tenant_id,
    category_id,
    name,
    slug,
    short_description,
    full_description,
    status,
    is_featured
  ) VALUES (
    v_prod_feijoada_id,
    v_tenant_id,
    v_category_id,
    'Feijoada BENZA',
    'feijoada-benza',
    'Feijão preto cozido com carnes e temperos clássicos.',
    'A feijoada BENZA é preparada com feijão preto, carnes bovinas e suínas dessalgadas e tempero suave com alho, cebola e louro. Congelada logo após o cozimento para manter o frescor e a textura dos ingredientes, pronta para aquecer.',
    'active',
    true
  )
  ON CONFLICT (tenant_id, slug) DO NOTHING;

  -- Variações Feijoada (500 ml e 1000 ml)
  INSERT INTO public.product_variants (
    tenant_id,
    product_id,
    name,
    sku,
    unit_type,
    unit_value,
    price_in_cents,
    is_available,
    display_order
  ) VALUES 
    (v_tenant_id, v_prod_feijoada_id, '500 ml (Individual farto)', 'BNZ-FEIJ-500', 'ml', 500, 4800, true, 1),
    (v_tenant_id, v_prod_feijoada_id, '1000 ml (Para compartilhar)', 'BNZ-FEIJ-1000', 'ml', 1000, 8900, true, 2);

  -- Ficha Técnica Feijoada
  INSERT INTO public.product_information (
    tenant_id,
    product_id,
    ingredients,
    allergens,
    conservation_instructions,
    preparation_instructions,
    nutritional_info
  ) VALUES (
    v_tenant_id,
    v_prod_feijoada_id,
    'Feijão preto, carne seca, lombo suíno, costelinha suína, paio, linguiça calabresa, alho, cebola, louro e azeite.',
    'Não contém glúten. Pode conter derivados de soja.',
    'Manter congelado conforme orientação da embalagem. Após descongelar, manter sob refrigeração e consumir em até 24h. Não recongelar.',
    'Em panela: aquecer em fogo brando com 2 a 3 colheres de sopa de água até aquecer completamente, mexendo delicadamente.',
    '{"porcao": "250g", "calorias": "380 kcal", "proteinas": "28g", "gorduras": "16g", "carboidratos": "31g", "sodio": "720mg"}'::jsonb
  );

  -- 7. Produto 02: Lasanha
  INSERT INTO public.products (
    id,
    tenant_id,
    category_id,
    name,
    slug,
    short_description,
    full_description,
    status,
    is_featured
  ) VALUES (
    v_prod_lasanha_id,
    v_tenant_id,
    v_category_id,
    'Lasanha Tradicional',
    'lasanha-tradicional',
    'Massa em camadas com molho de carne e bechamel cremoso.',
    'Receita clássica preparada com massa fresca, molho de tomate cozido lentamente com carne moída, bechamel com toque de noz-moscada e cobertura de queijo para gratinar.',
    'active',
    true
  )
  ON CONFLICT (tenant_id, slug) DO NOTHING;

  -- Variações Lasanha (500 ml e 1000 ml)
  INSERT INTO public.product_variants (
    tenant_id,
    product_id,
    name,
    sku,
    unit_type,
    unit_value,
    price_in_cents,
    is_available,
    display_order
  ) VALUES 
    (v_tenant_id, v_prod_lasanha_id, '500 ml (Individual)', 'BNZ-LAS-500', 'ml', 500, 4600, true, 1),
    (v_tenant_id, v_prod_lasanha_id, '1000 ml (Duas pessoas)', 'BNZ-LAS-1000', 'ml', 1000, 8500, true, 2);

  -- Ficha Técnica Lasanha
  INSERT INTO public.product_information (
    tenant_id,
    product_id,
    ingredients,
    allergens,
    conservation_instructions,
    preparation_instructions,
    nutritional_info
  ) VALUES (
    v_tenant_id,
    v_prod_lasanha_id,
    'Farinha de trigo enriquecida, ovos, carne bovina moída, tomate, leite integral, manteiga, queijo mozarela, parmesão e temperos.',
    'Contém glúten, leite e ovos. Contém lactose.',
    'Manter congelado conforme orientação da embalagem. Não recongelar após o descongelamento.',
    'Forno pré-aquecido a 180°C por 25 a 30 minutos na própria embalagem forneável (remover tampa plástica antes do forno).',
    '{"porcao": "250g", "calorias": "410 kcal", "proteinas": "22g", "gorduras": "19g", "carboidratos": "38g", "sodio": "640mg"}'::jsonb
  );

  -- 8. Páginas do Tenant
  INSERT INTO public.tenant_pages (id, tenant_id, slug, title, meta_title, meta_description, status, published_at)
  VALUES 
    (v_page_home_id, v_tenant_id, 'home', 'Página Inicial', 'BENZA — Pratos Prontos Congelados', 'Conheça nossos pratos preparados para aquecer na sua mesa.', 'published', now()),
    (v_page_sobre_id, v_tenant_id, 'sobre', 'Nossa Proposta', 'Nossa Proposta | BENZA', 'A dedicação e o cuidado por trás de cada prato preparado pela BENZA.', 'published', now()),
    (v_page_produtos_id, v_tenant_id, 'produtos', 'Cardápio', 'Cardápio de Pratos | BENZA', 'Confira nossa seleção de pratos em porções de 500 ml e 1000 ml.', 'published', now()),
    (v_page_contato_id, v_tenant_id, 'contato', 'Contato', 'Contato | BENZA', 'Fale com a nossa equipe para informações sobre pratos e disponibilidade.', 'published', now())
  ON CONFLICT (tenant_id, slug) DO NOTHING;

  -- 9. Seções da Home (Linguagem elegante, sem claims não homologados)
  INSERT INTO public.tenant_page_sections (tenant_id, page_id, section_type, variant, display_order, is_active, content)
  VALUES 
    (
      v_tenant_id,
      v_page_home_id,
      'HeroEditorial',
      'editorial',
      1,
      true,
      '{
        "badge": "Cardápio Inaugural em Breve",
        "title": "A comodidade da boa comida à sua mesa",
        "subtitle": "Pratos clássicos preparados com cuidado e prontos para aquecer. Porções individuais e para compartilhar, feitas para o seu dia a dia.",
        "primary_cta_label": "Conheça os Pratos",
        "primary_cta_href": "/produtos",
        "secondary_cta_label": "Nossa Proposta",
        "secondary_cta_href": "/sobre",
        "highlight_note": "Abertura de pedidos em breve",
        "image_url": "/assets/brands/benza/mockup-hero-editorial.jpg"
      }'::jsonb
    ),
    (
      v_tenant_id,
      v_page_home_id,
      'BrandStorySection',
      'split',
      2,
      true,
      '{
        "eyebrow": "Nossa Proposta",
        "title": "Receitas bem executadas para a sua rotina",
        "lead_paragraph": "A BENZA nasceu para oferecer refeições práticas sem abrir mão do sabor de uma comida feita com atenção aos detalhes.",
        "description": "Nossos pratos são preparados, porcionados e congelados para que você possa desfrutar de uma refeição completa com o simples aquecimento em casa ou no trabalho.",
        "cta_label": "Conheça mais sobre nós",
        "cta_href": "/sobre",
        "image_url": "/assets/brands/benza/mockup-hero-editorial.jpg"
      }'::jsonb
    ),
    (
      v_tenant_id,
      v_page_home_id,
      'ProductShowcaseSection',
      'cards',
      3,
      true,
      '{
        "title": "Pratos em Destaque",
        "subtitle": "Conheça as primeiras opções que estarão disponíveis no cardápio inaugural.",
        "show_variants": true,
        "cta_label": "Ver cardápio completo",
        "cta_href": "/produtos"
      }'::jsonb
    ),
    (
      v_tenant_id,
      v_page_home_id,
      'BenefitsSection',
      'grid',
      4,
      true,
      '{
        "title": "Como Funciona a BENZA",
        "subtitle": "Praticidade, porções pensadas e preparo descomplicado.",
        "items": [
          {
            "icon": "UtensilsCrossed",
            "title": "Preparo Clássico",
            "description": "Receitas tradicionais bem executadas, com temperos naturais e sem complicações."
          },
          {
            "icon": "Snowflake",
            "title": "Conservação no Freezer",
            "description": "Pratos congelados com instruções claras de conservação na embalagem."
          },
          {
            "icon": "Clock",
            "title": "Aquecimento Rápido",
            "description": "Prontos para aquecer no fogão ou no forno em poucos minutos."
          },
          {
            "icon": "ShieldCheck",
            "title": "Porções sob Medida",
            "description": "Embalagens práticas de 500 ml e 1000 ml adequadas à sua necessidade."
          }
        ]
      }'::jsonb
    ),
    (
      v_tenant_id,
      v_page_home_id,
      'CTASection',
      'banner',
      5,
      true,
      '{
        "title": "Acompanhe o início das operações",
        "description": "Cadastre seu e-mail para receber a data de abertura dos primeiros pedidos e novidades do cardápio.",
        "form_placeholder": "Digite seu e-mail",
        "button_label": "Cadastrar para novidades",
        "disclaimer": "Não enviamos spam. Apenas avisos sobre o lançamento e novidades da BENZA."
      }'::jsonb
    ),
    (
      v_tenant_id,
      v_page_home_id,
      'FAQSection',
      'accordion',
      6,
      true,
      '{
        "title": "Perguntas Frequentes",
        "subtitle": "Informações essenciais sobre nossos pratos e atendimento.",
        "items": [
          {
            "question": "Como conservar os pratos após o recebimento?",
            "answer": "Armazene sob congelamento conforme orientação da embalagem. Após descongelar, mantenha refrigerado e consuma em até 24 horas."
          },
          {
            "question": "Qual o rendimento das porções de 500 ml e 1000 ml?",
            "answer": "A embalagem de 500 ml foi calculada para uma porção individual generosa. A embalagem de 1000 ml atende duas pessoas confortavelmente."
          },
          {
            "question": "Como é feito o aquecimento?",
            "answer": "As orientações estão indicadas na embalagem de cada prato, podendo ser aquecidos no forno ou em panela conforme o tipo de prato."
          }
        ]
      }'::jsonb
    ),
    (
      v_tenant_id,
      v_page_home_id,
      'ContactSection',
      'split',
      7,
      true,
      '{
        "title": "Fale Conosco",
        "description": "Dúvidas ou sugestões? Nossa equipe está pronta para conversar.",
        "show_form": true,
        "show_social": true
      }'::jsonb
    );

END $$;


-- FIM: 00004_seed_benza.sql


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- INÍCIO: 00005_homologation_tenant_02.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ==============================================================================
-- Migration 00005: Tenant 02 de Homologação Multi-Tenant (Cacau & Flor)
-- ==============================================================================

DO $$
DECLARE
  v_tenant_id uuid := '00000000-0000-0000-0000-000000000002'::uuid;
  v_category_id uuid := gen_random_uuid();
  v_prod_bolo_id uuid := gen_random_uuid();
  v_page_home_id uuid := gen_random_uuid();
  v_page_sobre_id uuid := gen_random_uuid();
  v_page_produtos_id uuid := gen_random_uuid();
  v_page_contato_id uuid := gen_random_uuid();
BEGIN
  -- 1. Inserir Tenant 02 (Cacau & Flor)
  INSERT INTO public.tenants (id, name, slug, status, site_mode)
  VALUES (
    v_tenant_id,
    'Cacau & Flor',
    'cacau-flor',
    'active',
    'prelaunch'
  )
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    slug = EXCLUDED.slug,
    site_mode = EXCLUDED.site_mode;

  -- 2. Domínios do Tenant 02
  INSERT INTO public.tenant_domains (tenant_id, hostname, is_primary, is_verified)
  VALUES 
    (v_tenant_id, 'cacauflor.localhost', true, true),
    (v_tenant_id, 'cacauflor.com.br', false, true)
  ON CONFLICT (hostname) DO NOTHING;

  -- 3. Configurações Operacionais do Tenant 02
  INSERT INTO public.tenant_settings (
    tenant_id,
    contact_email,
    contact_phone,
    contact_whatsapp,
    instagram_handle,
    address_summary,
    prelaunch_banner_text,
    prelaunch_cta_text,
    business_hours,
    seo_defaults
  ) VALUES (
    v_tenant_id,
    'encomendas@cacauflor.com.br',
    '+55 11 91234-5678',
    '+55 11 91234-5678',
    'cacauflor.confeitaria',
    'Belo Horizonte, MG — Confeitaria botânica sob encomenda',
    'Em breve: doces finos e bolos afetivos para celebrar seus momentos.',
    'Em breve',
    '{"atendimento": "Terça a Sábado, das 09h às 18h"}'::jsonb,
    '{"default_meta_title": "Cacau & Flor — Confeitaria Afetiva", "default_meta_description": "Bolos artesanais, doces finos e sabores botânicos sob encomenda."}'::jsonb
  )
  ON CONFLICT (tenant_id) DO UPDATE SET
    contact_email = EXCLUDED.contact_email,
    prelaunch_banner_text = EXCLUDED.prelaunch_banner_text;

  -- 4. Identidade Visual Distinta (Paleta Verde Oliva & Lavanda)
  INSERT INTO public.tenant_branding (
    tenant_id,
    font_family_heading,
    font_family_body,
    color_primary,
    color_secondary,
    color_accent,
    color_background,
    color_surface,
    color_text,
    border_radius
  ) VALUES (
    v_tenant_id,
    'Playfair Display',
    'Plus Jakarta Sans',
    '#4A583B', -- Verde Oliva
    '#8B6B88', -- Lavanda / Ameixa
    '#2B3322', -- Oliva Profundo
    '#F9F8F5', -- Creme Baunilha
    '#FFFFFF', -- Branco
    '#1A2016', -- Grafite Verdejante
    '1rem'     -- Cantos mais arredondados
  )
  ON CONFLICT (tenant_id) DO UPDATE SET
    color_primary = EXCLUDED.color_primary,
    color_secondary = EXCLUDED.color_secondary,
    color_accent = EXCLUDED.color_accent;

  -- 5. Categoria de Produtos do Tenant 02
  INSERT INTO public.product_categories (id, tenant_id, name, slug, display_order, is_active)
  VALUES (v_category_id, v_tenant_id, 'Bolos Especiais', 'bolos-especiais', 1, true)
  ON CONFLICT (tenant_id, slug) DO NOTHING;

  -- 6. Produto Inaugural do Tenant 02: Bolo de Nozes com Baba de Moça
  INSERT INTO public.products (
    id,
    tenant_id,
    category_id,
    name,
    slug,
    short_description,
    full_description,
    status,
    is_featured
  ) VALUES (
    v_prod_bolo_id,
    v_tenant_id,
    v_category_id,
    'Bolo de Nozes com Baba de Moça',
    'bolo-de-nozes-baba-de-moca',
    'Massa úmida de nozes chilenas intercalada com clássica baba de moça aveludada.',
    'Uma das receitas mais nobres e queridas da nossa confeitaria. Massa amanteigada enriquecida com farinha de nozes frescas moídas na hora, recheada com baba de moça tradicional cozida em tacho de cobre e finalizada com merengue tostado e flores comestíveis.',
    'active',
    true
  )
  ON CONFLICT (tenant_id, slug) DO NOTHING;

  -- Variações em Gramas (500 g e 1000 g)
  INSERT INTO public.product_variants (
    tenant_id,
    product_id,
    name,
    sku,
    unit_type,
    unit_value,
    price_in_cents,
    is_available,
    display_order
  ) VALUES 
    (v_tenant_id, v_prod_bolo_id, '500 g (Aproximadamente 4 a 6 fatias)', 'CCF-BOLO-500', 'g', 500, 6800, true, 1),
    (v_tenant_id, v_prod_bolo_id, '1000 g (Aproximadamente 10 a 12 fatias)', 'CCF-BOLO-1000', 'g', 1000, 12500, true, 2);

  -- Ficha Técnica
  INSERT INTO public.product_information (
    tenant_id,
    product_id,
    ingredients,
    allergens,
    conservation_instructions,
    preparation_instructions,
    nutritional_info
  ) VALUES (
    v_tenant_id,
    v_prod_bolo_id,
    'Nozes chilenas, farinha de trigo enriquecida, gemas pasteurizadas, açúcar demerara, leite de coco artesanal, ovos caipiras e baunilha natural em fava.',
    'Contém glúten, ovos, nozes e leite. Pode conter traços de amêndoas e castanhas.',
    'Conservar refrigerado de 2°C a 6°C por até 5 dias.',
    'Retirar da geladeira 20 minutos antes de servir para atingir a textura perfeita de maciez da massa e aveludado do recheio.',
    '{"porcao": "100g", "calorias": "340 kcal", "proteinas": "6g", "gorduras": "18g", "carboidratos": "42g"}'::jsonb
  );

  -- 7. Páginas do Tenant 02
  INSERT INTO public.tenant_pages (id, tenant_id, slug, title, meta_title, meta_description, status, published_at)
  VALUES 
    (v_page_home_id, v_tenant_id, 'home', 'Início', 'Cacau & Flor — Confeitaria Afetiva', 'Doces finos e bolos artesanais sob encomenda.', 'published', now()),
    (v_page_sobre_id, v_tenant_id, 'sobre', 'O Atelier', 'Sobre o Atelier | Cacau & Flor', 'Conheça nosso atelier botânico de confeitaria.', 'published', now()),
    (v_page_produtos_id, v_tenant_id, 'produtos', 'Cardápio Doce', 'Cardápio de Bolos | Cacau & Flor', 'Nossas criações doces preparadas para celebrar a vida.', 'published', now()),
    (v_page_contato_id, v_tenant_id, 'contato', 'Encomendas', 'Contato e Encomendas | Cacau & Flor', 'Fale com nossa chef pâtissière para encomendas especiais.', 'published', now())
  ON CONFLICT (tenant_id, slug) DO NOTHING;

  -- 8. Seções da Home do Tenant 02 (Conteúdo e layout exclusivos da Cacau & Flor)
  INSERT INTO public.tenant_page_sections (tenant_id, page_id, section_type, variant, display_order, is_active, content)
  VALUES 
    (
      v_tenant_id,
      v_page_home_id,
      'HeroEditorial',
      'editorial',
      1,
      true,
      '{
        "badge": "Confeitaria Botânica & Afetiva",
        "title": "Açúcar, afeto e flores em celebrações inesquecíveis",
        "subtitle": "Bolos desenhados como pequenas obras de arte, com massas delicadas, nozes nobres e recheios aromáticos que perfumam a sua mesa.",
        "primary_cta_label": "Ver Cardápio Doce",
        "primary_cta_href": "/produtos",
        "secondary_cta_label": "Conhecer o Atelier",
        "secondary_cta_href": "/sobre",
        "highlight_note": "Agenda de encomendas aberta em breve"
      }'::jsonb
    ),
    (
      v_tenant_id,
      v_page_home_id,
      'BrandStorySection',
      'split',
      2,
      true,
      '{
        "eyebrow": "Nossa Filosofia",
        "title": "A doçura no ponto exato, sem excessos",
        "lead_paragraph": "Acreditamos que a confeitaria de excelência encontra equilíbrio entre acidez, crocância e texturas acetinadas.",
        "description": "Utilizamos exclusivamente nozes nobres, fava de baunilha de verdade e frutas da estação selecionadas de pequenos produtores.",
        "cta_label": "Conheça nossa trajetória",
        "cta_href": "/sobre"
      }'::jsonb
    ),
    (
      v_tenant_id,
      v_page_home_id,
      'ProductShowcaseSection',
      'cards',
      3,
      true,
      '{
        "title": "Criações em Destaque",
        "subtitle": "Receitas autorais para momentos especiais em família.",
        "show_variants": true,
        "cta_label": "Ver todos os bolos",
        "cta_href": "/produtos"
      }'::jsonb
    );

END $$;


-- FIM: 00005_homologation_tenant_02.sql


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- INÍCIO: 00006_storage_tenant_assets.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ==============================================================================
-- Migration 00006: Supabase Storage Configuration & Multi-Tenant Isolation
-- ==============================================================================

-- 1. Adicionar colunas de conservação parametrizável e classificação de assets
DO $$
BEGIN
  -- 1.1 Colunas de conservação flexível em product_information
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'product_information' 
      AND column_name = 'temp_min'
  ) THEN
    ALTER TABLE public.product_information 
    ADD COLUMN temp_min numeric(5,2),
    ADD COLUMN temp_max numeric(5,2),
    ADD COLUMN temp_unit varchar(2) DEFAULT 'C',
    ADD COLUMN shelf_life text,
    ADD COLUMN after_thawing_instructions text;
  END IF;

  -- 1.2 Colunas de asset_source e is_mockup em products
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'products' 
      AND column_name = 'asset_source'
  ) THEN
    ALTER TABLE public.products 
    ADD COLUMN asset_source varchar(30) NOT NULL DEFAULT 'official' 
    CHECK (asset_source IN ('official', 'mockup', 'pending')),
    ADD COLUMN is_mockup boolean NOT NULL DEFAULT false;
  END IF;

  -- 1.3 Coluna asset_source na tabela media_assets
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'media_assets' 
      AND column_name = 'asset_source'
  ) THEN
    ALTER TABLE public.media_assets 
    ADD COLUMN asset_source varchar(30) NOT NULL DEFAULT 'official' 
    CHECK (asset_source IN ('official', 'mockup', 'pending'));
  END IF;
END $$;

-- 2. Criar Bucket 'tenant-assets' no Supabase Storage caso não exista
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'tenant-assets',
  'tenant-assets',
  true,
  5242880, -- 5 MB máximo
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml', 'image/x-icon']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 3. Políticas de Segurança do Storage (storage.objects)
-- Estrutura de paths estrita: tenant-assets/{tenant_id}/{category}/{filename}

-- A. Leitura Pública para imagens públicas do bucket tenant-assets
DROP POLICY IF EXISTS "Public Read Tenant Assets" ON storage.objects;
CREATE POLICY "Public Read Tenant Assets" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'tenant-assets');

-- B. Inserção Restrita: Apenas membros administradores do respectivo tenant
DROP POLICY IF EXISTS "Tenant Admin Insert Assets" ON storage.objects;
CREATE POLICY "Tenant Admin Insert Assets" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'tenant-assets' AND
    public.has_tenant_role((storage.foldername(name))[1]::uuid, 'tenant_admin')
  );

-- C. Atualização e Exclusão Restrita: Apenas administradores do tenant dono da pasta
DROP POLICY IF EXISTS "Tenant Admin Update Delete Assets" ON storage.objects;
CREATE POLICY "Tenant Admin Update Delete Assets" ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id = 'tenant-assets' AND
    public.has_tenant_role((storage.foldername(name))[1]::uuid, 'tenant_admin')
  );


-- FIM: 00006_storage_tenant_assets.sql


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- INÍCIO: 00007_privacy_lgpd_and_seo.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ==============================================================================
-- Migration 00007: LGPD Privacy Framework, Analytics & Advanced SEO Fields
-- ==============================================================================

-- 1. Tabela de Registros de Consentimento (LGPD)
CREATE TABLE IF NOT EXISTS public.user_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  consent_type varchar(50) NOT NULL DEFAULT 'cookies_analytics',
  purpose varchar(100) NOT NULL,
  ip_hash varchar(64) NOT NULL,
  user_agent varchar(255),
  consent_given boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_consents_tenant ON public.user_consents(tenant_id, consent_type);

-- 2. Tabela de Solicitações de Titulares de Dados (LGPD - Acesso / Exclusão / Retificação)
CREATE TABLE IF NOT EXISTS public.privacy_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  email varchar(255) NOT NULL,
  request_type varchar(30) NOT NULL CHECK (request_type IN ('access', 'deletion', 'rectification')),
  status varchar(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'rejected')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_privacy_requests_tenant ON public.privacy_requests(tenant_id, status);

-- 3. Enriquecer site_leads com campos de auditoria LGPD se não existirem
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'site_leads' AND column_name = 'consent_ip_hash'
  ) THEN
    ALTER TABLE public.site_leads 
    ADD COLUMN consent_ip_hash varchar(64),
    ADD COLUMN consent_user_agent varchar(255),
    ADD COLUMN consent_purpose varchar(100) DEFAULT 'commercial_contact';
  END IF;
END $$;

-- 4. Suporte Avançado a SEO no CMS (tenant_pages e products)
DO $$
BEGIN
  -- 4.1 Colunas de SEO em tenant_pages
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'tenant_pages' AND column_name = 'primary_keyword'
  ) THEN
    ALTER TABLE public.tenant_pages
    ADD COLUMN primary_keyword varchar(100),
    ADD COLUMN secondary_keywords text[] DEFAULT '{}'::text[],
    ADD COLUMN search_intent varchar(30) DEFAULT 'informational' CHECK (search_intent IN ('commercial', 'informational', 'transactional', 'navigational')),
    ADD COLUMN canonical_url text;
  END IF;

  -- 4.2 Colunas de SEO em products
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'primary_keyword'
  ) THEN
    ALTER TABLE public.products
    ADD COLUMN primary_keyword varchar(100),
    ADD COLUMN secondary_keywords text[] DEFAULT '{}'::text[],
    ADD COLUMN search_intent varchar(30) DEFAULT 'transactional';
  END IF;

  -- 4.3 Campos de Analytics, Search Console e Schema.org em tenant_settings
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'tenant_settings' AND column_name = 'ga4_measurement_id'
  ) THEN
    ALTER TABLE public.tenant_settings
    ADD COLUMN ga4_measurement_id varchar(50),
    ADD COLUMN gsc_verification_tag varchar(100),
    ADD COLUMN business_type varchar(50),
    ADD COLUMN serves_cuisine varchar(100),
    ADD COLUMN price_range varchar(20);
  END IF;
END $$;

-- 5. RLS (Row Level Security) para Tabelas de Privacidade
ALTER TABLE public.user_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.privacy_requests ENABLE ROW LEVEL SECURITY;

-- Consentimentos: Inserção pública permitida; Leitura restrita ao administrador do tenant
DROP POLICY IF EXISTS "Public insert user consents" ON public.user_consents;
CREATE POLICY "Public insert user consents" ON public.user_consents
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Admin view user consents" ON public.user_consents;
CREATE POLICY "Admin view user consents" ON public.user_consents
  FOR SELECT TO authenticated
  USING (public.has_tenant_role(tenant_id, 'tenant_admin'));

-- Solicitações de Privacidade: Inserção pública; Leitura e gestão restrita ao admin do tenant
DROP POLICY IF EXISTS "Public insert privacy requests" ON public.privacy_requests;
CREATE POLICY "Public insert privacy requests" ON public.privacy_requests
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Admin manage privacy requests" ON public.privacy_requests;
CREATE POLICY "Admin manage privacy requests" ON public.privacy_requests
  FOR ALL TO authenticated
  USING (public.has_tenant_role(tenant_id, 'tenant_admin'));


-- FIM: 00007_privacy_lgpd_and_seo.sql

