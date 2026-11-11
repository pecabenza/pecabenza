-- ==============================================================================
-- MIGRATION 00013: PEDIDO RÁPIDO E ATENDIMENTO MULTICANAL (ETAPA 3C)
-- Unifica pedidos de Site, WhatsApp, Telefone e Balcão na mesma engine
-- transacional e operacional (orders + Multi-Station KDS + Payments + Tracking).
-- ==============================================================================

-- 1. Garante extensão pgcrypto ativa para funções de criptografia e geração de tokens
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Evolução da tabela public.orders com suporte multicanal, métodos de pagamento e idempotência
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS order_channel varchar(30) NOT NULL DEFAULT 'website',
  ADD COLUMN IF NOT EXISTS payment_method varchar(30) NOT NULL DEFAULT 'pix',
  ADD COLUMN IF NOT EXISTS cash_change_for_cents integer,
  ADD COLUMN IF NOT EXISTS created_by_user_id uuid,
  ADD COLUMN IF NOT EXISTS idempotency_key varchar(100);

-- Atualiza constraint de order_channel
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_order_channel_check;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_order_channel_check
  CHECK (order_channel IN ('website', 'whatsapp', 'phone', 'counter', 'admin'));

-- Atualiza constraint de payment_method em orders
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_payment_method_check;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_payment_method_check
  CHECK (payment_method IN ('pix', 'cash', 'card_on_delivery', 'pos_card', 'credit_card'));

-- Atualiza constraint de cash_change_for_cents
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_cash_change_for_cents_check;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_cash_change_for_cents_check
  CHECK (cash_change_for_cents IS NULL OR cash_change_for_cents >= 0);

-- Atualiza constraint de fulfillment_type para suportar consumo no local ('dine_in') além de 'delivery' e 'pickup'
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_fulfillment_type_check;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_fulfillment_type_check
  CHECK (fulfillment_type IN ('delivery', 'pickup', 'dine_in'));

-- Atualiza constraint de payment_status em orders para aceitar todos os estados financeiros canônicos e legados
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_payment_status_check;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_payment_status_check
  CHECK (payment_status IN ('pending', 'processing', 'paid', 'failed', 'expired', 'cancelled', 'refunded', 'unpaid', 'awaiting_payment'));

