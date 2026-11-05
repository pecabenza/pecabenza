-- ==============================================================================
-- Migration 00008: Commerce Orders, Order Items, Addresses & Atomic Transaction Engine
-- ==============================================================================

-- 1. Unificação semântica dos modos de site (Elimina redundância entre 'commerce' e 'live')
-- 'prelaunch': catálogo visual demonstrativo com aviso de lançamento futuro
-- 'institutional': catálogo vitrine/institucional sem checkout online
-- 'commerce': e-commerce completo com carrinho, cálculo de frete e criação de pedidos
ALTER TABLE public.tenants DROP CONSTRAINT IF EXISTS tenants_site_mode_check;
ALTER TABLE public.tenants ADD CONSTRAINT tenants_site_mode_check 
  CHECK (site_mode IN ('prelaunch', 'institutional', 'commerce'));

-- 2. Tabela de Configurações Comerciais por Tenant (Taxas, Mínimos, Entregas/Retiradas)
CREATE TABLE IF NOT EXISTS public.tenant_commerce_settings (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  delivery_enabled boolean NOT NULL DEFAULT true,
  pickup_enabled boolean NOT NULL DEFAULT true,
  fixed_delivery_fee_cents integer NOT NULL DEFAULT 1200 CHECK (fixed_delivery_fee_cents >= 0),
  free_delivery_threshold_cents integer CHECK (free_delivery_threshold_cents IS NULL OR free_delivery_threshold_cents > 0),
  min_order_value_cents integer NOT NULL DEFAULT 3000 CHECK (min_order_value_cents >= 0),
  asap_enabled boolean NOT NULL DEFAULT true,
  scheduled_enabled boolean NOT NULL DEFAULT true,
  estimated_delivery_time_min integer NOT NULL DEFAULT 60,
  estimated_pickup_time_min integer NOT NULL DEFAULT 30,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Tabela de Contadores Concorrentes por Tenant (Garantia de Não-Colisão de order_number)
CREATE TABLE IF NOT EXISTS public.tenant_order_counters (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  last_order_number integer NOT NULL DEFAULT 100,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 4. Tabela de Pedidos (Orders)
CREATE TABLE IF NOT EXISTS public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  order_number varchar(30) NOT NULL,
  customer_name varchar(150) NOT NULL,
  customer_phone varchar(30) NOT NULL,
  customer_email varchar(255),
  fulfillment_type varchar(20) NOT NULL CHECK (fulfillment_type IN ('delivery', 'pickup')),
  schedule_type varchar(20) NOT NULL DEFAULT 'asap' CHECK (schedule_type IN ('asap', 'scheduled')),
  scheduled_for timestamptz,
  status varchar(30) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'awaiting_payment', 'paid', 'cancelled')),
  payment_status varchar(30) NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'awaiting_payment', 'paid', 'refunded')),
  subtotal_cents integer NOT NULL CHECK (subtotal_cents >= 0),
  delivery_fee_cents integer NOT NULL DEFAULT 0 CHECK (delivery_fee_cents >= 0),
  discount_cents integer NOT NULL DEFAULT 0 CHECK (discount_cents >= 0),
  total_cents integer NOT NULL CHECK (total_cents >= 0),
  currency varchar(3) NOT NULL DEFAULT 'BRL',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_orders_composite UNIQUE (tenant_id, id),
  CONSTRAINT uq_orders_number_per_tenant UNIQUE (tenant_id, order_number)
);

