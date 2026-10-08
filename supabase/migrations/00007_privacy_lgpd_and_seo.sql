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