-- Índices compostos para busca rápida de clientes por telefone, filtro por canal e chave de idempotência por tenant
CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_tenant_idempotency
  ON public.orders (tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_tenant_channel_created
  ON public.orders (tenant_id, order_channel, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_tenant_phone_created
  ON public.orders (tenant_id, customer_phone, created_at DESC);

-- 2. Evolução da tabela public.payments para suportar pagamentos presenciais / manuais auditados
ALTER TABLE public.payments ALTER COLUMN pix_expires_at DROP NOT NULL;

ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_method_check;
ALTER TABLE public.payments
  ADD CONSTRAINT payments_method_check
  CHECK (method IN ('pix', 'credit_card', 'cash', 'card_on_delivery', 'pos_card'));

-- 3. Atualiza RPC update_order_status_atomic para contemplar 'dine_in' junto com 'pickup'
CREATE OR REPLACE FUNCTION public.update_order_status_atomic(
  p_tenant_id uuid,
  p_order_id uuid,
  p_to_status varchar,
  p_source varchar DEFAULT 'admin',
  p_actor_user_id uuid DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_order record;
  v_is_valid boolean := false;
BEGIN
  -- 1. Busca pedido bloqueando linha para evitar condição de corrida
  SELECT id, status, fulfillment_type, payment_status
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id AND tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Pedido não encontrado para este estabelecimento.'
    );
  END IF;

  -- 2. Idempotência: se já está no status desejado, retorna sucesso sem duplicar evento
  IF v_order.status = p_to_status THEN
    RETURN jsonb_build_object(
      'success', true,
      'idempotent', true,
      'order_id', v_order.id,
      'from_status', v_order.status,
      'to_status', p_to_status
    );
  END IF;

  -- 3. Validação estrita da máquina de estados
  IF v_order.status IN ('pending', 'awaiting_payment') AND p_to_status IN ('confirmed', 'cancelled') THEN
    v_is_valid := true;
  ELSIF v_order.status IN ('confirmed', 'paid') AND p_to_status IN ('preparing', 'cancelled') THEN
    v_is_valid := true;
  ELSIF v_order.status = 'preparing' AND p_to_status IN ('ready', 'cancelled') THEN
    v_is_valid := true;
  ELSIF v_order.status = 'ready' THEN
    IF v_order.fulfillment_type IN ('pickup', 'dine_in') AND p_to_status IN ('delivered', 'cancelled') THEN
      v_is_valid := true;
    ELSIF v_order.fulfillment_type = 'delivery' AND p_to_status IN ('out_for_delivery', 'delivered', 'cancelled') THEN
      v_is_valid := true;
    END IF;
  ELSIF v_order.status = 'out_for_delivery' AND p_to_status IN ('delivered', 'cancelled') THEN
    v_is_valid := true;
  END IF;

  IF NOT v_is_valid THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Transição de status inválida de "%s" para "%s" (modalidade: %s).', v_order.status, p_to_status, v_order.fulfillment_type)
    );
  END IF;

  -- 4. Atualiza pedido
  UPDATE public.orders
  SET status = p_to_status,
      updated_at = now()
  WHERE id = v_order.id AND tenant_id = p_tenant_id;

  -- 5. Registra evento imutável na timeline
  INSERT INTO public.order_status_events (
    tenant_id,
    order_id,
    from_status,
    to_status,
    source,
    actor_user_id,
    metadata
  ) VALUES (
    p_tenant_id,
    v_order.id,
    v_order.status,
    p_to_status,
    p_source,
    p_actor_user_id,
    COALESCE(p_metadata, '{}'::jsonb)
  );

  -- 6. Se o pedido acabou de entrar em 'confirmed', inicializa etapas de produção do KDS
  IF p_to_status = 'confirmed' THEN
    PERFORM public.initialize_order_production_steps_atomic(
      p_tenant_id,
      v_order.id,
      p_actor_user_id
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'idempotent', false,
    'order_id', v_order.id,
    'from_status', v_order.status,
    'to_status', p_to_status
  );
END;
$$;

-- 4. RPC Atômica: create_quick_order_atomic
-- Cria pedido multicanal (WhatsApp, Telefone, Balcão) validando preços autoritativos no banco,
-- chave de idempotência, separação entre status operacional e financeiro, e inicializando KDS.
CREATE OR REPLACE FUNCTION public.create_quick_order_atomic(
  p_tenant_id uuid,
  p_order_channel varchar,
  p_customer_name varchar,
  p_customer_phone varchar,
  p_customer_email varchar DEFAULT NULL,
  p_fulfillment_type varchar DEFAULT 'pickup',
  p_schedule_type varchar DEFAULT 'asap',
  p_scheduled_for timestamptz DEFAULT NULL,
  p_payment_method varchar DEFAULT 'pix',
  p_payment_status varchar DEFAULT 'pending',
  p_initial_status varchar DEFAULT 'confirmed',
  p_delivery_fee_cents integer DEFAULT 0,
  p_discount_cents integer DEFAULT 0,
  p_cash_change_for_cents integer DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_items jsonb DEFAULT '[]'::jsonb,
  p_address jsonb DEFAULT NULL,
  p_created_by_user_id uuid DEFAULT NULL,
  p_idempotency_key varchar DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_existing record;
  v_order_id uuid;
  v_order_number varchar(20);
  v_tracking_token varchar(64);
  v_clean_idemp_key varchar(100);
  v_item jsonb;
  v_variant record;
  v_qty integer;
  v_item_subtotal integer;
  v_calc_subtotal_cents integer := 0;
  v_safe_delivery_fee_cents integer := GREATEST(0, COALESCE(p_delivery_fee_cents, 0));
  v_safe_discount_cents integer := GREATEST(0, COALESCE(p_discount_cents, 0));
  v_calc_total_cents integer := 0;
  v_ValidatedItems jsonb := '[]'::jsonb;
BEGIN
  -- 1. Validações de domínio
  IF p_order_channel NOT IN ('website', 'whatsapp', 'phone', 'counter', 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Canal do pedido inválido.');
  END IF;

  IF p_fulfillment_type NOT IN ('delivery', 'pickup', 'dine_in') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Modalidade de atendimento inválida.');
  END IF;

  IF p_payment_method NOT IN ('pix', 'cash', 'card_on_delivery', 'pos_card', 'credit_card') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Método de pagamento inválido.');
  END IF;

  IF p_initial_status NOT IN ('pending', 'confirmed', 'awaiting_payment') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Status inicial inválido.');
  END IF;

  IF p_payment_status NOT IN ('pending', 'paid', 'unpaid', 'awaiting_payment') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Status de pagamento inicial inválido.');
  END IF;

  IF p_fulfillment_type = 'delivery' AND (p_address IS NULL OR COALESCE(btrim(p_address->>'street'), '') = '') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Endereço de entrega é obrigatório para pedidos de entrega.');
  END IF;

  -- 2. Verificação de Idempotência por (tenant_id, idempotency_key)
  v_clean_idemp_key := NULLIF(btrim(COALESCE(p_idempotency_key, '')), '');
  IF v_clean_idemp_key IS NOT NULL THEN
    SELECT id, order_number, public_tracking_token, status, payment_status, subtotal_cents, delivery_fee_cents, discount_cents, total_cents
    INTO v_existing
    FROM public.orders
    WHERE tenant_id = p_tenant_id AND idempotency_key = v_clean_idemp_key
    LIMIT 1;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'success', true,
        'idempotent', true,
        'order_id', v_existing.id,
        'order_number', v_existing.order_number,
        'public_tracking_token', v_existing.public_tracking_token,
        'status', v_existing.status,
        'payment_status', v_existing.payment_status,
        'subtotal_cents', v_existing.subtotal_cents,
        'delivery_fee_cents', v_existing.delivery_fee_cents,
        'discount_cents', v_existing.discount_cents,
        'total_cents', v_existing.total_cents
      );
    END IF;
  END IF;

  -- 3. Valida itens e calcula preços autoritativos diretamente das tabelas do tenant
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'O pedido deve conter pelo menos 1 item.');
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_qty := COALESCE((v_item->>'quantity')::integer, 0);
    IF v_qty <= 0 OR v_qty > 99 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Quantidade de item inválida (deve ser entre 1 e 99).');
    END IF;

    SELECT
      pv.id AS variant_id,
      pv.product_id,
      pv.name AS variant_name,
      pv.price_in_cents,
      pv.is_available,
      p.name AS product_name,
      p.status AS product_status
    INTO v_variant
    FROM public.product_variants pv
    JOIN public.products p ON p.id = pv.product_id AND p.tenant_id = pv.tenant_id
    WHERE pv.id = (v_item->>'variant_id')::uuid
      AND pv.tenant_id = p_tenant_id;

    IF NOT FOUND THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Um ou mais itens selecionados não pertencem a este estabelecimento ou não existem.'
      );
    END IF;

    IF v_variant.product_status <> 'active' OR NOT v_variant.is_available THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', format('O item "%s (%s)" está indisponível no cardápio.', v_variant.product_name, v_variant.variant_name)
      );
    END IF;

    v_item_subtotal := v_variant.price_in_cents * v_qty;
    v_calc_subtotal_cents := v_calc_subtotal_cents + v_item_subtotal;

    v_ValidatedItems := v_ValidatedItems || jsonb_build_array(
      jsonb_build_object(
        'product_id', v_variant.product_id,
        'variant_id', v_variant.variant_id,
        'snapshot_product_name', v_variant.product_name,
        'snapshot_variant_name', v_variant.variant_name,
        'quantity', v_qty,
        'unit_price_cents', v_variant.price_in_cents,
        'subtotal_cents', v_item_subtotal
      )
    );
  END LOOP;

  -- 4. Valida desconto e calcula total autoritativo
  IF p_fulfillment_type IN ('pickup', 'dine_in') THEN
    v_safe_delivery_fee_cents := 0;
  END IF;

  IF v_safe_discount_cents > (v_calc_subtotal_cents + v_safe_delivery_fee_cents) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'O valor do desconto não pode exceder o subtotal do pedido.'
    );
  END IF;

  v_calc_total_cents := GREATEST(0, v_calc_subtotal_cents + v_safe_delivery_fee_cents - v_safe_discount_cents);

  -- 5. Valida troco para pagamento em dinheiro
  IF p_payment_method = 'cash' AND p_cash_change_for_cents IS NOT NULL AND p_cash_change_for_cents > 0 THEN
    IF p_cash_change_for_cents < v_calc_total_cents THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'O valor informado para troco deve ser maior ou igual ao total do pedido.'
      );
    END IF;
  END IF;

  -- 6. Gera número sequencial e token público seguro
  v_order_number := public.generate_next_order_number(p_tenant_id);
  v_tracking_token := encode(extensions.gen_random_bytes(24), 'hex');

  -- 7. Insere pedido principal
  INSERT INTO public.orders (
    tenant_id,
    order_number,
    public_tracking_token,
    order_channel,
    customer_name,
    customer_phone,
    customer_email,
    fulfillment_type,
    schedule_type,
    scheduled_for,
    status,
    payment_method,
    payment_status,
    cash_change_for_cents,
    subtotal_cents,
    delivery_fee_cents,
    discount_cents,
    total_cents,
    currency,
    notes,
    created_by_user_id,
    idempotency_key
  ) VALUES (
    p_tenant_id,
    v_order_number,
    v_tracking_token,
    p_order_channel,
    COALESCE(NULLIF(btrim(p_customer_name), ''), 'Cliente Balcão'),
    COALESCE(btrim(p_customer_phone), ''),
    NULLIF(btrim(COALESCE(p_customer_email, '')), ''),
    p_fulfillment_type,
    p_schedule_type,
    p_scheduled_for,
    p_initial_status,
    p_payment_method,
    p_payment_status,
    CASE WHEN p_payment_method = 'cash' THEN p_cash_change_for_cents ELSE NULL END,
    v_calc_subtotal_cents,
    v_safe_delivery_fee_cents,
    v_safe_discount_cents,
    v_calc_total_cents,
    'BRL',
    NULLIF(btrim(COALESCE(p_notes, '')), ''),
    p_created_by_user_id,
    v_clean_idemp_key
  )
  RETURNING id INTO v_order_id;

  -- 8. Insere itens validados
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_ValidatedItems)
  LOOP
    INSERT INTO public.order_items (
      tenant_id,
      order_id,
      product_id,
      variant_id,
      snapshot_product_name,
      snapshot_variant_name,
      quantity,
      unit_price_cents,
      subtotal_cents
    ) VALUES (
      p_tenant_id,
      v_order_id,
      (v_item->>'product_id')::uuid,
      (v_item->>'variant_id')::uuid,
      v_item->>'snapshot_product_name',
      v_item->>'snapshot_variant_name',
      (v_item->>'quantity')::integer,
      (v_item->>'unit_price_cents')::integer,
      (v_item->>'subtotal_cents')::integer
    );
  END LOOP;

  -- 9. Insere endereço quando modalidade for delivery
  IF p_fulfillment_type = 'delivery' AND p_address IS NOT NULL THEN
    INSERT INTO public.order_addresses (
      tenant_id,
      order_id,
      zip_code,
      street,
      number,
      complement,
      neighborhood,
      city,
      state,
      reference
    ) VALUES (
      p_tenant_id,
      v_order_id,
      COALESCE(NULLIF(btrim(p_address->>'zip_code'), ''), '00000-000'),
      p_address->>'street',
      COALESCE(NULLIF(btrim(p_address->>'number'), ''), 'S/N'),
      NULLIF(btrim(COALESCE(p_address->>'complement', '')), ''),
      COALESCE(NULLIF(btrim(p_address->>'neighborhood'), ''), 'Centro'),
      COALESCE(NULLIF(btrim(p_address->>'city'), ''), 'São Paulo'),
      UPPER(COALESCE(NULLIF(btrim(p_address->>'state'), ''), 'SP')),
      NULLIF(btrim(COALESCE(p_address->>'reference', '')), '')
    );
  END IF;

  -- 10. Se pagamento já foi recebido no balcão/atendimento (payment_status = 'paid'), cria registro em payments
  IF p_payment_status = 'paid' THEN
    INSERT INTO public.payments (
      tenant_id,
      order_id,
      provider,
      provider_payment_id,
      method,
      status,
      amount_cents,
      paid_at,
      metadata
    ) VALUES (
      p_tenant_id,
      v_order_id,
      'mock',
      'manual_' || replace(v_order_id::text, '-', ''),
      p_payment_method,
      'paid',
      v_calc_total_cents,
      now(),
      jsonb_build_object(
        'source', 'quick_order_pos',
        'order_channel', p_order_channel,
        'confirmed_by_user_id', p_created_by_user_id
      )
    );
  END IF;

  -- 11. Registra evento inicial imutável na timeline do pedido
  INSERT INTO public.order_status_events (
    tenant_id,
    order_id,
    from_status,
    to_status,
    source,
    actor_user_id,
    metadata
  ) VALUES (
    p_tenant_id,
    v_order_id,
    NULL,
    p_initial_status,
    'admin',
    p_created_by_user_id,
    jsonb_build_object(
      'action', 'quick_order_created',
      'order_channel', p_order_channel,
      'fulfillment_type', p_fulfillment_type,
      'payment_method', p_payment_method,
      'payment_status', p_payment_status,
      'discount_cents', v_safe_discount_cents
    )
  );

  -- 12. Registra auditoria administrativa em audit_logs
  INSERT INTO public.audit_logs (
    tenant_id,
    actor_id,
    action,
    resource_type,
    resource_id,
    payload_after
  ) VALUES (
    p_tenant_id,
    p_created_by_user_id,
    'quick_order_created',
    'order',
    v_order_id::text,
    jsonb_build_object(
      'order_number', v_order_number,
      'order_channel', p_order_channel,
      'fulfillment_type', p_fulfillment_type,
      'payment_method', p_payment_method,
      'payment_status', p_payment_status,
      'subtotal_cents', v_calc_subtotal_cents,
      'delivery_fee_cents', v_safe_delivery_fee_cents,
      'discount_cents', v_safe_discount_cents,
      'total_cents', v_calc_total_cents
    )
  );

  -- 13. Se já nasceu 'confirmed', inicializa imediatamente o checklist e etapas de produção do KDS
  IF p_initial_status = 'confirmed' THEN
    PERFORM public.initialize_order_production_steps_atomic(
      p_tenant_id,
      v_order_id,
      p_created_by_user_id
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'idempotent', false,
    'order_id', v_order_id,
    'order_number', v_order_number,
    'public_tracking_token', v_tracking_token,
    'status', p_initial_status,
    'payment_status', p_payment_status,
    'subtotal_cents', v_calc_subtotal_cents,
    'delivery_fee_cents', v_safe_delivery_fee_cents,
    'discount_cents', v_safe_discount_cents,
    'total_cents', v_calc_total_cents
  );
