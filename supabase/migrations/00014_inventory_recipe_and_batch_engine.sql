-- ==============================================================================
-- Migration 00014: Estoque de Congelados, Insumos, Ficha Técnica e Controle de Lotes
-- Sistema BENZA: Produção Artesanal, Rastreabilidade FEFO, Rendimento Real e CMV
-- ==============================================================================

-- 1. Insumos e Materiais de Embalagem (Raw Materials & Packaging)
CREATE TABLE IF NOT EXISTS public.inventory_raw_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name varchar(150) NOT NULL,
  sku varchar(60),
  category varchar(50) NOT NULL DEFAULT 'ingredient' CHECK (
    category IN ('ingredient', 'packaging', 'spice', 'dairy', 'meat', 'beverage', 'cleaning', 'other')
  ),
  unit_of_measure varchar(20) NOT NULL CHECK (
    unit_of_measure IN ('kg', 'g', 'l', 'ml', 'un', 'cx', 'pct')
  ),
  min_stock_level numeric(12,4) NOT NULL DEFAULT 0.0000 CHECK (min_stock_level >= 0),
  current_stock numeric(12,4) NOT NULL DEFAULT 0.0000 CHECK (current_stock >= 0),
  average_cost_cents integer NOT NULL DEFAULT 0 CHECK (average_cost_cents >= 0),
  last_purchase_cost_cents integer NOT NULL DEFAULT 0 CHECK (last_purchase_cost_cents >= 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_raw_materials_composite UNIQUE (tenant_id, id),
  CONSTRAINT uq_raw_materials_name UNIQUE (tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_raw_materials_tenant_category 
  ON public.inventory_raw_materials(tenant_id, category, is_active);

-- 2. Configurações de Controle de Estoque por Variante de Produto Acabado
CREATE TABLE IF NOT EXISTS public.product_variant_stock_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  variant_id uuid NOT NULL,
  track_inventory boolean NOT NULL DEFAULT true,
  min_stock_level integer NOT NULL DEFAULT 0 CHECK (min_stock_level >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_variant_stock_settings_composite UNIQUE (tenant_id, id),
  CONSTRAINT uq_variant_stock_settings_variant UNIQUE (tenant_id, variant_id),
  CONSTRAINT fk_variant_stock_settings_variant_cross_tenant_safe
    FOREIGN KEY (tenant_id, variant_id)
    REFERENCES public.product_variants(tenant_id, id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_variant_stock_settings_lookup 
  ON public.product_variant_stock_settings(tenant_id, variant_id);

-- 3. Lotes de Estoque (Insumos e Produtos Acabados Congelados)
CREATE TABLE IF NOT EXISTS public.inventory_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  batch_type varchar(30) NOT NULL CHECK (batch_type IN ('raw_material', 'finished_product')),
  raw_material_id uuid,
  variant_id uuid,
  batch_code varchar(60) NOT NULL,
  manufacture_date date NOT NULL DEFAULT CURRENT_DATE,
  expiration_date date NOT NULL,
  initial_quantity numeric(12,4) NOT NULL CHECK (initial_quantity > 0),
  current_quantity numeric(12,4) NOT NULL CHECK (current_quantity >= 0),
  reserved_quantity numeric(12,4) NOT NULL DEFAULT 0.0000 CHECK (
    reserved_quantity >= 0 AND reserved_quantity <= current_quantity
  ),
  unit_cost_cents integer NOT NULL DEFAULT 0 CHECK (unit_cost_cents >= 0),
  supplier_name varchar(150),
  invoice_number varchar(100),
  storage_location varchar(100) NOT NULL DEFAULT 'freezer_principal',
  status varchar(20) NOT NULL DEFAULT 'active' CHECK (
    status IN ('active', 'exhausted', 'quarantine', 'expired', 'discarded')
  ),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_inventory_batches_composite UNIQUE (tenant_id, id),
  CONSTRAINT uq_inventory_batches_code UNIQUE (tenant_id, batch_type, batch_code),
  CONSTRAINT chk_batch_item_reference CHECK (
    (batch_type = 'raw_material' AND raw_material_id IS NOT NULL AND variant_id IS NULL) OR
    (batch_type = 'finished_product' AND variant_id IS NOT NULL AND raw_material_id IS NULL)
  ),
  CONSTRAINT fk_batches_raw_material_cross_tenant_safe
    FOREIGN KEY (tenant_id, raw_material_id)
    REFERENCES public.inventory_raw_materials(tenant_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_batches_variant_cross_tenant_safe
    FOREIGN KEY (tenant_id, variant_id)
    REFERENCES public.product_variants(tenant_id, id)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_inventory_batches_lookup
  ON public.inventory_batches(tenant_id, batch_type, status, expiration_date);
CREATE INDEX IF NOT EXISTS idx_inventory_batches_variant_fefo
  ON public.inventory_batches(tenant_id, variant_id, status, expiration_date ASC)
  WHERE batch_type = 'finished_product' AND status = 'active';
CREATE INDEX IF NOT EXISTS idx_inventory_batches_raw_mat_fefo
  ON public.inventory_batches(tenant_id, raw_material_id, status, expiration_date ASC)
  WHERE batch_type = 'raw_material' AND status = 'active';

-- 4. Fichas Técnicas e Receitas Versionadas
CREATE TABLE IF NOT EXISTS public.recipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_id uuid NOT NULL,
  variant_id uuid,
  name varchar(150) NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  status varchar(20) NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'archived')),
  expected_yield_quantity numeric(12,4) NOT NULL CHECK (expected_yield_quantity > 0),
  yield_unit varchar(20) NOT NULL DEFAULT 'un' CHECK (
    yield_unit IN ('un', 'kg', 'g', 'l', 'portion')
  ),
  expected_loss_percentage numeric(5,2) NOT NULL DEFAULT 0.00 CHECK (
    expected_loss_percentage >= 0 AND expected_loss_percentage < 100
  ),
  shelf_life_days integer NOT NULL DEFAULT 90 CHECK (shelf_life_days > 0),
  preparation_instructions text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_recipes_composite UNIQUE (tenant_id, id),
  CONSTRAINT fk_recipes_product_cross_tenant_safe
    FOREIGN KEY (tenant_id, product_id)
    REFERENCES public.products(tenant_id, id)
    ON DELETE CASCADE,
  CONSTRAINT fk_recipes_variant_cross_tenant_safe
    FOREIGN KEY (tenant_id, variant_id)
    REFERENCES public.product_variants(tenant_id, id)
    ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_recipes_product ON public.recipes(tenant_id, product_id, status);

-- 5. Itens e Ingredientes da Ficha Técnica (BOM)
CREATE TABLE IF NOT EXISTS public.recipe_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  recipe_id uuid NOT NULL,
  raw_material_id uuid NOT NULL,
  gross_quantity numeric(12,4) NOT NULL CHECK (gross_quantity > 0),
  net_quantity numeric(12,4) NOT NULL CHECK (net_quantity > 0),
  unit_of_measure varchar(20) NOT NULL,
  notes varchar(150),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_recipe_items_composite UNIQUE (tenant_id, id),
  CONSTRAINT fk_recipe_items_recipe_cross_tenant_safe
    FOREIGN KEY (tenant_id, recipe_id)
    REFERENCES public.recipes(tenant_id, id)
    ON DELETE CASCADE,
  CONSTRAINT fk_recipe_items_raw_material_cross_tenant_safe
    FOREIGN KEY (tenant_id, raw_material_id)
    REFERENCES public.inventory_raw_materials(tenant_id, id)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_recipe_items_recipe ON public.recipe_items(tenant_id, recipe_id);

-- 6. Ordens de Produção / Bateladas e Apontamento de Rendimento Real
CREATE TABLE IF NOT EXISTS public.production_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  recipe_id uuid NOT NULL,
  order_code varchar(60) NOT NULL,
  status varchar(30) NOT NULL DEFAULT 'planned' CHECK (
    status IN ('planned', 'in_progress', 'completed', 'cancelled')
  ),
  planned_multiplier numeric(8,2) NOT NULL DEFAULT 1.00 CHECK (planned_multiplier > 0),
  expected_yield_quantity numeric(12,4) NOT NULL CHECK (expected_yield_quantity > 0),
  actual_yield_quantity numeric(12,4) CHECK (actual_yield_quantity IS NULL OR actual_yield_quantity >= 0),
  staff_consumption_quantity numeric(12,4) NOT NULL DEFAULT 0.0000 CHECK (staff_consumption_quantity >= 0),
  waste_spoilage_quantity numeric(12,4) NOT NULL DEFAULT 0.0000 CHECK (waste_spoilage_quantity >= 0),
  yield_deviation_percentage numeric(6,2),
  deviation_reason text,
  total_cost_cents integer NOT NULL DEFAULT 0 CHECK (total_cost_cents >= 0),
  unit_cost_cents integer NOT NULL DEFAULT 0 CHECK (unit_cost_cents >= 0),
  produced_variant_id uuid,
  generated_batch_id uuid,
  started_at timestamptz,
  completed_at timestamptz,
  created_by_user_id uuid,
  completed_by_user_id uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_production_orders_composite UNIQUE (tenant_id, id),
  CONSTRAINT uq_production_orders_code UNIQUE (tenant_id, order_code),
  CONSTRAINT fk_production_orders_recipe_cross_tenant_safe
    FOREIGN KEY (tenant_id, recipe_id)
    REFERENCES public.recipes(tenant_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_production_orders_variant_cross_tenant_safe
    FOREIGN KEY (tenant_id, produced_variant_id)
    REFERENCES public.product_variants(tenant_id, id)
    ON DELETE SET NULL,
  CONSTRAINT fk_production_orders_batch_cross_tenant_safe
    FOREIGN KEY (tenant_id, generated_batch_id)
    REFERENCES public.inventory_batches(tenant_id, id)
    ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_production_orders_tenant_status 
  ON public.production_orders(tenant_id, status, created_at DESC);

-- 7. Rastreabilidade de Insumos da Produção (Genealogia de Lotes)
CREATE TABLE IF NOT EXISTS public.production_batch_inputs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  production_order_id uuid NOT NULL,
  raw_material_id uuid NOT NULL,
  raw_material_batch_id uuid NOT NULL,
  quantity_consumed numeric(12,4) NOT NULL CHECK (quantity_consumed > 0),
  unit_cost_cents integer NOT NULL CHECK (unit_cost_cents >= 0),
  total_cost_cents integer NOT NULL CHECK (total_cost_cents >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_production_inputs_composite UNIQUE (tenant_id, id),
  CONSTRAINT fk_prod_inputs_order_cross_tenant_safe
    FOREIGN KEY (tenant_id, production_order_id)
    REFERENCES public.production_orders(tenant_id, id)
    ON DELETE CASCADE,
  CONSTRAINT fk_prod_inputs_raw_mat_cross_tenant_safe
    FOREIGN KEY (tenant_id, raw_material_id)
    REFERENCES public.inventory_raw_materials(tenant_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_prod_inputs_batch_cross_tenant_safe
    FOREIGN KEY (tenant_id, raw_material_batch_id)
    REFERENCES public.inventory_batches(tenant_id, id)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_production_batch_inputs_order 
  ON public.production_batch_inputs(tenant_id, production_order_id);
CREATE INDEX IF NOT EXISTS idx_production_batch_inputs_batch 
  ON public.production_batch_inputs(tenant_id, raw_material_batch_id);

-- 8. Reservas Atômicas de Estoque por Pedido
CREATE TABLE IF NOT EXISTS public.inventory_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  order_id uuid NOT NULL,
  order_item_id uuid NOT NULL,
  batch_id uuid NOT NULL,
  variant_id uuid NOT NULL,
  reserved_quantity integer NOT NULL CHECK (reserved_quantity > 0),
  status varchar(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'committed', 'released')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_inventory_reservations_composite UNIQUE (tenant_id, id),
  CONSTRAINT fk_reservations_order_cross_tenant_safe
    FOREIGN KEY (tenant_id, order_id)
    REFERENCES public.orders(tenant_id, id)
    ON DELETE CASCADE,
  CONSTRAINT fk_reservations_order_item_cross_tenant_safe
    FOREIGN KEY (tenant_id, order_item_id)
    REFERENCES public.order_items(tenant_id, id)
    ON DELETE CASCADE,
  CONSTRAINT fk_reservations_batch_cross_tenant_safe
    FOREIGN KEY (tenant_id, batch_id)
    REFERENCES public.inventory_batches(tenant_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_reservations_variant_cross_tenant_safe
    FOREIGN KEY (tenant_id, variant_id)
    REFERENCES public.product_variants(tenant_id, id)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_inventory_reservations_order 
  ON public.inventory_reservations(tenant_id, order_id, status);
CREATE INDEX IF NOT EXISTS idx_inventory_reservations_batch 
  ON public.inventory_reservations(tenant_id, batch_id, status);

-- 9. Trilha Imutável de Movimentações de Estoque (Append-Only)
CREATE TABLE IF NOT EXISTS public.inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  item_type varchar(30) NOT NULL CHECK (item_type IN ('raw_material', 'finished_product')),
  raw_material_id uuid,
  variant_id uuid,
  batch_id uuid,
  movement_type varchar(35) NOT NULL CHECK (
    movement_type IN (
      'purchase_in',
      'production_consumption',
      'production_yield_in',
      'staff_consumption',
      'sale_out',
      'spoilage_loss',
      'expired_loss',
      'manual_adjustment_in',
      'manual_adjustment_out',
      'order_cancelled_return'
    )
  ),
  quantity numeric(12,4) NOT NULL CHECK (quantity > 0),
  unit_cost_cents integer NOT NULL DEFAULT 0 CHECK (unit_cost_cents >= 0),
  total_cost_cents integer NOT NULL DEFAULT 0 CHECK (total_cost_cents >= 0),
  order_id uuid,
  production_order_id uuid,
  reservation_id uuid,
  reason text,
  performed_by_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_inventory_movements_composite UNIQUE (tenant_id, id),
  CONSTRAINT fk_movements_raw_mat_cross_tenant_safe
    FOREIGN KEY (tenant_id, raw_material_id)
    REFERENCES public.inventory_raw_materials(tenant_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_movements_variant_cross_tenant_safe
    FOREIGN KEY (tenant_id, variant_id)
    REFERENCES public.product_variants(tenant_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_movements_batch_cross_tenant_safe
    FOREIGN KEY (tenant_id, batch_id)
    REFERENCES public.inventory_batches(tenant_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_movements_order_cross_tenant_safe
    FOREIGN KEY (tenant_id, order_id)
    REFERENCES public.orders(tenant_id, id)
    ON DELETE SET NULL,
  CONSTRAINT fk_movements_prod_order_cross_tenant_safe
    FOREIGN KEY (tenant_id, production_order_id)
    REFERENCES public.production_orders(tenant_id, id)
    ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_inventory_movements_tenant 
  ON public.inventory_movements(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_batch 
  ON public.inventory_movements(tenant_id, batch_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_order 
  ON public.inventory_movements(tenant_id, order_id);

-- Trigger de Imutabilidade Estrita em inventory_movements (Anti-Tampering)
CREATE OR REPLACE FUNCTION public.trg_prevent_inventory_movements_tampering()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'A tabela inventory_movements é estritamente imutável para fins fiscais e de auditoria. Alterações ou exclusões são proibidas.';
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_inventory_movements_tampering_trg ON public.inventory_movements;
CREATE TRIGGER trg_prevent_inventory_movements_tampering_trg
  BEFORE UPDATE OR DELETE ON public.inventory_movements
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_prevent_inventory_movements_tampering();

-- ==============================================================================
-- POLÍTICAS RLS (Row Level Security) - Estoque, Ficha Técnica e Produção
-- ==============================================================================

ALTER TABLE public.inventory_raw_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variant_stock_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_batch_inputs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;

-- 1. inventory_raw_materials
DROP POLICY IF EXISTS "Members view raw materials" ON public.inventory_raw_materials;
CREATE POLICY "Members view raw materials" ON public.inventory_raw_materials
  FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id));

DROP POLICY IF EXISTS "Managers manage raw materials" ON public.inventory_raw_materials;
CREATE POLICY "Managers manage raw materials" ON public.inventory_raw_materials
  FOR ALL TO authenticated
  USING (
    public.has_tenant_role(tenant_id, 'tenant_manager') OR
    public.has_tenant_role(tenant_id, 'tenant_admin')
  );

-- 2. product_variant_stock_settings
DROP POLICY IF EXISTS "Members view variant stock settings" ON public.product_variant_stock_settings;
CREATE POLICY "Members view variant stock settings" ON public.product_variant_stock_settings
  FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id));

DROP POLICY IF EXISTS "Managers manage variant stock settings" ON public.product_variant_stock_settings;
CREATE POLICY "Managers manage variant stock settings" ON public.product_variant_stock_settings
  FOR ALL TO authenticated
  USING (
    public.has_tenant_role(tenant_id, 'tenant_manager') OR
    public.has_tenant_role(tenant_id, 'tenant_admin')
  );

-- 3. inventory_batches
DROP POLICY IF EXISTS "Members view inventory batches" ON public.inventory_batches;
CREATE POLICY "Members view inventory batches" ON public.inventory_batches
  FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id));

DROP POLICY IF EXISTS "Managers manage inventory batches" ON public.inventory_batches;
CREATE POLICY "Managers manage inventory batches" ON public.inventory_batches
  FOR ALL TO authenticated
  USING (
    public.has_tenant_role(tenant_id, 'tenant_manager') OR
    public.has_tenant_role(tenant_id, 'tenant_admin')
  );

-- 4. recipes & recipe_items
DROP POLICY IF EXISTS "Members view recipes" ON public.recipes;
CREATE POLICY "Members view recipes" ON public.recipes
  FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id));

DROP POLICY IF EXISTS "Managers manage recipes" ON public.recipes;
CREATE POLICY "Managers manage recipes" ON public.recipes
  FOR ALL TO authenticated
  USING (
    public.has_tenant_role(tenant_id, 'tenant_manager') OR
    public.has_tenant_role(tenant_id, 'tenant_admin')
  );

DROP POLICY IF EXISTS "Members view recipe items" ON public.recipe_items;
CREATE POLICY "Members view recipe items" ON public.recipe_items
  FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id));

DROP POLICY IF EXISTS "Managers manage recipe items" ON public.recipe_items;
CREATE POLICY "Managers manage recipe items" ON public.recipe_items
  FOR ALL TO authenticated
  USING (
    public.has_tenant_role(tenant_id, 'tenant_manager') OR
    public.has_tenant_role(tenant_id, 'tenant_admin')
  );

-- 5. production_orders & production_batch_inputs
DROP POLICY IF EXISTS "Members view production orders" ON public.production_orders;
CREATE POLICY "Members view production orders" ON public.production_orders
  FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id));

