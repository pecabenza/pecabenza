-- ==============================================================================
-- Migration 00010: Order Status State Machine, Immutability Audit Events & Public Tracking Token
-- ==============================================================================

-- 1. Token Público Seguro e Não-Enumerável para Acompanhamento
ALTER TABLE public.orders 
  ADD COLUMN IF NOT EXISTS public_tracking_token varchar(64) UNIQUE;

-- Gera tokens para pedidos existentes que não tenham token público
UPDATE public.orders
SET public_tracking_token = encode(gen_random_bytes(24), 'hex')
WHERE public_tracking_token IS NULL;

-- Torna o token obrigatório para todos os pedidos futuros
ALTER TABLE public.orders 
  ALTER COLUMN public_tracking_token SET NOT NULL,
  ALTER COLUMN public_tracking_token SET DEFAULT encode(gen_random_bytes(24), 'hex');

CREATE INDEX IF NOT EXISTS idx_orders_public_tracking_token 
  ON public.orders(public_tracking_token);

-- 2. Atualização dos Status Canônicos Comerciais e Operacionais em orders
-- Canônicos: 'pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'cancelled'
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_status_check 
  CHECK (status IN ('pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'cancelled', 'awaiting_payment', 'paid'));

-- Normaliza status legados em orders
UPDATE public.orders SET status = 'confirmed' WHERE status = 'paid';
UPDATE public.orders SET status = 'pending' WHERE status = 'awaiting_payment';

-- 3. Tabela Imutável de Eventos de Histórico do Pedido (order_status_events)
CREATE TABLE IF NOT EXISTS public.order_status_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  order_id uuid NOT NULL,
  from_status varchar(30),
  to_status varchar(30) NOT NULL,
  source varchar(50) NOT NULL CHECK (source IN ('system', 'admin', 'payment_webhook', 'delivery_provider', 'driver')),
  actor_user_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_order_status_events_order
    FOREIGN KEY (tenant_id, order_id)
    REFERENCES public.orders(tenant_id, id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_order_status_events_order 
  ON public.order_status_events(tenant_id, order_id, created_at ASC);

-- 4. Trigger Anti-Tampering (Imutabilidade Estrita: Bloqueio de UPDATE e DELETE)
CREATE OR REPLACE FUNCTION public.prevent_order_status_events_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'A tabela order_status_events é estritamente imutável. Atualizações ou exclusões de eventos históricos são proibidas.';
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_order_status_events_mutation ON public.order_status_events;
CREATE TRIGGER trg_prevent_order_status_events_mutation
  BEFORE UPDATE OR DELETE ON public.order_status_events
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_order_status_events_mutation();

-- 5. Função RPC Atômica para Transição de Status de Pedido (Máquina de Estados)
CREATE OR REPLACE FUNCTION public.update_order_status_atomic(
  p_tenant_id uuid,
  p_order_id uuid,
  p_to_status varchar,
  p_source varchar,
  p_actor_user_id uuid DEFAULT null,
  p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_order record;
  v_from_status varchar;
  v_fulfillment_type varchar;
  v_is_valid boolean := false;
BEGIN
  -- 1. Localiza o pedido com lock pessimista
  SELECT id, status, fulfillment_type, payment_status INTO v_current_order
  FROM public.orders
  WHERE tenant_id = p_tenant_id AND id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Pedido não localizado para o tenant informado.'
    );
  END IF;

  v_from_status := v_current_order.status;
  v_fulfillment_type := v_current_order.fulfillment_type;

  -- 2. Idempotência: Se já está no status solicitado, retorna sucesso sem duplicar eventos
  IF v_from_status = p_to_status THEN
    RETURN jsonb_build_object(
      'success', true,
      'idempotent', true,
      'order_id', p_order_id,
      'status', p_to_status,
      'message', 'Pedido já se encontra no status solicitado.'
    );
  END IF;

  -- 3. Validação da Máquina de Estados Canônica
  -- Regras:
  -- pending -> confirmed, cancelled
  -- confirmed -> preparing, cancelled
  -- preparing -> ready, cancelled
  -- ready -> out_for_delivery (apenas delivery), delivered (pickup ou delivery), cancelled
  -- out_for_delivery -> delivered, cancelled
  -- delivered -> (terminal)
  -- cancelled -> (terminal)

  IF v_from_status = 'pending' AND p_to_status IN ('confirmed', 'cancelled') THEN
    v_is_valid := true;
  ELSIF v_from_status = 'confirmed' AND p_to_status IN ('preparing', 'cancelled') THEN
    v_is_valid := true;
  ELSIF v_from_status = 'preparing' AND p_to_status IN ('ready', 'cancelled') THEN
    v_is_valid := true;
  ELSIF v_from_status = 'ready' THEN
    IF v_fulfillment_type = 'pickup' AND p_to_status = 'out_for_delivery' THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Pedidos de Retirada (pickup) não passam por Saiu para Entrega. Transicione para Entregue.'
      );
    ELSIF p_to_status IN ('out_for_delivery', 'delivered', 'cancelled') THEN
      v_is_valid := true;
    END IF;
  ELSIF v_from_status = 'out_for_delivery' AND p_to_status IN ('delivered', 'cancelled') THEN
    v_is_valid := true;
  END IF;

  IF NOT v_is_valid THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Transição de status inválida: não é permitido transicionar de "%s" para "%s".', v_from_status, p_to_status)
    );
  END IF;

  -- 4. Atualiza o status em orders
  UPDATE public.orders
  SET
    status = p_to_status,
    updated_at = timezone('utc'::text, now())
  WHERE tenant_id = p_tenant_id AND id = p_order_id;

  -- 5. Registra o evento imutável em order_status_events
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
    p_order_id,
    v_from_status,
    p_to_status,
    p_source,
    p_actor_user_id,
    p_metadata
  );

  RETURN jsonb_build_object(
    'success', true,
    'idempotent', false,
    'order_id', p_order_id,
    'from_status', v_from_status,
    'to_status', p_to_status
  );
