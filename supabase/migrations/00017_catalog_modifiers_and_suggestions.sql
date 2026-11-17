-- ==============================================================================
-- Migration 00017: Product Modifiers (Complementos) & Suggestions (Peça Também)
-- ==============================================================================

-- 1. Grupos de Complementos / Adicionais por Produto
CREATE TABLE IF NOT EXISTS public.product_modifier_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_id uuid NOT NULL,
  name varchar(120) NOT NULL,
  is_required boolean NOT NULL DEFAULT false,
  min_selections integer NOT NULL DEFAULT 0 CHECK (min_selections >= 0),
  max_selections integer NOT NULL DEFAULT 1 CHECK (max_selections >= 1),
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_product_modifier_groups_composite UNIQUE (tenant_id, id),
  CONSTRAINT fk_modifier_groups_product_cross_tenant_safe
    FOREIGN KEY (tenant_id, product_id)
    REFERENCES public.products(tenant_id, id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_modifier_groups_lookup
  ON public.product_modifier_groups(tenant_id, product_id, display_order);

-- 2. Opções de cada Grupo de Complemento
CREATE TABLE IF NOT EXISTS public.product_modifier_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  group_id uuid NOT NULL,
  name varchar(120) NOT NULL,
  price_in_cents integer NOT NULL DEFAULT 0 CHECK (price_in_cents >= 0),
  is_available boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_product_modifier_options_composite UNIQUE (tenant_id, id),
  CONSTRAINT fk_modifier_options_group_cross_tenant_safe
    FOREIGN KEY (tenant_id, group_id)
    REFERENCES public.product_modifier_groups(tenant_id, id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_modifier_options_lookup
  ON public.product_modifier_options(tenant_id, group_id, display_order);

-- 3. Sugestões de Produtos ("Combina com" / "Peça também")
CREATE TABLE IF NOT EXISTS public.product_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_id uuid NOT NULL,
  suggested_product_id uuid NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_product_suggestions_pair UNIQUE (tenant_id, product_id, suggested_product_id),
  CONSTRAINT chk_product_suggestions_not_self CHECK (product_id <> suggested_product_id),
  CONSTRAINT fk_suggestions_product_cross_tenant_safe
    FOREIGN KEY (tenant_id, product_id)
    REFERENCES public.products(tenant_id, id)
    ON DELETE CASCADE,
  CONSTRAINT fk_suggestions_target_cross_tenant_safe
    FOREIGN KEY (tenant_id, suggested_product_id)
    REFERENCES public.products(tenant_id, id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_product_suggestions_lookup
  ON public.product_suggestions(tenant_id, product_id, display_order);

-- 4. Snapshot de complementos selecionados em order_items
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS selected_modifiers jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 5. RLS
ALTER TABLE public.product_modifier_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_modifier_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read modifier groups" ON public.product_modifier_groups
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.products
      WHERE products.id = product_modifier_groups.product_id
        AND products.status = 'active'
    )
  );

CREATE POLICY "Admin manage modifier groups" ON public.product_modifier_groups
  FOR ALL TO authenticated
  USING (public.has_tenant_role(tenant_id, 'tenant_admin'));

CREATE POLICY "Public read modifier options" ON public.product_modifier_options
  FOR SELECT USING (
    is_available = true AND
    EXISTS (
      SELECT 1
      FROM public.product_modifier_groups g
      JOIN public.products p ON p.id = g.product_id
      WHERE g.id = product_modifier_options.group_id
        AND p.status = 'active'
    )
  );

CREATE POLICY "Admin manage modifier options" ON public.product_modifier_options
  FOR ALL TO authenticated
  USING (public.has_tenant_role(tenant_id, 'tenant_admin'));

CREATE POLICY "Public read product suggestions" ON public.product_suggestions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.products p1
      WHERE p1.id = product_suggestions.product_id AND p1.status = 'active'
    ) AND EXISTS (
      SELECT 1 FROM public.products p2
      WHERE p2.id = product_suggestions.suggested_product_id AND p2.status = 'active'
    )
  );

CREATE POLICY "Admin manage product suggestions" ON public.product_suggestions
  FOR ALL TO authenticated
  USING (public.has_tenant_role(tenant_id, 'tenant_admin'));