DROP POLICY IF EXISTS "Managers manage production orders" ON public.production_orders;
CREATE POLICY "Managers manage production orders" ON public.production_orders
  FOR ALL TO authenticated
  USING (
    public.has_tenant_role(tenant_id, 'tenant_manager') OR
    public.has_tenant_role(tenant_id, 'tenant_admin')
  );

DROP POLICY IF EXISTS "Members view production batch inputs" ON public.production_batch_inputs;
CREATE POLICY "Members view production batch inputs" ON public.production_batch_inputs
  FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id));

DROP POLICY IF EXISTS "Managers manage production batch inputs" ON public.production_batch_inputs;
CREATE POLICY "Managers manage production batch inputs" ON public.production_batch_inputs
  FOR ALL TO authenticated
  USING (
    public.has_tenant_role(tenant_id, 'tenant_manager') OR
    public.has_tenant_role(tenant_id, 'tenant_admin')
  );

-- 6. inventory_reservations & inventory_movements
DROP POLICY IF EXISTS "Members view inventory reservations" ON public.inventory_reservations;
CREATE POLICY "Members view inventory reservations" ON public.inventory_reservations
  FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id));

DROP POLICY IF EXISTS "Managers manage inventory reservations" ON public.inventory_reservations;
CREATE POLICY "Managers manage inventory reservations" ON public.inventory_reservations
  FOR ALL TO authenticated
  USING (
    public.has_tenant_role(tenant_id, 'tenant_manager') OR
    public.has_tenant_role(tenant_id, 'tenant_admin')
  );

