-- ==============================================================================
-- Migration 00022: Distance Bands Pricing Mode & Transactional Courier Cost Audit
-- Incremental & backward-compatible (preserves pricing_mode = 'fixed', 'distance',
-- 'external_quote', create_order_atomic 15-arg and create_order_with_delivery_quote_atomic 20-arg).
-- ==============================================================================

-- 1. Estender CHECK de pricing_mode em tenant_commerce_settings e delivery_quotes
ALTER TABLE public.tenant_commerce_settings
  DROP CONSTRAINT IF EXISTS tenant_commerce_settings_pricing_mode_check;

ALTER TABLE public.tenant_commerce_settings
  ADD CONSTRAINT tenant_commerce_settings_pricing_mode_check
  CHECK (pricing_mode IN ('fixed', 'distance', 'distance_band', 'external_quote'));

ALTER TABLE public.tenant_commerce_settings
  ADD COLUMN IF NOT EXISTS distance_bands jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.delivery_quotes
  DROP CONSTRAINT IF EXISTS delivery_quotes_pricing_mode_check;

ALTER TABLE public.delivery_quotes
  ADD CONSTRAINT delivery_quotes_pricing_mode_check
  CHECK (pricing_mode IN ('fixed', 'distance', 'distance_band', 'external_quote'));

