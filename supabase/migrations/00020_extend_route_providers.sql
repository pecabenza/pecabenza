-- ==============================================================================
-- Migration 00020: Extend route_provider, optional geocode_provider & Neighborhood Plan B
-- Incremental & backward-compatible (does not edit 00019 already applied).
-- Existing tenants keep route_provider = 'google', geocode_provider = NULL (legacy),
-- and pricing_mode = 'fixed'.
-- ==============================================================================

ALTER TABLE public.tenant_commerce_settings
  DROP CONSTRAINT IF EXISTS tenant_commerce_settings_route_provider_check;

ALTER TABLE public.tenant_commerce_settings
  ADD CONSTRAINT tenant_commerce_settings_route_provider_check
  CHECK (route_provider IN ('google', 'mapbox', 'openrouteservice', 'osrm'));

ALTER TABLE public.tenant_commerce_settings
  ADD COLUMN IF NOT EXISTS geocode_provider varchar(20) DEFAULT NULL
  CHECK (geocode_provider IS NULL OR geocode_provider IN ('google', 'mapbox', 'openrouteservice'));

ALTER TABLE public.tenant_commerce_settings
  DROP CONSTRAINT IF EXISTS tenant_commerce_settings_contingency_policy_check;

ALTER TABLE public.tenant_commerce_settings
  ADD CONSTRAINT tenant_commerce_settings_contingency_policy_check
  CHECK (contingency_policy IN ('block_on_failure', 'fixed_fallback', 'neighborhood_fallback'));

ALTER TABLE public.tenant_commerce_settings
  ADD COLUMN IF NOT EXISTS neighborhood_rates jsonb NOT NULL DEFAULT '[]'::jsonb;