DROP POLICY IF EXISTS "Members view inventory movements" ON public.inventory_movements;
CREATE POLICY "Members view inventory movements" ON public.inventory_movements
  FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id));

DROP POLICY IF EXISTS "Managers insert inventory movements" ON public.inventory_movements;
CREATE POLICY "Managers insert inventory movements" ON public.inventory_movements
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_tenant_role(tenant_id, 'tenant_manager') OR
    public.has_tenant_role(tenant_id, 'tenant_admin')
  );

-- ==============================================================================
-- RPCs ATÔMICAS - GESTÃO DE ESTOQUE, LOTES, PRODUÇÃO E CMV
-- ==============================================================================

-- 1. Entrada de Insumo por Compra (record_raw_material_receipt_atomic)
CREATE OR REPLACE FUNCTION public.record_raw_material_receipt_atomic(
  p_tenant_id uuid,
  p_raw_material_id uuid,
  p_batch_code varchar(60),
  p_manufacture_date date,
  p_expiration_date date,
  p_quantity numeric(12,4),
  p_unit_cost_cents integer,
  p_supplier_name varchar(150) DEFAULT null,
  p_invoice_number varchar(100) DEFAULT null,
  p_storage_location varchar(100) DEFAULT 'camara_fria',
  p_actor_user_id uuid DEFAULT null,
  p_notes text DEFAULT null
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_raw_mat record;
  v_batch_id uuid := gen_random_uuid();
  v_new_stock numeric(12,4);
  v_total_cost_cents integer;
  v_new_average_cost_cents integer;
BEGIN
  IF p_quantity <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'A quantidade recebida deve ser maior que zero.');
  END IF;

  IF p_expiration_date <= p_manufacture_date THEN
    RETURN jsonb_build_object('success', false, 'error', 'A data de validade deve ser posterior à data de fabricação.');
  END IF;

  SELECT * INTO v_raw_mat
  FROM public.inventory_raw_materials
  WHERE tenant_id = p_tenant_id AND id = p_raw_material_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insumo não encontrado para este tenant.');
  END IF;

  v_total_cost_cents := ROUND(p_quantity * p_unit_cost_cents);
  v_new_stock := v_raw_mat.current_stock + p_quantity;

  -- Cálculo do custo médio ponderado
  IF v_new_stock > 0 THEN
    v_new_average_cost_cents := ROUND(
      ((v_raw_mat.current_stock * v_raw_mat.average_cost_cents) + (p_quantity * p_unit_cost_cents)) / v_new_stock
    );
  ELSE
    v_new_average_cost_cents := p_unit_cost_cents;
  END IF;

  -- 1. Cria o lote de insumo
  INSERT INTO public.inventory_batches (
    id, tenant_id, batch_type, raw_material_id, variant_id,
    batch_code, manufacture_date, expiration_date,
    initial_quantity, current_quantity, reserved_quantity,
    unit_cost_cents, supplier_name, invoice_number, storage_location,
    status, notes
  ) VALUES (
    v_batch_id, p_tenant_id, 'raw_material', p_raw_material_id, null,
    p_batch_code, p_manufacture_date, p_expiration_date,
    p_quantity, p_quantity, 0,
    p_unit_cost_cents, p_supplier_name, p_invoice_number, p_storage_location,
    'active', p_notes
  );

  -- 2. Atualiza o saldo e custos do insumo
  UPDATE public.inventory_raw_materials
  SET current_stock = v_new_stock,
      average_cost_cents = v_new_average_cost_cents,
      last_purchase_cost_cents = p_unit_cost_cents,
      updated_at = now()
  WHERE tenant_id = p_tenant_id AND id = p_raw_material_id;

  -- 3. Registra movimentação imutável
  INSERT INTO public.inventory_movements (
    tenant_id, item_type, raw_material_id, batch_id,
    movement_type, quantity, unit_cost_cents, total_cost_cents,
    performed_by_user_id, reason
  ) VALUES (
    p_tenant_id, 'raw_material', p_raw_material_id, v_batch_id,
    'purchase_in', p_quantity, p_unit_cost_cents, v_total_cost_cents,
    p_actor_user_id, format('Entrada de insumo via lote %s (NF %s)', p_batch_code, COALESCE(p_invoice_number, 'S/N'))
  );

  RETURN jsonb_build_object(
    'success', true,
    'batch_id', v_batch_id,
    'raw_material_id', p_raw_material_id,
    'batch_code', p_batch_code,
    'new_stock', v_new_stock,
    'average_cost_cents', v_new_average_cost_cents,
    'total_cost_cents', v_total_cost_cents
  );