END;
$$;

-- 5. RPC Atômica: confirm_manual_order_payment_atomic
-- Permite que operador autorizado confirme recebimento manual (Dinheiro, POS, Cartão na Entrega ou Pix conferido),
-- registrando trilha de auditoria sem misturar estado financeiro com status operacional.
CREATE OR REPLACE FUNCTION public.confirm_manual_order_payment_atomic(
  p_tenant_id uuid,
  p_order_id uuid,
  p_payment_method varchar DEFAULT NULL,
  p_actor_user_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_order record;
  v_final_method varchar(30);
  v_new_order_status varchar(30);
  v_payment_id uuid;
BEGIN
  SELECT id, order_number, status, payment_status, payment_method, total_cents
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id AND tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Pedido não localizado para este estabelecimento.');
  END IF;

  IF v_order.status = 'cancelled' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Não é possível confirmar pagamento de um pedido cancelado.');
  END IF;

  IF v_order.payment_status = 'paid' THEN
    RETURN jsonb_build_object(
      'success', true,
      'idempotent', true,
      'order_id', v_order.id,
      'status', v_order.status,
      'payment_status', 'paid'
    );
  END IF;

  v_final_method := COALESCE(NULLIF(btrim(p_payment_method), ''), v_order.payment_method, 'cash');
  IF v_final_method NOT IN ('pix', 'cash', 'card_on_delivery', 'pos_card', 'credit_card') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Método de pagamento inválido.');
  END IF;

  -- Se o pedido estava aguardando confirmação ('pending' ou 'awaiting_payment'), promove para 'confirmed'
  IF v_order.status IN ('pending', 'awaiting_payment') THEN
    v_new_order_status := 'confirmed';
  ELSE
    v_new_order_status := v_order.status;
  END IF;

  UPDATE public.orders
  SET payment_status = 'paid',
      payment_method = v_final_method,
      status = v_new_order_status,
      updated_at = now()
  WHERE id = v_order.id AND tenant_id = p_tenant_id;

  -- Atualiza pagamento pendente existente ou insere novo registro de liquidação manual
  SELECT id INTO v_payment_id
  FROM public.payments
  WHERE tenant_id = p_tenant_id AND order_id = v_order.id AND status = 'pending'
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_payment_id IS NOT NULL THEN
    UPDATE public.payments
    SET status = 'paid',
        method = v_final_method,
        paid_at = now(),
        updated_at = now(),
        metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
          'manual_confirmation', true,
          'confirmed_by_user_id', p_actor_user_id,
          'notes', p_notes
        )
    WHERE id = v_payment_id;
  ELSE
    INSERT INTO public.payments (
      tenant_id,
      order_id,
      provider,
      provider_payment_id,
      method,
      status,
      amount_cents,
      paid_at,
      metadata
    ) VALUES (
      p_tenant_id,
      v_order.id,
      'mock',
      'manual_' || replace(v_order.id::text, '-', '') || '_' || extract(epoch from now())::bigint,
      v_final_method,
      'paid',
      v_order.total_cents,
      now(),
      jsonb_build_object(
        'manual_confirmation', true,
        'confirmed_by_user_id', p_actor_user_id,
        'notes', p_notes
      )
    )
    RETURNING id INTO v_payment_id;
  END IF;

  -- Se houve promoção de status operacional para 'confirmed', registra evento na timeline e inicializa KDS
  IF v_new_order_status <> v_order.status THEN
    INSERT INTO public.order_status_events (
      tenant_id,
      order_id,
      from_status,
      to_status,
      source,
      actor_user_id,
      metadata
    ) VALUES (
      p_tenant_id,
      v_order.id,
      v_order.status,
      v_new_order_status,
      'admin',
      p_actor_user_id,
      jsonb_build_object(
        'action', 'manual_payment_confirmed',
        'payment_method', v_final_method,
        'notes', p_notes
      )
    );

    PERFORM public.initialize_order_production_steps_atomic(
      p_tenant_id,
      v_order.id,
      p_actor_user_id
    );
  END IF;

  -- Registra auditoria administrativa obrigatória
  INSERT INTO public.audit_logs (
    tenant_id,
    actor_id,
    action,
    resource_type,
    resource_id,
    payload_before,
    payload_after
  ) VALUES (
    p_tenant_id,
    p_actor_user_id,
    'manual_payment_confirmed',
    'order',
    v_order.id::text,
    jsonb_build_object(
      'payment_status', v_order.payment_status,
      'status', v_order.status
    ),
    jsonb_build_object(
      'payment_status', 'paid',
      'payment_method', v_final_method,
      'status', v_new_order_status,
      'amount_cents', v_order.total_cents,
      'notes', p_notes
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'idempotent', false,
    'order_id', v_order.id,
    'payment_id', v_payment_id,
    'status', v_new_order_status,
    'payment_status', 'paid',
    'payment_method', v_final_method
  );
END;
$$;