-- 2. Função SQL rigorosa para validar distance_bands (inteiros, início em 0, sem lacunas/sobreposição)
CREATE OR REPLACE FUNCTION public.validate_distance_bands_jsonb(p_bands jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_elem jsonb;
  v_prev_max integer := NULL;
  v_min integer;
  v_max integer;
BEGIN
  IF p_bands IS NULL OR jsonb_typeof(p_bands) <> 'array' THEN
    RETURN false;
  END IF;

  IF jsonb_array_length(p_bands) = 0 THEN
    RETURN true;
  END IF;

  -- Validação individual de tipos e inteiros em todas as faixas
  FOR v_elem IN SELECT * FROM jsonb_array_elements(p_bands)
  LOOP
    IF jsonb_typeof(v_elem) <> 'object' THEN
      RETURN false;
    END IF;
    IF jsonb_typeof(v_elem->'minMeters') <> 'number'
       OR jsonb_typeof(v_elem->'maxMeters') <> 'number'
       OR jsonb_typeof(v_elem->'feeCents') <> 'number'
       OR jsonb_typeof(v_elem->'active') <> 'boolean' THEN
      RETURN false;
    END IF;
    IF NOT ((v_elem->>'minMeters') ~ '^[0-9]+$'
            AND (v_elem->>'maxMeters') ~ '^[0-9]+$'
            AND (v_elem->>'feeCents') ~ '^[0-9]+$') THEN
      RETURN false;
    END IF;
    IF (v_elem->>'minMeters')::integer < 0
       OR (v_elem->>'maxMeters')::integer <= (v_elem->>'minMeters')::integer
       OR (v_elem->>'feeCents')::integer < 0 THEN
      RETURN false;
    END IF;
  END LOOP;

  -- Validação de continuidade das faixas ativas (início em 0 m, sem sobreposição ou lacunas)
  FOR v_elem IN
    SELECT elem
    FROM jsonb_array_elements(p_bands) AS elem
    WHERE (elem->>'active')::boolean = true
    ORDER BY (elem->>'minMeters')::integer ASC
  LOOP
    v_min := (v_elem->>'minMeters')::integer;
    v_max := (v_elem->>'maxMeters')::integer;
    IF v_prev_max IS NULL THEN
      IF v_min <> 0 THEN
        RETURN false;
      END IF;
    ELSE
      IF v_min <> v_prev_max THEN
        RETURN false;
      END IF;
    END IF;
    v_prev_max := v_max;
  END LOOP;

  RETURN true;
END;
$$;

ALTER TABLE public.tenant_commerce_settings
  DROP CONSTRAINT IF EXISTS tenant_commerce_settings_distance_bands_check;

ALTER TABLE public.tenant_commerce_settings
  ADD CONSTRAINT tenant_commerce_settings_distance_bands_check
  CHECK (public.validate_distance_bands_jsonb(distance_bands));

ALTER TABLE public.tenant_commerce_settings
  DROP CONSTRAINT IF EXISTS tenant_commerce_settings_distance_band_non_empty_check;

ALTER TABLE public.tenant_commerce_settings
  ADD CONSTRAINT tenant_commerce_settings_distance_band_non_empty_check
  CHECK (
    pricing_mode <> 'distance_band'
    OR EXISTS (
      SELECT 1
      FROM jsonb_array_elements(distance_bands) AS elem
      WHERE (elem->>'active')::boolean = true
    )
  );

-- 3. Colunas operacionais em orders para custo real pago ao app (99/Uber/próprio)
-- Separadas de delivery_fee_cents / total_cents cobrados do cliente.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS actual_courier_cost_cents integer
    CHECK (actual_courier_cost_cents IS NULL OR actual_courier_cost_cents >= 0),
  ADD COLUMN IF NOT EXISTS courier_provider varchar(30)
    CHECK (courier_provider IS NULL OR courier_provider IN ('99', 'uber', 'own_driver', 'other')),
  ADD COLUMN IF NOT EXISTS courier_actual_distance_meters integer
    CHECK (courier_actual_distance_meters IS NULL OR courier_actual_distance_meters >= 0),
  ADD COLUMN IF NOT EXISTS courier_cost_recorded_at timestamptz,
  ADD COLUMN IF NOT EXISTS courier_cost_notes varchar(300);

-- 4. Tabela de auditoria de alterações de custo real de entrega (sem PII)
CREATE TABLE IF NOT EXISTS public.order_courier_cost_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  recorded_by_user_id uuid,
  previous_cost_cents integer,
  new_cost_cents integer NOT NULL CHECK (new_cost_cents >= 0),
  courier_provider varchar(30) NOT NULL CHECK (courier_provider IN ('99', 'uber', 'own_driver', 'other')),
  actual_distance_meters integer CHECK (actual_distance_meters IS NULL OR actual_distance_meters >= 0),
  notes varchar(300),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_courier_cost_audit_tenant_order
  ON public.order_courier_cost_audit (tenant_id, order_id, created_at DESC);

ALTER TABLE public.order_courier_cost_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on order_courier_cost_audit" ON public.order_courier_cost_audit;
CREATE POLICY "Service role full access on order_courier_cost_audit"
  ON public.order_courier_cost_audit
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 5. RPC transacional atômica para registrar custo real da corrida + trilha de auditoria
-- Garante que atualização em orders e inserção em order_courier_cost_audit ocorram juntas,
-- preservando delivery_fee_cents, total_cents e pagamentos do cliente intactos.
CREATE OR REPLACE FUNCTION public.record_order_courier_cost_atomic(
  p_tenant_id uuid,
  p_order_id uuid,
  p_recorded_by_user_id uuid,
  p_actual_courier_cost_cents integer,
  p_courier_provider varchar,
  p_courier_actual_distance_meters integer DEFAULT NULL,
  p_courier_cost_notes varchar DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_now timestamptz := now();
BEGIN
  IF p_actual_courier_cost_cents IS NULL OR p_actual_courier_cost_cents < 0 THEN
    RAISE EXCEPTION 'COURIER_COST_INVALID: Custo real deve ser inteiro >= 0.';
  END IF;

  SELECT *
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id
    AND tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND: Pedido não localizado para este estabelecimento.';
  END IF;

  UPDATE public.orders
  SET actual_courier_cost_cents = p_actual_courier_cost_cents,
      courier_provider = p_courier_provider,
      courier_actual_distance_meters = p_courier_actual_distance_meters,
      courier_cost_recorded_at = v_now,
      courier_cost_notes = left(coalesce(p_courier_cost_notes, ''), 300)
  WHERE id = v_order.id
    AND tenant_id = p_tenant_id;

  INSERT INTO public.order_courier_cost_audit (
    tenant_id,
    order_id,
    recorded_by_user_id,
    previous_cost_cents,
    new_cost_cents,
    courier_provider,
    actual_distance_meters,
    notes
  ) VALUES (
    p_tenant_id,
    v_order.id,
    p_recorded_by_user_id,
    v_order.actual_courier_cost_cents,
    p_actual_courier_cost_cents,
    p_courier_provider,
    p_courier_actual_distance_meters,
    NULLIF(left(coalesce(p_courier_cost_notes, ''), 300), '')
  );

  RETURN jsonb_build_object(
    'order_id', v_order.id,
    'order_number', v_order.order_number,
    'delivery_fee_cents', v_order.delivery_fee_cents,
    'total_cents', v_order.total_cents,
    'actual_courier_cost_cents', p_actual_courier_cost_cents,
    'difference_cents', (v_order.delivery_fee_cents - p_actual_courier_cost_cents),
    'recorded_at', v_now
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_order_courier_cost_atomic(
  uuid, uuid, uuid, integer, varchar, integer, varchar
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.record_order_courier_cost_atomic(
  uuid, uuid, uuid, integer, varchar, integer, varchar
) TO service_role;

NOTIFY pgrst, 'reload schema';