END;
$$;

-- 2. Entrada Direta de Produto Acabado Comercializável (record_finished_product_receipt_atomic)
-- Permite controle de estoque para restaurantes sem produção própria ou compras externas
CREATE OR REPLACE FUNCTION public.record_finished_product_receipt_atomic(
  p_tenant_id uuid,
  p_variant_id uuid,
  p_batch_code varchar(60),
  p_manufacture_date date,
  p_expiration_date date,
  p_quantity integer,
  p_unit_cost_cents integer,
  p_supplier_name varchar(150) DEFAULT null,
  p_storage_location varchar(100) DEFAULT 'freezer_principal',
  p_actor_user_id uuid DEFAULT null,
  p_notes text DEFAULT null
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_variant record;
  v_batch_id uuid := gen_random_uuid();
  v_total_cost_cents integer;
BEGIN
  IF p_quantity <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'A quantidade de embalagens deve ser maior que zero.');
  END IF;

  SELECT * INTO v_variant
  FROM public.product_variants
  WHERE tenant_id = p_tenant_id AND id = p_variant_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Variante do produto não encontrada para este tenant.');
  END IF;

  v_total_cost_cents := p_quantity * p_unit_cost_cents;

  -- 1. Garante que track_inventory esteja ativo nas configurações
  INSERT INTO public.product_variant_stock_settings (
    tenant_id, variant_id, track_inventory, min_stock_level
  ) VALUES (
    p_tenant_id, p_variant_id, true, 5
  ) ON CONFLICT (tenant_id, variant_id) DO UPDATE
    SET track_inventory = true, updated_at = now();

  -- 2. Cria o lote de produto acabado
  INSERT INTO public.inventory_batches (
    id, tenant_id, batch_type, raw_material_id, variant_id,
    batch_code, manufacture_date, expiration_date,
    initial_quantity, current_quantity, reserved_quantity,
    unit_cost_cents, supplier_name, storage_location,
    status, notes
  ) VALUES (
    v_batch_id, p_tenant_id, 'finished_product', null, p_variant_id,
    p_batch_code, p_manufacture_date, p_expiration_date,
    p_quantity, p_quantity, 0,
    p_unit_cost_cents, p_supplier_name, p_storage_location,
    'active', p_notes
  );

  -- 3. Registra movimentação imutável
  INSERT INTO public.inventory_movements (
    tenant_id, item_type, variant_id, batch_id,
    movement_type, quantity, unit_cost_cents, total_cost_cents,
    performed_by_user_id, reason
  ) VALUES (
    p_tenant_id, 'finished_product', p_variant_id, v_batch_id,
    'purchase_in', p_quantity, p_unit_cost_cents, v_total_cost_cents,
    p_actor_user_id, format('Entrada de produto acabado (Lote %s)', p_batch_code)
  );

  RETURN jsonb_build_object(
    'success', true,
    'batch_id', v_batch_id,
    'variant_id', p_variant_id,
    'batch_code', p_batch_code,
    'quantity', p_quantity,
    'unit_cost_cents', p_unit_cost_cents,
    'total_cost_cents', v_total_cost_cents
  );
END;
$$;

