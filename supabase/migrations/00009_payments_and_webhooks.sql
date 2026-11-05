-- ==============================================================================
-- Migration 00009: Payments, Webhooks, Idempotency & Pix Dynamic Transaction Engine
-- ==============================================================================

-- 1. Tabela de Configurações de Pagamento por Tenant
CREATE TABLE IF NOT EXISTS public.tenant_payment_settings (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  provider varchar(50) NOT NULL DEFAULT 'mock' CHECK (provider IN ('mock', 'asaas', 'mercadopago')),
  is_active boolean NOT NULL DEFAULT true,
  pix_enabled boolean NOT NULL DEFAULT true,
  pix_expiration_minutes integer NOT NULL DEFAULT 15 CHECK (pix_expiration_minutes BETWEEN 5 AND 120),
  sandbox_mode boolean NOT NULL DEFAULT true,
  api_key_encrypted text,
  webhook_secret text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Seed de configurações default para os tenants de homologação
INSERT INTO public.tenant_payment_settings (tenant_id, provider, is_active, pix_enabled, pix_expiration_minutes, sandbox_mode)
VALUES 
  ('00000000-0000-0000-0000-000000000001', 'mock', true, true, 15, true),
  ('00000000-0000-0000-0000-000000000002', 'mock', true, true, 15, true)
ON CONFLICT (tenant_id) DO NOTHING;

-- 2. Tabela de Pagamentos (Transações de Cobrança vinculadas a Pedidos)
CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  order_id uuid NOT NULL,
  provider varchar(50) NOT NULL DEFAULT 'mock',
  provider_payment_id varchar(150),
  method varchar(30) NOT NULL DEFAULT 'pix' CHECK (method IN ('pix', 'credit_card')),
  status varchar(30) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'expired', 'failed', 'refunded')),
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  pix_qr_code_text text,
  pix_qr_code_url text,
  pix_expires_at timestamptz NOT NULL,
  paid_at timestamptz,
  failed_reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_payments_composite UNIQUE (tenant_id, id),
  CONSTRAINT fk_payments_order_cross_tenant_safe
    FOREIGN KEY (tenant_id, order_id)
    REFERENCES public.orders(tenant_id, id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_payments_tenant_order ON public.payments(tenant_id, order_id);
CREATE INDEX IF NOT EXISTS idx_payments_provider_id ON public.payments(tenant_id, provider, provider_payment_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON public.payments(tenant_id, status);

-- 3. Tabela de Eventos de Webhook (Auditoria e Idempotência Estrita)
CREATE TABLE IF NOT EXISTS public.payment_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  provider varchar(50) NOT NULL,
  event_id varchar(150) NOT NULL,
  event_type varchar(100) NOT NULL,
  payload jsonb NOT NULL,
  processed boolean NOT NULL DEFAULT false,
  processed_at timestamptz,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_payment_webhook_events UNIQUE (tenant_id, provider, event_id)
);

CREATE INDEX IF NOT EXISTS idx_payment_webhooks_lookup ON public.payment_webhook_events(tenant_id, provider, event_id);

-- 4. Função RPC Atômica para Processamento Idempotente de Webhooks
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
BEGIN
  -- 1. Verificação de idempotência: evento já processado anteriormente?
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
    -- Registra o erro no log de webhook para auditoria
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
      WHEN p_new_status = 'paid' THEN COALESCE(p_paid_at, now())
      ELSE paid_at
    END,
    updated_at = now()
  WHERE tenant_id = p_tenant_id AND id = v_payment.id;

  -- 5. Atualizar status do pedido associado de forma consistente
  IF p_new_status = 'paid' THEN
    UPDATE public.orders
    SET
      status = 'paid',
      payment_status = 'paid',
      updated_at = now()
    WHERE tenant_id = p_tenant_id AND id = v_order_id;
  ELSIF p_new_status = 'expired' THEN
    -- Se o pagamento expirou e o pedido não foi pago por outro meio, marca como cancelado
    UPDATE public.orders
    SET
      status = 'cancelled',
      payment_status = 'unpaid',
      updated_at = now()
    WHERE tenant_id = p_tenant_id 
      AND id = v_order_id 
      AND payment_status = 'unpaid';
  END IF;

  -- 6. Concluir evento como processado com sucesso
  UPDATE public.payment_webhook_events
  SET
    processed = true,
    processed_at = now(),
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

-- 5. Row Level Security (RLS)
ALTER TABLE public.tenant_payment_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_webhook_events ENABLE ROW LEVEL SECURITY;

-- Políticas de isolamento multi-tenant
DROP POLICY IF EXISTS tenant_isolation_tenant_payment_settings ON public.tenant_payment_settings;
CREATE POLICY tenant_isolation_tenant_payment_settings ON public.tenant_payment_settings
  FOR ALL
  USING (
    tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
    OR current_setting('role', true) = 'service_role'
  )
  WITH CHECK (
    tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
    OR current_setting('role', true) = 'service_role'
  );

DROP POLICY IF EXISTS tenant_isolation_payments ON public.payments;
CREATE POLICY tenant_isolation_payments ON public.payments
  FOR ALL
  USING (
    tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
    OR current_setting('role', true) = 'service_role'
  )
  WITH CHECK (
    tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
    OR current_setting('role', true) = 'service_role'
  );

DROP POLICY IF EXISTS tenant_isolation_payment_webhooks ON public.payment_webhook_events;
CREATE POLICY tenant_isolation_payment_webhooks ON public.payment_webhook_events
  FOR ALL
  USING (
    tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
    OR current_setting('role', true) = 'service_role'
  )
  WITH CHECK (
    tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
    OR current_setting('role', true) = 'service_role'
  );
