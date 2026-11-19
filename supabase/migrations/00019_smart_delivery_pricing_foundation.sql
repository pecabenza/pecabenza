-- ==============================================================================
-- Migration 00019: Smart Delivery Pricing Foundation & Quote Persistence
-- Backward-compatible: preserves pricing_mode = 'fixed' as default for all tenants.
-- ==============================================================================

-- 1. Evolução de tenant_commerce_settings (mantendo taxa fixa como padrão)
ALTER TABLE public.tenant_commerce_settings
  ADD COLUMN IF NOT EXISTS pricing_mode varchar(20) NOT NULL DEFAULT 'fixed'
    CHECK (pricing_mode IN ('fixed', 'distance', 'external_quote')),
  ADD COLUMN IF NOT EXISTS pricing_rule_version integer NOT NULL DEFAULT 1
    CHECK (pricing_rule_version >= 1),
  ADD COLUMN IF NOT EXISTS origin_zip_code varchar(20),
  ADD COLUMN IF NOT EXISTS origin_street varchar(200),
  ADD COLUMN IF NOT EXISTS origin_number varchar(30),
  ADD COLUMN IF NOT EXISTS origin_neighborhood varchar(120),
  ADD COLUMN IF NOT EXISTS origin_city varchar(120),
  ADD COLUMN IF NOT EXISTS origin_state varchar(10),
  ADD COLUMN IF NOT EXISTS origin_formatted_address varchar(300),
  ADD COLUMN IF NOT EXISTS origin_lat numeric(9, 6),
  ADD COLUMN IF NOT EXISTS origin_lng numeric(9, 6),
  ADD COLUMN IF NOT EXISTS origin_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS route_provider varchar(20) NOT NULL DEFAULT 'google'
    CHECK (route_provider IN ('google', 'mapbox')),
  ADD COLUMN IF NOT EXISTS base_delivery_fee_cents integer NOT NULL DEFAULT 500
    CHECK (base_delivery_fee_cents >= 0),
  ADD COLUMN IF NOT EXISTS per_km_fee_cents integer NOT NULL DEFAULT 150
    CHECK (per_km_fee_cents >= 0),
  ADD COLUMN IF NOT EXISTS min_delivery_fee_cents integer NOT NULL DEFAULT 600
    CHECK (min_delivery_fee_cents >= 0),
  ADD COLUMN IF NOT EXISTS max_delivery_fee_cents integer NOT NULL DEFAULT 3000
    CHECK (max_delivery_fee_cents >= 0),
  ADD COLUMN IF NOT EXISTS max_delivery_distance_km numeric(6, 2) NOT NULL DEFAULT 10.00
    CHECK (max_delivery_distance_km > 0),
  ADD COLUMN IF NOT EXISTS distance_rounding_mode varchar(20) NOT NULL DEFAULT 'tenth_km'
    CHECK (distance_rounding_mode IN ('exact', 'tenth_km', 'ceil_km')),
  ADD COLUMN IF NOT EXISTS free_delivery_max_distance_km numeric(6, 2)
    CHECK (free_delivery_max_distance_km IS NULL OR free_delivery_max_distance_km > 0),
  ADD COLUMN IF NOT EXISTS max_delivery_subsidy_cents integer
    CHECK (max_delivery_subsidy_cents IS NULL OR max_delivery_subsidy_cents >= 0),
  ADD COLUMN IF NOT EXISTS contingency_policy varchar(30) NOT NULL DEFAULT 'block_on_failure'
    CHECK (contingency_policy IN ('block_on_failure', 'fixed_fallback'));

-- 2. Tabela de Cotações de Entrega com vínculo a Tenant, Carrinho, Endereço e Versão da Regra
CREATE TABLE IF NOT EXISTS public.delivery_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  checkout_session_id varchar(120),
  pricing_mode varchar(20) NOT NULL CHECK (pricing_mode IN ('fixed', 'distance', 'external_quote')),
  pricing_rule_version integer NOT NULL DEFAULT 1,
  address_hash varchar(64) NOT NULL,
  cart_hash varchar(64) NOT NULL,
  server_subtotal_cents integer NOT NULL CHECK (server_subtotal_cents >= 0),
  dest_lat numeric(9, 6),
  dest_lng numeric(9, 6),
  distance_meters integer CHECK (distance_meters IS NULL OR distance_meters >= 0),
  duration_seconds integer CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  base_fee_cents integer NOT NULL DEFAULT 0 CHECK (base_fee_cents >= 0),
  distance_fee_cents integer NOT NULL DEFAULT 0 CHECK (distance_fee_cents >= 0),
  surcharge_cents integer NOT NULL DEFAULT 0 CHECK (surcharge_cents >= 0),
  subsidy_cents integer NOT NULL DEFAULT 0 CHECK (subsidy_cents >= 0),
  final_fee_cents integer NOT NULL CHECK (final_fee_cents >= 0),
  provider varchar(30) NOT NULL DEFAULT 'internal',
  status varchar(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'used', 'expired', 'invalidated')),
  used_order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_delivery_quotes_tenant_lookup
  ON public.delivery_quotes (tenant_id, address_hash, cart_hash, status, expires_at DESC);