-- 3. Abertura de Ordem de Produção (create_production_order_atomic)
CREATE OR REPLACE FUNCTION public.create_production_order_atomic(
  p_tenant_id uuid,
  p_recipe_id uuid,
  p_order_code varchar(60),
  p_planned_multiplier numeric(8,2) DEFAULT 1.00,
  p_actor_user_id uuid DEFAULT null,
  p_notes text DEFAULT null
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_recipe record;
  v_prod_order_id uuid := gen_random_uuid();
  v_expected_yield numeric(12,4);
  v_existing_code integer;
BEGIN
  SELECT count(*) INTO v_existing_code
  FROM public.production_orders
  WHERE tenant_id = p_tenant_id AND order_code = p_order_code;

  IF v_existing_code > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Já existe uma ordem de produção com este código.');
  END IF;

  SELECT * INTO v_recipe
  FROM public.recipes
  WHERE tenant_id = p_tenant_id AND id = p_recipe_id AND status = 'active';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ficha técnica não encontrada ou inativa.');
  END IF;

  v_expected_yield := v_recipe.expected_yield_quantity * p_planned_multiplier;

  INSERT INTO public.production_orders (
    id, tenant_id, recipe_id, order_code, status,
    planned_multiplier, expected_yield_quantity,
    produced_variant_id, created_by_user_id, notes,
    started_at
  ) VALUES (
    v_prod_order_id, p_tenant_id, p_recipe_id, p_order_code, 'in_progress',
    p_planned_multiplier, v_expected_yield,
    v_recipe.variant_id, p_actor_user_id, p_notes,
    now()
  );

  RETURN jsonb_build_object(
    'success', true,
    'production_order_id', v_prod_order_id,
    'order_code', p_order_code,
    'status', 'in_progress',
    'expected_yield', v_expected_yield
  );
END;
$$;

-- 4. Conclusão de Ordem de Produção com Rendimento Real e Rastreabilidade
-- (complete_production_order_atomic)
CREATE OR REPLACE FUNCTION public.complete_production_order_atomic(
  p_tenant_id uuid,
  p_production_order_id uuid,
  p_actual_yield_quantity numeric(12,4),
  p_batch_code varchar(60),
  p_staff_consumption_quantity numeric(12,4) DEFAULT 0.0000,
  p_waste_spoilage_quantity numeric(12,4) DEFAULT 0.0000,
  p_deviation_reason text DEFAULT null,
  p_storage_location varchar(100) DEFAULT 'freezer_principal',
  p_actor_user_id uuid DEFAULT null
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_prod_order record;
  v_recipe record;
  v_item record;
  v_batch record;
  v_qty_needed numeric(12,4);
  v_qty_from_batch numeric(12,4);
  v_total_batch_cost_cents integer := 0;
  v_unit_cost_cents integer := 0;
  v_generated_batch_id uuid := gen_random_uuid();
  v_expiration_date date;
  v_deviation_pct numeric(6,2);
  v_variant_id uuid;
BEGIN
  SELECT * INTO v_prod_order
  FROM public.production_orders
  WHERE tenant_id = p_tenant_id AND id = p_production_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ordem de produção não encontrada.');
  END IF;

  IF v_prod_order.status = 'completed' THEN
    RETURN jsonb_build_object('success', true, 'idempotent', true, 'message', 'Ordem já concluída.');
  END IF;

  IF v_prod_order.status != 'in_progress' THEN
    RETURN jsonb_build_object('success', false, 'error', format('Status inválido para conclusão: %s', v_prod_order.status));
  END IF;

  IF p_actual_yield_quantity <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'O rendimento real deve ser maior que zero.');
  END IF;

  SELECT * INTO v_recipe
  FROM public.recipes
  WHERE tenant_id = p_tenant_id AND id = v_prod_order.recipe_id;

  v_variant_id := COALESCE(v_prod_order.produced_variant_id, v_recipe.variant_id);
  IF v_variant_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'A receita deve estar vinculada a uma variante comercializável para envasamento.');
  END IF;

  -- Validade configurada na ficha técnica (ex: 90 dias a -18°C)
  v_expiration_date := CURRENT_DATE + (v_recipe.shelf_life_days || ' days')::interval;

  -- 1. Consome os insumos da receita aplicando FEFO estrito entre lotes ativos de insumos
  FOR v_item IN
    SELECT * FROM public.recipe_items
    WHERE tenant_id = p_tenant_id AND recipe_id = v_recipe.id
  LOOP
    v_qty_needed := v_item.gross_quantity * v_prod_order.planned_multiplier;

    FOR v_batch IN
      SELECT * FROM public.inventory_batches
      WHERE tenant_id = p_tenant_id
        AND batch_type = 'raw_material'
        AND raw_material_id = v_item.raw_material_id
        AND status = 'active'
        AND current_quantity > 0
        AND expiration_date >= CURRENT_DATE
      ORDER BY expiration_date ASC, created_at ASC
      FOR UPDATE
    LOOP
      EXIT WHEN v_qty_needed <= 0;

      IF v_batch.current_quantity >= v_qty_needed THEN
        v_qty_from_batch := v_qty_needed;
      ELSE
        v_qty_from_batch := v_batch.current_quantity;
      END IF;

      -- Decrementa o lote do insumo
      UPDATE public.inventory_batches
      SET current_quantity = current_quantity - v_qty_from_batch,
          status = CASE WHEN current_quantity - v_qty_from_batch = 0 THEN 'exhausted' ELSE 'active' END,
          updated_at = now()
      WHERE id = v_batch.id;

      -- Decrementa saldo global do insumo
      UPDATE public.inventory_raw_materials
      SET current_stock = GREATEST(0, current_stock - v_qty_from_batch),
          updated_at = now()
      WHERE id = v_item.raw_material_id;

      -- Registra insumo consumido e vincula genealogia de rastreabilidade
      INSERT INTO public.production_batch_inputs (
        tenant_id, production_order_id, raw_material_id, raw_material_batch_id,
        quantity_consumed, unit_cost_cents, total_cost_cents
      ) VALUES (
        p_tenant_id, p_production_order_id, v_item.raw_material_id, v_batch.id,
        v_qty_from_batch, v_batch.unit_cost_cents, ROUND(v_qty_from_batch * v_batch.unit_cost_cents)
      );

      -- Registra movimentação imutável de consumo
      INSERT INTO public.inventory_movements (
        tenant_id, item_type, raw_material_id, batch_id,
        movement_type, quantity, unit_cost_cents, total_cost_cents,
        production_order_id, performed_by_user_id, reason
      ) VALUES (
        p_tenant_id, 'raw_material', v_item.raw_material_id, v_batch.id,
        'production_consumption', v_qty_from_batch, v_batch.unit_cost_cents,
        ROUND(v_qty_from_batch * v_batch.unit_cost_cents),
        p_production_order_id, p_actor_user_id,
        format('Consumo em produção OP %s (Receita: %s)', v_prod_order.order_code, v_recipe.name)
      );

      v_total_batch_cost_cents := v_total_batch_cost_cents + ROUND(v_qty_from_batch * v_batch.unit_cost_cents);
      v_qty_needed := v_qty_needed - v_qty_from_batch;
    END LOOP;

    -- Se não havia insumo suficiente em lotes ativos, alerta ou prossegue com custo médio registrado
    IF v_qty_needed > 0 THEN
      -- Consumo contábil pelo custo médio do insumo restante
      SELECT * INTO v_item FROM public.inventory_raw_materials WHERE id = v_item.raw_material_id;
      v_total_batch_cost_cents := v_total_batch_cost_cents + ROUND(v_qty_needed * v_item.average_cost_cents);
    END IF;
  END LOOP;

  -- 2. Calcula custo unitário por embalagem envasada
  IF p_actual_yield_quantity > 0 THEN
    v_unit_cost_cents := ROUND(v_total_batch_cost_cents / p_actual_yield_quantity);
  ELSE
    v_unit_cost_cents := 0;
  END IF;

  -- 3. Calcula desvio entre rendimento planejado e total real (envasado + consumo equipe + desperdício)
  v_deviation_pct := ROUND(
    (((p_actual_yield_quantity + p_staff_consumption_quantity + p_waste_spoilage_quantity) - v_prod_order.expected_yield_quantity) / v_prod_order.expected_yield_quantity) * 100,
    2
  );

  -- 4. Gera o lote de produtos acabados congelados prontos para venda no freezer
  INSERT INTO public.inventory_batches (
    id, tenant_id, batch_type, raw_material_id, variant_id,
    batch_code, manufacture_date, expiration_date,
    initial_quantity, current_quantity, reserved_quantity,
    unit_cost_cents, storage_location, status,
    notes
  ) VALUES (
    v_generated_batch_id, p_tenant_id, 'finished_product', null, v_variant_id,
    p_batch_code, CURRENT_DATE, v_expiration_date,
    p_actual_yield_quantity, p_actual_yield_quantity, 0,
    v_unit_cost_cents, p_storage_location, 'active',
    format('Produzido via OP %s (Receita: %s)', v_prod_order.order_code, v_recipe.name)
  );

  -- 5. Registra movimentações imutáveis de entrada de produto acabado
  INSERT INTO public.inventory_movements (
    tenant_id, item_type, variant_id, batch_id,
    movement_type, quantity, unit_cost_cents, total_cost_cents,
    production_order_id, performed_by_user_id, reason
  ) VALUES (
    p_tenant_id, 'finished_product', v_variant_id, v_generated_batch_id,
    'production_yield_in', p_actual_yield_quantity, v_unit_cost_cents, v_total_batch_cost_cents,
    p_production_order_id, p_actor_user_id,
    format('Envasamento e congelamento de %s unidades via OP %s', p_actual_yield_quantity, v_prod_order.order_code)
  );

  -- Se houve consumo de equipe registrado separadamente
  IF p_staff_consumption_quantity > 0 THEN
    INSERT INTO public.inventory_movements (
      tenant_id, item_type, variant_id, batch_id,
      movement_type, quantity, unit_cost_cents, total_cost_cents,
      production_order_id, performed_by_user_id, reason
    ) VALUES (
      p_tenant_id, 'finished_product', v_variant_id, v_generated_batch_id,
      'staff_consumption', p_staff_consumption_quantity, v_unit_cost_cents,
      ROUND(p_staff_consumption_quantity * v_unit_cost_cents),
      p_production_order_id, p_actor_user_id, 'Consumo da equipe durante/pós-produção'
    );
  END IF;

  -- Se houve perda/desperdício apontado
  IF p_waste_spoilage_quantity > 0 THEN
    INSERT INTO public.inventory_movements (
      tenant_id, item_type, variant_id, batch_id,
      movement_type, quantity, unit_cost_cents, total_cost_cents,
      production_order_id, performed_by_user_id, reason
    ) VALUES (
      p_tenant_id, 'finished_product', v_variant_id, v_generated_batch_id,
      'spoilage_loss', p_waste_spoilage_quantity, v_unit_cost_cents,
      ROUND(p_waste_spoilage_quantity * v_unit_cost_cents),
      p_production_order_id, p_actor_user_id,
      COALESCE(p_deviation_reason, 'Perda de raspagem ou descarte na produção')
    );
  END IF;

  -- 6. Conclui a ordem de produção
  UPDATE public.production_orders
  SET status = 'completed',
      actual_yield_quantity = p_actual_yield_quantity,
      staff_consumption_quantity = p_staff_consumption_quantity,
      waste_spoilage_quantity = p_waste_spoilage_quantity,
      yield_deviation_percentage = v_deviation_pct,
      deviation_reason = p_deviation_reason,
      total_cost_cents = v_total_batch_cost_cents,
      unit_cost_cents = v_unit_cost_cents,
      generated_batch_id = v_generated_batch_id,
      completed_by_user_id = p_actor_user_id,
      completed_at = now(),
      updated_at = now()
  WHERE tenant_id = p_tenant_id AND id = p_production_order_id;

  RETURN jsonb_build_object(
    'success', true,
    'production_order_id', p_production_order_id,
    'generated_batch_id', v_generated_batch_id,
    'batch_code', p_batch_code,
    'actual_yield_quantity', p_actual_yield_quantity,
    'unit_cost_cents', v_unit_cost_cents,
    'total_cost_cents', v_total_batch_cost_cents,
    'expiration_date', v_expiration_date,
    'deviation_percentage', v_deviation_pct
  );
