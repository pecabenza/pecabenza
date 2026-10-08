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