END;
$$;

-- 6. Atualização da RPC process_payment_webhook_atomic para registrar evento e avançar para 'confirmed'
CREATE OR REPLACE FUNCTION public.process_payment_webhook_atomic(
  p_tenant_id uuid,
  p_provider varchar,
  p_event_id varchar,
  p_event_type varchar,
  p_provider_payment_id varchar,
  p_new_status varchar,
  p_paid_at timestamptz,
  p_payload jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_event record;
  v_payment record;
  v_order_id uuid;
  v_current_order_status varchar;
BEGIN
  -- 1. Idempotência de webhook
  SELECT id, processed INTO v_existing_event
  FROM public.payment_webhook_events
  WHERE tenant_id = p_tenant_id
    AND provider = p_provider
    AND event_id = p_event_id;

  IF FOUND AND v_existing_event.processed = true THEN
    RETURN jsonb_build_object(
      'success', true,
      'idempotent', true,
      'message', 'Evento já processado anteriormente com sucesso.'
    );
  END IF;

  -- 2. Registrar ou atualizar evento de webhook
  INSERT INTO public.payment_webhook_events (
    tenant_id,
    provider,
    event_id,
    event_type,
    payload,
    processed,
    processed_at
  ) VALUES (
    p_tenant_id,
    p_provider,
    p_event_id,
    p_event_type,
    p_payload,
    false,
    null
  )
  ON CONFLICT (tenant_id, provider, event_id) 
  DO UPDATE SET
    payload = EXCLUDED.payload,
    event_type = EXCLUDED.event_type;

  -- 3. Localizar transação de pagamento correspondente
  SELECT id, order_id, status, amount_cents INTO v_payment
  FROM public.payments
  WHERE tenant_id = p_tenant_id
    AND (
      provider_payment_id = p_provider_payment_id
      OR id::text = p_provider_payment_id
    )
  FOR UPDATE;

  IF NOT FOUND THEN
    UPDATE public.payment_webhook_events
    SET error_message = 'Transação de pagamento correspondente não foi encontrada no banco.'
    WHERE tenant_id = p_tenant_id AND provider = p_provider AND event_id = p_event_id;

    RETURN jsonb_build_object(
      'success', false,
      'idempotent', false,
      'error', 'Pagamento não localizado para o identificador fornecido.'
    );
  END IF;

  v_order_id := v_payment.order_id;

  -- 4. Atualizar status do pagamento
  UPDATE public.payments
  SET
    status = p_new_status,
    paid_at = CASE 
      WHEN p_new_status = 'paid' THEN COALESCE(p_paid_at, timezone('utc'::text, now()))
      ELSE paid_at
    END,
    updated_at = timezone('utc'::text, now())
  WHERE tenant_id = p_tenant_id AND id = v_payment.id;

  -- 5. Atualizar status do pedido e registrar evento de histórico
  SELECT status INTO v_current_order_status
  FROM public.orders
  WHERE tenant_id = p_tenant_id AND id = v_order_id;

  IF p_new_status = 'paid' THEN
    -- Atualiza payment_status
    UPDATE public.orders
    SET
      payment_status = 'paid',
      status = CASE 
        WHEN status IN ('pending', 'awaiting_payment') THEN 'confirmed'
        ELSE status
      END,
      updated_at = timezone('utc'::text, now())
    WHERE tenant_id = p_tenant_id AND id = v_order_id;

    -- Se o pedido estava pendente, registra a transição para 'confirmed'
    IF v_current_order_status IN ('pending', 'awaiting_payment') THEN
      INSERT INTO public.order_status_events (
        tenant_id,
        order_id,
        from_status,
        to_status,
        source,
        metadata
      ) VALUES (
        p_tenant_id,
        v_order_id,
        v_current_order_status,
        'confirmed',
        'payment_webhook',
        jsonb_build_object('provider', p_provider, 'event_id', p_event_id)
      );
    END IF;

  ELSIF p_new_status = 'expired' THEN
    UPDATE public.orders
    SET
      status = 'cancelled',
      payment_status = 'unpaid',
      updated_at = timezone('utc'::text, now())
    WHERE tenant_id = p_tenant_id 
      AND id = v_order_id 
      AND payment_status IN ('unpaid', 'awaiting_payment');

    IF v_current_order_status IN ('pending', 'awaiting_payment') THEN
      INSERT INTO public.order_status_events (
        tenant_id,
        order_id,
        from_status,
        to_status,
        source,
        metadata
      ) VALUES (
        p_tenant_id,
        v_order_id,
        v_current_order_status,
        'cancelled',
        'payment_webhook',
        jsonb_build_object('reason', 'pix_expired', 'provider', p_provider)
      );
    END IF;
  END IF;

  -- 6. Concluir evento como processado com sucesso
  UPDATE public.payment_webhook_events
  SET
    processed = true,
    processed_at = timezone('utc'::text, now()),
    error_message = null
  WHERE tenant_id = p_tenant_id AND provider = p_provider AND event_id = p_event_id;

  RETURN jsonb_build_object(
    'success', true,
    'idempotent', false,
    'payment_id', v_payment.id,
    'order_id', v_order_id,
    'new_status', p_new_status
  );
END;
$$;

-- 7. Row Level Security (RLS) para order_status_events
ALTER TABLE public.order_status_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_order_status_events ON public.order_status_events;
CREATE POLICY tenant_isolation_order_status_events ON public.order_status_events
  FOR ALL
  USING (
    tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
    OR current_setting('role', true) = 'service_role'
  )
  WITH CHECK (
    tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
    OR current_setting('role', true) = 'service_role'
  );