END;
$$;

-- 5. Reserva Atômica de Estoque por Pedido (reserve_order_inventory_atomic)
-- Executado quando o pedido é confirmado: aplica FEFO e reserva produtos acabados
CREATE OR REPLACE FUNCTION public.reserve_order_inventory_atomic(
  p_tenant_id uuid,
  p_order_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_item record;
  v_batch record;
  v_setting record;
  v_qty_needed integer;
  v_qty_reserve integer;
  v_reservations_created integer := 0;
  v_already_reserved integer;
BEGIN
  -- Idempotência: verifica se o pedido já tem reservas ativas
  SELECT count(*) INTO v_already_reserved
  FROM public.inventory_reservations
  WHERE tenant_id = p_tenant_id AND order_id = p_order_id AND status = 'active';

  IF v_already_reserved > 0 THEN
    RETURN jsonb_build_object('success', true, 'idempotent', true, 'reservations_count', v_already_reserved);
  END IF;

  -- Itera sobre os itens do pedido
  FOR v_item IN
    SELECT id, variant_id, quantity, snapshot_product_name
    FROM public.order_items
    WHERE tenant_id = p_tenant_id AND order_id = p_order_id
  LOOP
    -- Verifica se a variante possui controle de estoque ativo
    SELECT * INTO v_setting
    FROM public.product_variant_stock_settings
    WHERE tenant_id = p_tenant_id AND variant_id = v_item.variant_id;

    -- Se não estiver configurado para controle de estoque, pula
    IF FOUND AND v_setting.track_inventory = false THEN
      CONTINUE;
    END IF;

    v_qty_needed := v_item.quantity;

    -- Busca lotes ativos de produto acabado via FEFO (mais próximo do vencimento primeiro)
    FOR v_batch IN
      SELECT * FROM public.inventory_batches
      WHERE tenant_id = p_tenant_id
        AND batch_type = 'finished_product'
        AND variant_id = v_item.variant_id
        AND status = 'active'
        AND (current_quantity - reserved_quantity) > 0
        AND expiration_date >= CURRENT_DATE
      ORDER BY expiration_date ASC, created_at ASC
      FOR UPDATE
    LOOP
      EXIT WHEN v_qty_needed <= 0;

      v_qty_reserve := LEAST(v_qty_needed, (v_batch.current_quantity - v_batch.reserved_quantity)::integer);

      -- Atualiza a quantidade reservada no lote
      UPDATE public.inventory_batches
      SET reserved_quantity = reserved_quantity + v_qty_reserve,
          updated_at = now()
      WHERE id = v_batch.id;

      -- Cria a reserva atômica
      INSERT INTO public.inventory_reservations (
        tenant_id, order_id, order_item_id, batch_id, variant_id,
        reserved_quantity, status
      ) VALUES (
        p_tenant_id, p_order_id, v_item.id, v_batch.id, v_item.variant_id,
        v_qty_reserve, 'active'
      );

      v_reservations_created := v_reservations_created + 1;
      v_qty_needed := v_qty_needed - v_qty_reserve;
    END LOOP;

    -- Se não houver saldo suficiente em lotes ativos e o controle for estrito
    IF v_qty_needed > 0 AND FOUND AND v_setting.track_inventory = true THEN
      -- Libera as reservas já criadas para manter atomicidade
      PERFORM public.release_order_inventory_reservation_atomic(p_tenant_id, p_order_id, 'Estoque insuficiente no momento da confirmação');
      RETURN jsonb_build_object(
        'success', false,
        'error', format('Estoque insuficiente para o produto "%s". Faltam %s unidades.', v_item.snapshot_product_name, v_qty_needed),
        'product_name', v_item.snapshot_product_name,
        'missing_quantity', v_qty_needed
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'reservations_count', v_reservations_created
  );
END;
$$;

-- 6. Liberação de Reservas de Estoque por Cancelamento (release_order_inventory_reservation_atomic)
-- REGRA SANITÁRIA ANVISA: Alimentos congelados expedidos NUNCA são reintegrados automaticamente ao freezer ativo.
-- Se o pedido ainda estava em preparo (status = 'active'): desfaz a reserva sem movimentação física indevida.
-- Se o pedido já havia sido expedido (status = 'committed'): não altera o estoque disponível e orienta o fluxo de quarentena.
DROP FUNCTION IF EXISTS public.release_order_inventory_reservation_atomic(uuid, uuid, text);
CREATE OR REPLACE FUNCTION public.release_order_inventory_reservation_atomic(
  p_tenant_id uuid,
  p_order_id uuid,
  p_reason text DEFAULT 'Pedido cancelado',
  p_actor_user_id uuid DEFAULT null
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_res record;
  v_released_active integer := 0;
  v_committed_count integer := 0;
BEGIN
  -- 1. Reservas ativas (pedido cancelado ANTES da expedição): desfaz a reserva normalmente
  FOR v_res IN
    SELECT * FROM public.inventory_reservations
    WHERE tenant_id = p_tenant_id AND order_id = p_order_id AND status = 'active'
    FOR UPDATE
  LOOP
    UPDATE public.inventory_batches
    SET reserved_quantity = GREATEST(0, reserved_quantity - v_res.reserved_quantity),
        updated_at = now()
    WHERE id = v_res.batch_id;

    UPDATE public.inventory_reservations
    SET status = 'released',
        updated_at = now()
    WHERE id = v_res.id;

    v_released_active := v_released_active + 1;
  END LOOP;

  -- 2. Verifica se existiam reservas já baixadas (pedido cancelado APÓS a expedição)
  SELECT count(*) INTO v_committed_count
  FROM public.inventory_reservations
  WHERE tenant_id = p_tenant_id AND order_id = p_order_id AND status = 'committed';

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'released_active_count', v_released_active,
    'committed_dispatched_count', v_committed_count,
    'requires_sanitary_quarantine', (v_committed_count > 0),
    'notice', CASE
      WHEN v_committed_count > 0 THEN 'Pedido possuía produtos já expedidos. Por segurança alimentar, os itens NÃO foram reintegrados automaticamente ao freezer ativo. Utilize process_order_return_quarantine_atomic caso haja devolução física.'
      ELSE 'Reservas ativas liberadas com sucesso.'
    END,
    'reason', p_reason
  );
END;
$$;

-- 7. Baixa Física Definitiva de Estoque e Apuração do CMV (commit_order_inventory_deduction_atomic)
-- Executado no evento operacional de expedição / entrega do pedido com granularidade por reserva
CREATE OR REPLACE FUNCTION public.commit_order_inventory_deduction_atomic(
  p_tenant_id uuid,
  p_order_id uuid,
  p_actor_user_id uuid DEFAULT null
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_res record;
  v_batch record;
  v_order record;
  v_total_cmv_cents integer := 0;
  v_committed_count integer := 0;
  v_active_reservations_count integer;
  v_already_committed_count integer;
BEGIN
  SELECT * INTO v_order
  FROM public.orders
  WHERE tenant_id = p_tenant_id AND id = p_order_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Pedido não encontrado.');
  END IF;

  -- Conta reservas ativas pendentes de baixa
  SELECT count(*) INTO v_active_reservations_count
  FROM public.inventory_reservations
  WHERE tenant_id = p_tenant_id AND order_id = p_order_id AND status = 'active';

  -- Se não há reservas ativas, verifica se já foram todas baixadas (Idempotência Granular)
  IF v_active_reservations_count = 0 THEN
    SELECT count(*) INTO v_already_committed_count
    FROM public.inventory_reservations
    WHERE tenant_id = p_tenant_id AND order_id = p_order_id AND status = 'committed';

    IF v_already_committed_count > 0 THEN
      RETURN jsonb_build_object(
        'success', true,
        'idempotent', true,
        'order_id', p_order_id,
        'message', 'Todas as reservas deste pedido já foram baixadas anteriormente.'
      );
    ELSE
      RETURN jsonb_build_object(
        'success', true,
        'idempotent', true,
        'order_id', p_order_id,
        'message', 'Nenhuma reserva de estoque encontrada para este pedido.'
      );
    END IF;
  END IF;

  -- Processa cada reserva ativa individualmente
  FOR v_res IN
    SELECT * FROM public.inventory_reservations
    WHERE tenant_id = p_tenant_id AND order_id = p_order_id AND status = 'active'
    FOR UPDATE
  LOOP
    SELECT * INTO v_batch
    FROM public.inventory_batches
    WHERE id = v_res.batch_id
    FOR UPDATE;

    IF FOUND THEN
      -- Baixa física no lote: consome current_quantity e desfaz a reserva correspondente
      UPDATE public.inventory_batches
      SET current_quantity = GREATEST(0, current_quantity - v_res.reserved_quantity),
          reserved_quantity = GREATEST(0, reserved_quantity - v_res.reserved_quantity),
          status = CASE WHEN (current_quantity - v_res.reserved_quantity) <= 0 THEN 'exhausted' ELSE 'active' END,
          updated_at = now()
      WHERE id = v_batch.id;

      -- Registra movimentação imutável de saída de venda (sale_out)
      INSERT INTO public.inventory_movements (
        tenant_id, item_type, variant_id, batch_id,
        movement_type, quantity, unit_cost_cents, total_cost_cents,
        order_id, reservation_id, performed_by_user_id, reason
      ) VALUES (
        p_tenant_id, 'finished_product', v_res.variant_id, v_res.batch_id,
        'sale_out', v_res.reserved_quantity, v_batch.unit_cost_cents,
        v_res.reserved_quantity * v_batch.unit_cost_cents,
        p_order_id, v_res.id, p_actor_user_id,
        format('Venda expedida no Pedido %s (Lote %s)', v_order.order_number, v_batch.batch_code)
      );

      v_total_cmv_cents := v_total_cmv_cents + (v_res.reserved_quantity * v_batch.unit_cost_cents);
    END IF;

    -- Atualiza status da reserva para 'committed'
    UPDATE public.inventory_reservations
    SET status = 'committed',
        updated_at = now()
    WHERE id = v_res.id;

    v_committed_count := v_committed_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'idempotent', false,
    'order_id', p_order_id,
    'committed_count', v_committed_count,
    'total_cmv_cents', v_total_cmv_cents
  );
END;
$$;

-- 8. Devolução Pós-Expedição com Segurança Sanitária (process_order_return_quarantine_atomic)
-- Permite receber produtos devolvidos, colocando-os em QUARENTENA ou registrando descarte
CREATE OR REPLACE FUNCTION public.process_order_return_quarantine_atomic(
  p_tenant_id uuid,
  p_order_id uuid,
  p_action varchar(30), -- 'quarantine' | 'discard_loss' | 'no_physical_return'
  p_reason text,
  p_actor_user_id uuid DEFAULT null
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_res record;
  v_batch record;
  v_order record;
  v_quarantine_batch_id uuid;
  v_processed_count integer := 0;
BEGIN
  IF p_reason IS NULL OR trim(p_reason) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'O motivo da devolução/cancelamento é obrigatório para controle sanitário.');
  END IF;

  IF p_action NOT IN ('quarantine', 'discard_loss', 'no_physical_return') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ação inválida. Utilize "quarantine", "discard_loss" ou "no_physical_return".');
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE tenant_id = p_tenant_id AND id = p_order_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Pedido não encontrado.');
  END IF;

  FOR v_res IN
    SELECT * FROM public.inventory_reservations
    WHERE tenant_id = p_tenant_id AND order_id = p_order_id AND status = 'committed'
    FOR UPDATE
  LOOP
    SELECT * INTO v_batch
    FROM public.inventory_batches
    WHERE id = v_res.batch_id;

    IF FOUND THEN
      IF p_action = 'quarantine' THEN
        -- Cria um lote isolado com status 'quarantine' (não entra em venda ativa FEFO)
        v_quarantine_batch_id := gen_random_uuid();
        INSERT INTO public.inventory_batches (
          id, tenant_id, batch_type, raw_material_id, variant_id,
          batch_code, manufacture_date, expiration_date,
          initial_quantity, current_quantity, reserved_quantity,
          unit_cost_cents, storage_location, status, notes
        ) VALUES (
          v_quarantine_batch_id, p_tenant_id, 'finished_product', null, v_res.variant_id,
          format('QUARENTENA-%s-%s', v_order.order_number, substring(v_res.id::text, 1, 4)),
          v_batch.manufacture_date, v_batch.expiration_date,
          v_res.reserved_quantity, v_res.reserved_quantity, 0,
          v_batch.unit_cost_cents, 'freezer_quarentena', 'quarantine',
          format('Devolução do Pedido %s (Lote original: %s). Motivo: %s', v_order.order_number, v_batch.batch_code, p_reason)
        );

        -- Registra movimentação de entrada em quarentena
        INSERT INTO public.inventory_movements (
          tenant_id, item_type, variant_id, batch_id,
          movement_type, quantity, unit_cost_cents, total_cost_cents,
          order_id, reservation_id, performed_by_user_id, reason
        ) VALUES (
          p_tenant_id, 'finished_product', v_res.variant_id, v_quarantine_batch_id,
          'order_cancelled_return', v_res.reserved_quantity, v_batch.unit_cost_cents,
          v_res.reserved_quantity * v_batch.unit_cost_cents,
          p_order_id, v_res.id, p_actor_user_id,
          format('Devolução recebida e colocada em QUARENTENA para inspeção: %s', p_reason)
        );

      ELSIF p_action = 'discard_loss' THEN
        -- Registra perda imediata sem reintegrar ao estoque físico
        INSERT INTO public.inventory_movements (
          tenant_id, item_type, variant_id, batch_id,
          movement_type, quantity, unit_cost_cents, total_cost_cents,
          order_id, reservation_id, performed_by_user_id, reason
        ) VALUES (
          p_tenant_id, 'finished_product', v_res.variant_id, v_res.batch_id,
          'spoilage_loss', v_res.reserved_quantity, v_batch.unit_cost_cents,
          v_res.reserved_quantity * v_batch.unit_cost_cents,
          p_order_id, v_res.id, p_actor_user_id,
          format('Descarte sanitário pós-devolução de pedido: %s', p_reason)
        );
      END IF;

      v_processed_count := v_processed_count + 1;
    END IF;

    -- Marca reserva como liberada
    UPDATE public.inventory_reservations
    SET status = 'released',
        updated_at = now()
    WHERE id = v_res.id;
  END LOOP;

  -- Registra auditoria
  INSERT INTO public.audit_logs (
    tenant_id, actor_id, action, resource_type, resource_id,
    payload_before, payload_after
  ) VALUES (
    p_tenant_id, p_actor_user_id, 'order_return_sanitary_processed', 'orders', p_order_id,
    jsonb_build_object('order_number', v_order.order_number),
    jsonb_build_object('action', p_action, 'reason', p_reason, 'processed_items', v_processed_count)
  );

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'action_taken', p_action,
    'processed_items', v_processed_count,
    'reason', p_reason
  );