ALTER TABLE public.delivery_quotes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on delivery_quotes" ON public.delivery_quotes;
CREATE POLICY "Service role full access on delivery_quotes"
  ON public.delivery_quotes
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 3. Colunas opcionais em orders para rastreabilidade da cotação aprovada
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivery_quote_id uuid REFERENCES public.delivery_quotes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS delivery_distance_meters integer CHECK (delivery_distance_meters IS NULL OR delivery_distance_meters >= 0),
  ADD COLUMN IF NOT EXISTS delivery_duration_seconds integer CHECK (delivery_duration_seconds IS NULL OR delivery_duration_seconds >= 0);

-- 4. Função RPC atômica para consumo único (com idempotência por pedido) de cotação de entrega
CREATE OR REPLACE FUNCTION public.consume_delivery_quote_atomic(
  p_tenant_id uuid,
  p_quote_id uuid,
  p_order_id uuid,
  p_address_hash text,
  p_cart_hash text,
  p_pricing_rule_version integer,
  p_checkout_session_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quote public.delivery_quotes%ROWTYPE;
BEGIN
  SELECT *
  INTO v_quote
  FROM public.delivery_quotes
  WHERE id = p_quote_id
    AND tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cotação de entrega não localizada para este estabelecimento.');
  END IF;

  -- Retry idempotente legítimo para o mesmo pedido já vinculado
  IF v_quote.status = 'used' AND v_quote.used_order_id = p_order_id THEN
    RETURN jsonb_build_object(
      'success', true,
      'idempotent', true,
      'quote_id', v_quote.id,
      'final_fee_cents', v_quote.final_fee_cents,
      'distance_meters', v_quote.distance_meters,
      'duration_seconds', v_quote.duration_seconds
    );
  END IF;

  IF v_quote.status <> 'active' OR v_quote.used_order_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Esta cotação de entrega já foi utilizada ou invalidada.');
  END IF;

  IF v_quote.expires_at <= now() THEN
    UPDATE public.delivery_quotes SET status = 'expired' WHERE id = v_quote.id;
    RETURN jsonb_build_object('success', false, 'error', 'A cotação de entrega expirou. Recalcule antes de confirmar.');
  END IF;

  IF v_quote.checkout_session_id IS NOT NULL AND (p_checkout_session_id IS NULL OR v_quote.checkout_session_id <> p_checkout_session_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sessão de checkout divergente da cotação gerada.');
  END IF;

  IF v_quote.address_hash <> p_address_hash THEN
    RETURN jsonb_build_object('success', false, 'error', 'O endereço do pedido diverge da cotação de entrega gerada.');
  END IF;

  IF v_quote.cart_hash <> p_cart_hash THEN
    RETURN jsonb_build_object('success', false, 'error', 'Os itens da sacola mudaram após a cotação de entrega.');
  END IF;

  IF v_quote.pricing_rule_version <> p_pricing_rule_version THEN
    RETURN jsonb_build_object('success', false, 'error', 'As regras comerciais de frete foram atualizadas. Recalcule a entrega.');
  END IF;

  UPDATE public.delivery_quotes
  SET status = 'used',
      used_order_id = p_order_id
  WHERE id = v_quote.id;

  RETURN jsonb_build_object(
    'success', true,
    'idempotent', false,
    'quote_id', v_quote.id,
    'final_fee_cents', v_quote.final_fee_cents,
    'distance_meters', v_quote.distance_meters,
    'duration_seconds', v_quote.duration_seconds
  );
END;
$$;

REVOKE ALL ON FUNCTION public.consume_delivery_quote_atomic(uuid, uuid, uuid, text, text, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_delivery_quote_atomic(uuid, uuid, uuid, text, text, integer, text) TO service_role;

