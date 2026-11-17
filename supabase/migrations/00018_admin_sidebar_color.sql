-- ==============================================================================
-- Migration 00018: Cores customizáveis do Menu Lateral (Admin) e Botões/Hover
-- ==============================================================================

ALTER TABLE public.tenant_branding
  ADD COLUMN IF NOT EXISTS color_admin_sidebar varchar(20) NOT NULL DEFAULT '#1C1917',
  ADD COLUMN IF NOT EXISTS color_button varchar(20) NOT NULL DEFAULT '#A84B2C',
  ADD COLUMN IF NOT EXISTS color_button_hover varchar(20) NOT NULL DEFAULT '#8E3D22';