END;
$$;

-- 9. Avaliação e Liberação de Lote em Quarentena (evaluate_quarantine_batch_atomic)
-- Permite ao responsável técnico aprovar ou descartar um lote em quarentena após checar cadeia de frio
CREATE OR REPLACE FUNCTION public.evaluate_quarantine_batch_atomic(
  p_tenant_id uuid,
  p_batch_id uuid,
  p_decision varchar(30), -- 'approve_reintegration' | 'discard_loss'
  p_reason text,
  p_actor_user_id uuid DEFAULT null
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_batch record;
BEGIN
  IF p_reason IS NULL OR trim(p_reason) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'A justificativa do laudo técnico é obrigatória.');
  END IF;

  SELECT * INTO v_batch
  FROM public.inventory_batches
  WHERE tenant_id = p_tenant_id AND id = p_batch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Lote não encontrado.');
  END IF;

  IF v_batch.status != 'quarantine' THEN
    RETURN jsonb_build_object('success', false, 'error', format('O lote deve estar em quarentena. Status atual: "%s".', v_batch.status));
  END IF;

  IF p_decision = 'approve_reintegration' THEN
    -- Aprovado: libera para o freezer principal e status ativo para vendas FEFO
    UPDATE public.inventory_batches
    SET status = 'active',
        storage_location = 'freezer_principal',
        notes = COALESCE(notes, '') || format(' [Aprovado em inspeção sanitária: %s]', p_reason),
        updated_at = now()
    WHERE id = p_batch_id;

    INSERT INTO public.audit_logs (
      tenant_id, actor_id, action, resource_type, resource_id,
      payload_before, payload_after
    ) VALUES (
      p_tenant_id, p_actor_user_id, 'quarantine_batch_approved', 'inventory_batches', p_batch_id,
      jsonb_build_object('previous_status', 'quarantine'),
      jsonb_build_object('new_status', 'active', 'reason', p_reason)
    );

  ELSIF p_decision = 'discard_loss' THEN
    -- Descartado: zera quantidade física e marca como descartado
    UPDATE public.inventory_batches
    SET status = 'discarded',
        current_quantity = 0,
        notes = COALESCE(notes, '') || format(' [Descartado após inspeção sanitária: %s]', p_reason),
        updated_at = now()
    WHERE id = p_batch_id;

    INSERT INTO public.inventory_movements (
      tenant_id, item_type, variant_id, batch_id,
      movement_type, quantity, unit_cost_cents, total_cost_cents,
      performed_by_user_id, reason
    ) VALUES (
      p_tenant_id, 'finished_product', v_batch.variant_id, p_batch_id,
      'spoilage_loss', v_batch.current_quantity, v_batch.unit_cost_cents,
      ROUND(v_batch.current_quantity * v_batch.unit_cost_cents),
      p_actor_user_id, format('Descarte sanitário definitivo de quarentena: %s', p_reason)
    );

    INSERT INTO public.audit_logs (
      tenant_id, actor_id, action, resource_type, resource_id,
      payload_before, payload_after
    ) VALUES (
      p_tenant_id, p_actor_user_id, 'quarantine_batch_discarded', 'inventory_batches', p_batch_id,
      jsonb_build_object('previous_status', 'quarantine'),
      jsonb_build_object('new_status', 'discarded', 'reason', p_reason)
    );
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Decisão inválida. Escolha "approve_reintegration" ou "discard_loss".');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'batch_id', p_batch_id,
    'decision', p_decision,
    'reason', p_reason
  );
