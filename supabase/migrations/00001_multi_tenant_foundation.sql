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
