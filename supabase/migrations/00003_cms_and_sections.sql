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