END;
$$;

-- 8. Ajuste Manual de Lote com Auditoria (adjust_inventory_batch_atomic)
CREATE OR REPLACE FUNCTION public.adjust_inventory_batch_atomic(
  p_tenant_id uuid,
  p_batch_id uuid,
  p_new_quantity numeric(12,4),
  p_reason text,
  p_actor_user_id uuid DEFAULT null
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_batch record;
  v_diff numeric(12,4);
  v_movement_type varchar(35);
BEGIN
  IF p_reason IS NULL OR trim(p_reason) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'O motivo do ajuste manual é obrigatório para auditoria.');
  END IF;

  SELECT * INTO v_batch
  FROM public.inventory_batches
  WHERE tenant_id = p_tenant_id AND id = p_batch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Lote não encontrado.');
  END IF;

  IF p_new_quantity < v_batch.reserved_quantity THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('A nova quantidade não pode ser menor que a quantidade atualmente reservada (%s).', v_batch.reserved_quantity)
    );
  END IF;

  v_diff := p_new_quantity - v_batch.current_quantity;
  IF v_diff = 0 THEN
    RETURN jsonb_build_object('success', true, 'idempotent', true, 'message', 'Quantidade idêntica à atual.');
  END IF;

  IF v_diff > 0 THEN
    v_movement_type := 'manual_adjustment_in';
  ELSE
    v_movement_type := 'manual_adjustment_out';
  END IF;

  -- Atualiza o lote
  UPDATE public.inventory_batches
  SET current_quantity = p_new_quantity,
      status = CASE WHEN p_new_quantity = 0 THEN 'exhausted' ELSE 'active' END,
      updated_at = now()
  WHERE id = p_batch_id;

  -- Se for insumo, ajusta o saldo da matéria-prima
  IF v_batch.batch_type = 'raw_material' THEN
    UPDATE public.inventory_raw_materials
    SET current_stock = GREATEST(0, current_stock + v_diff),
        updated_at = now()
    WHERE id = v_batch.raw_material_id;
  END IF;

  -- Registra a movimentação imutável
  INSERT INTO public.inventory_movements (
    tenant_id, item_type, raw_material_id, variant_id, batch_id,
    movement_type, quantity, unit_cost_cents, total_cost_cents,
    performed_by_user_id, reason
  ) VALUES (
    p_tenant_id, v_batch.batch_type, v_batch.raw_material_id, v_batch.variant_id, p_batch_id,
    v_movement_type, ABS(v_diff), v_batch.unit_cost_cents,
    ROUND(ABS(v_diff) * v_batch.unit_cost_cents),
    p_actor_user_id, p_reason
  );

  -- Registra auditoria
  INSERT INTO public.audit_logs (
    tenant_id, actor_id, action, resource_type, resource_id,
    payload_before, payload_after
  ) VALUES (
    p_tenant_id, p_actor_user_id, 'inventory_batch_adjusted', 'inventory_batches', p_batch_id,
    jsonb_build_object('previous_quantity', v_batch.current_quantity, 'status', v_batch.status),
    jsonb_build_object('new_quantity', p_new_quantity, 'diff', v_diff, 'reason', p_reason)
  );

  RETURN jsonb_build_object(
    'success', true,
    'batch_id', p_batch_id,
    'previous_quantity', v_batch.current_quantity,
    'new_quantity', p_new_quantity,
    'diff', v_diff
  );
END;
$$;

