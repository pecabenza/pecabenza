-- ==============================================================================
-- Migration 00021: Dedicated Single-Transaction Order + Delivery Quote RPC
-- Creates public.create_order_with_delivery_quote_atomic without modifying or
-- overloading public.create_order_atomic (15-arg legacy/fixed RPC preserved 100%).
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.create_order_with_delivery_quote_atomic(
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
  p_address jsonb DEFAULT NULL,
  p_delivery_quote_id uuid DEFAULT NULL,
  p_quote_address_hash text DEFAULT NULL,
  p_quote_cart_hash text DEFAULT NULL,
  p_quote_pricing_rule_version integer DEFAULT NULL,
  p_quote_checkout_session_id text DEFAULT NULL
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
  v_quote public.delivery_quotes%ROWTYPE;
BEGIN
  -- 0. Se houver cotação de entrega vinculada (modo distance), travar e validar ANTES de criar o pedido
  IF p_delivery_quote_id IS NOT NULL THEN
    SELECT *
    INTO v_quote
    FROM public.delivery_quotes
    WHERE id = p_delivery_quote_id
      AND tenant_id = p_tenant_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'QUOTE_NOT_FOUND: Cotação de entrega não localizada para este estabelecimento.';
    END IF;

    IF v_quote.status <> 'active' OR v_quote.used_order_id IS NOT NULL THEN
      RAISE EXCEPTION 'QUOTE_ALREADY_USED: Esta cotação de entrega já foi utilizada ou invalidada.';
    END IF;

    IF v_quote.expires_at <= now() THEN
      UPDATE public.delivery_quotes SET status = 'expired' WHERE id = v_quote.id;
      RAISE EXCEPTION 'QUOTE_EXPIRED: A cotação de entrega expirou. Recalcule antes de confirmar.';
    END IF;

    IF v_quote.checkout_session_id IS NOT NULL AND (p_quote_checkout_session_id IS NULL OR v_quote.checkout_session_id <> p_quote_checkout_session_id) THEN
      RAISE EXCEPTION 'QUOTE_SESSION_MISMATCH: Sessão de checkout divergente da cotação gerada.';
    END IF;

    IF p_quote_address_hash IS NULL OR v_quote.address_hash <> p_quote_address_hash THEN
      RAISE EXCEPTION 'QUOTE_ADDRESS_MISMATCH: O endereço do pedido diverge da cotação de entrega gerada.';
    END IF;

    IF p_quote_cart_hash IS NULL OR v_quote.cart_hash <> p_quote_cart_hash THEN
      RAISE EXCEPTION 'QUOTE_CART_MISMATCH: Os itens da sacola mudaram após a cotação de entrega.';
    END IF;

    IF p_quote_pricing_rule_version IS NULL OR v_quote.pricing_rule_version <> p_quote_pricing_rule_version THEN
      RAISE EXCEPTION 'QUOTE_RULE_MISMATCH: As regras comerciais de frete foram atualizadas. Recalcule a entrega.';
    END IF;

    IF v_quote.final_fee_cents <> p_delivery_fee_cents THEN
      RAISE EXCEPTION 'QUOTE_FEE_MISMATCH: Valor do frete diverge da cotação autorizada.';
    END IF;
  END IF;

  -- 1. Obter número sequencial com lock concorrente atômico
  v_order_number := public.generate_next_order_number(p_tenant_id);

  -- 2. Inserir pedido mestre (com snapshot opcional da cotação)
  INSERT INTO public.orders (
    id, tenant_id, order_number, customer_name, customer_phone, customer_email,
    fulfillment_type, schedule_type, scheduled_for, status, payment_status,
    subtotal_cents, delivery_fee_cents, discount_cents, total_cents, currency, notes,
    delivery_quote_id, delivery_distance_meters, delivery_duration_seconds
  ) VALUES (
    v_order_id, p_tenant_id, v_order_number, p_customer_name, p_customer_phone, p_customer_email,
    p_fulfillment_type, p_schedule_type, p_scheduled_for, 'awaiting_payment', 'unpaid',
    p_subtotal_cents, p_delivery_fee_cents, p_discount_cents, p_total_cents, p_currency, p_notes,
    p_delivery_quote_id,
    CASE WHEN p_delivery_quote_id IS NOT NULL THEN v_quote.distance_meters ELSE NULL END,
    CASE WHEN p_delivery_quote_id IS NOT NULL THEN v_quote.duration_seconds ELSE NULL END
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

  -- 5. Marcar cotação como utilizada na mesma transação do pedido
  IF p_delivery_quote_id IS NOT NULL THEN
    UPDATE public.delivery_quotes
    SET status = 'used',
        used_order_id = v_order_id
    WHERE id = v_quote.id;
  END IF;

  RETURN jsonb_build_object(
    'order_id', v_order_id,
    'order_number', v_order_number
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_order_with_delivery_quote_atomic(
  uuid, varchar, varchar, varchar, varchar, varchar, timestamptz,
  integer, integer, integer, integer, varchar, text, jsonb, jsonb,
  uuid, text, text, integer, text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_order_with_delivery_quote_atomic(
  uuid, varchar, varchar, varchar, varchar, varchar, timestamptz,
  integer, integer, integer, integer, varchar, text, jsonb, jsonb,
  uuid, text, text, integer, text
) TO service_role;

-- Atualiza o schema cache do PostgREST para expor a nova RPC imediatamente
NOTIFY pgrst, 'reload schema';