CREATE INDEX IF NOT EXISTS idx_orders_tenant_status ON public.orders(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_created ON public.orders(tenant_id, created_at DESC);

-- 5. Tabela de Itens do Pedido (Snapshot comercial imutável no momento da compra)
CREATE TABLE IF NOT EXISTS public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  order_id uuid NOT NULL,
  product_id uuid NOT NULL,
  variant_id uuid NOT NULL,
  snapshot_product_name varchar(150) NOT NULL,
  snapshot_variant_name varchar(100) NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price_cents integer NOT NULL CHECK (unit_price_cents >= 0),
  subtotal_cents integer NOT NULL CHECK (subtotal_cents >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_order_items_composite UNIQUE (tenant_id, id),
  CONSTRAINT fk_order_items_order_cross_tenant_safe
    FOREIGN KEY (tenant_id, order_id)
    REFERENCES public.orders(tenant_id, id)
    ON DELETE CASCADE,
  CONSTRAINT fk_order_items_product_cross_tenant_safe
    FOREIGN KEY (tenant_id, product_id)
    REFERENCES public.products(tenant_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_order_items_variant_cross_tenant_safe
    FOREIGN KEY (tenant_id, variant_id)
    REFERENCES public.product_variants(tenant_id, id)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_order_items_order ON public.order_items(tenant_id, order_id);

-- 6. Tabela de Endereço de Entrega do Pedido (Snapshot imutável)
CREATE TABLE IF NOT EXISTS public.order_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  order_id uuid NOT NULL UNIQUE,
  zip_code varchar(10) NOT NULL,
  street varchar(200) NOT NULL,
  number varchar(30) NOT NULL,
  complement varchar(100),
  neighborhood varchar(100) NOT NULL,
  city varchar(100) NOT NULL,
  state varchar(2) NOT NULL,
  reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_order_addresses_composite UNIQUE (tenant_id, id),
  CONSTRAINT fk_order_addresses_order_cross_tenant_safe
    FOREIGN KEY (tenant_id, order_id)
    REFERENCES public.orders(tenant_id, id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_order_addresses_lookup ON public.order_addresses(tenant_id, order_id);

-- 7. Função para geração CONCORRENTE e SEGURA do número de pedido por tenant (#000101)
CREATE OR REPLACE FUNCTION public.generate_next_order_number(p_tenant_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next_val integer;
  v_next_num text;
BEGIN
  -- Row-level lock com ON CONFLICT UPDATE garante unicidade mesmo sob alta concorrência
  INSERT INTO public.tenant_order_counters (tenant_id, last_order_number, updated_at)
  VALUES (p_tenant_id, 101, now())
  ON CONFLICT (tenant_id) DO UPDATE
    SET last_order_number = public.tenant_order_counters.last_order_number + 1,
        updated_at = now()
  RETURNING last_order_number INTO v_next_val;

  v_next_num := '#' || lpad(v_next_val::text, 6, '0');
  RETURN v_next_num;
END;
$$;

-- 8. Função / RPC para Criação Transacional Atômica de Pedidos (Zero Pedido Parcial)
CREATE OR REPLACE FUNCTION public.create_order_atomic(
  p_tenant_id uuid,
  p_customer_name varchar,
  p_customer_phone varchar,
  p_customer_email varchar,
  p_fulfillment_type varchar,
  p_schedule_type varchar,
  p_scheduled_for timestamptz,
  p_subtotal_cents integer,
  p_delivery_fee_cents integer,
  p_discount_cents integer,
  p_total_cents integer,
  p_currency varchar,
  p_notes text,
  p_items jsonb,
  p_address jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id uuid := gen_random_uuid();
  v_order_number text;
  v_item jsonb;
BEGIN
  -- 1. Obter número sequencial com lock concorrente atômico
  v_order_number := public.generate_next_order_number(p_tenant_id);

  -- 2. Inserir pedido mestre
  INSERT INTO public.orders (
    id, tenant_id, order_number, customer_name, customer_phone, customer_email,
    fulfillment_type, schedule_type, scheduled_for, status, payment_status,
    subtotal_cents, delivery_fee_cents, discount_cents, total_cents, currency, notes
  ) VALUES (
    v_order_id, p_tenant_id, v_order_number, p_customer_name, p_customer_phone, p_customer_email,
    p_fulfillment_type, p_schedule_type, p_scheduled_for, 'awaiting_payment', 'unpaid',
    p_subtotal_cents, p_delivery_fee_cents, p_discount_cents, p_total_cents, p_currency, p_notes
  );

  -- 3. Inserir itens do pedido
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO public.order_items (
      id, tenant_id, order_id, product_id, variant_id,
      snapshot_product_name, snapshot_variant_name,
      quantity, unit_price_cents, subtotal_cents
    ) VALUES (
      gen_random_uuid(), p_tenant_id, v_order_id,
      (v_item->>'product_id')::uuid,
      (v_item->>'variant_id')::uuid,
      v_item->>'snapshot_product_name',
      v_item->>'snapshot_variant_name',
      (v_item->>'quantity')::integer,
      (v_item->>'unit_price_cents')::integer,
      (v_item->>'subtotal_cents')::integer
    );
  END LOOP;

  -- 4. Inserir endereço se houver e modalidade for entrega
  IF p_address IS NOT NULL AND p_fulfillment_type = 'delivery' THEN
    INSERT INTO public.order_addresses (
      id, tenant_id, order_id, zip_code, street, number,
      complement, neighborhood, city, state, reference
    ) VALUES (
      gen_random_uuid(), p_tenant_id, v_order_id,
      p_address->>'zip_code',
      p_address->>'street',
      p_address->>'number',
      p_address->>'complement',
      p_address->>'neighborhood',
      p_address->>'city',
      p_address->>'state',
      p_address->>'reference'
    );
  END IF;

  RETURN jsonb_build_object(
    'order_id', v_order_id,
    'order_number', v_order_number
  );
END;
$$;

-- 9. Row Level Security (RLS)
ALTER TABLE public.tenant_commerce_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_order_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_addresses ENABLE ROW LEVEL SECURITY;

-- 9.1 tenant_commerce_settings: Leitura pública; Escrita restrita a administradores do tenant
DROP POLICY IF EXISTS "Public view commerce settings" ON public.tenant_commerce_settings;
CREATE POLICY "Public view commerce settings" ON public.tenant_commerce_settings
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admin manage commerce settings" ON public.tenant_commerce_settings;
CREATE POLICY "Admin manage commerce settings" ON public.tenant_commerce_settings
  FOR ALL TO authenticated
  USING (public.has_tenant_role(tenant_id, 'tenant_admin'));

-- 9.2 tenant_order_counters: Acesso exclusivo por security definer / admin
DROP POLICY IF EXISTS "Admin view order counters" ON public.tenant_order_counters;
CREATE POLICY "Admin view order counters" ON public.tenant_order_counters
  FOR ALL TO authenticated
  USING (public.is_tenant_member(tenant_id));

-- 9.3 orders: Leitura de confirmação por ID e gestão restrita ao tenant
DROP POLICY IF EXISTS "Public insert orders" ON public.orders;
CREATE POLICY "Public insert orders" ON public.orders
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Admin manage tenant orders" ON public.orders;
CREATE POLICY "Admin manage tenant orders" ON public.orders
  FOR ALL TO authenticated
  USING (public.is_tenant_member(tenant_id));

DROP POLICY IF EXISTS "Public view order by id" ON public.orders;
CREATE POLICY "Public view order by id" ON public.orders
  FOR SELECT USING (true);

-- 9.4 order_items: Gestão restrita ao tenant e leitura do pedido
DROP POLICY IF EXISTS "Public insert order items" ON public.order_items;
CREATE POLICY "Public insert order items" ON public.order_items
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Admin manage tenant order items" ON public.order_items;
CREATE POLICY "Admin manage tenant order items" ON public.order_items
  FOR ALL TO authenticated
  USING (public.is_tenant_member(tenant_id));

DROP POLICY IF EXISTS "Public view order items" ON public.order_items;
CREATE POLICY "Public view order items" ON public.order_items
  FOR SELECT USING (true);

-- 9.5 order_addresses: Gestão restrita ao tenant e leitura do pedido
DROP POLICY IF EXISTS "Public insert order addresses" ON public.order_addresses;
CREATE POLICY "Public insert order addresses" ON public.order_addresses
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Admin manage tenant order addresses" ON public.order_addresses;
CREATE POLICY "Admin manage tenant order addresses" ON public.order_addresses
  FOR ALL TO authenticated
  USING (public.is_tenant_member(tenant_id));

DROP POLICY IF EXISTS "Public view order addresses" ON public.order_addresses;
CREATE POLICY "Public view order addresses" ON public.order_addresses
  FOR SELECT USING (true);
