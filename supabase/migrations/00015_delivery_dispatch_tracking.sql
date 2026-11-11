-- ==============================================================================
-- Migration 00015: Gestão de Entregas, Expedição, Motoboys e Rastreamento (Etapa 3E)
-- Reaproveita orders, order_addresses, order_status_events (00008/00010/00013)
-- e integra baixa FEFO idempotente + quarentena sanitária da Etapa 3D (00014).
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 0. Endurecimento de Segurança (Remoção de Políticas Públicas Legadas de 00008)
-- Leitura e criação de pedidos ocorrem exclusivamente via RPCs SECURITY DEFINER
-- e Server APIs (token público mascarado / sessão administrativa).
DROP POLICY IF EXISTS "Public view order by id" ON public.orders;
DROP POLICY IF EXISTS "Public insert orders" ON public.orders;
DROP POLICY IF EXISTS "Public view order items" ON public.order_items;
DROP POLICY IF EXISTS "Public insert order items" ON public.order_items;
DROP POLICY IF EXISTS "Public view order addresses" ON public.order_addresses;
DROP POLICY IF EXISTS "Public insert order addresses" ON public.order_addresses;

-- 1. Evolução opcional e compatível de order_addresses para geocodificação futura
ALTER TABLE public.order_addresses
  ADD COLUMN IF NOT EXISTS latitude numeric(9,6),
  ADD COLUMN IF NOT EXISTS longitude numeric(9,6),
  ADD COLUMN IF NOT EXISTS geocoded_at timestamptz;

-- 2. Cadastro de Entregadores / Motoboys (Próprios e Terceirizados)
CREATE TABLE IF NOT EXISTS public.delivery_drivers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name varchar(120) NOT NULL,
  phone varchar(30) NOT NULL,
  driver_type varchar(30) NOT NULL DEFAULT 'internal'
    CHECK (driver_type IN ('internal', 'freelance', 'third_party')),
  vehicle_type varchar(30) NOT NULL DEFAULT 'motorcycle'
    CHECK (vehicle_type IN ('motorcycle', 'car', 'bicycle', 'other')),
  vehicle_plate varchar(20),
  availability_status varchar(20) NOT NULL DEFAULT 'available'
    CHECK (availability_status IN ('available', 'on_route', 'offline')),
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_delivery_drivers_composite UNIQUE (tenant_id, id)
);

CREATE INDEX IF NOT EXISTS idx_delivery_drivers_tenant_active
  ON public.delivery_drivers(tenant_id, is_active, availability_status);

-- 3. Contador Concorrente Seguro para Códigos de Romaneio (ROTA-0001)
CREATE TABLE IF NOT EXISTS public.tenant_delivery_counters (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  last_run_number integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.generate_next_delivery_run_code(p_tenant_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_next_num integer;
BEGIN
  INSERT INTO public.tenant_delivery_counters (tenant_id, last_run_number)
  VALUES (p_tenant_id, 1)
  ON CONFLICT (tenant_id) DO UPDATE
    SET last_run_number = public.tenant_delivery_counters.last_run_number + 1,
        updated_at = now()
  RETURNING last_run_number INTO v_next_num;

  RETURN 'ROTA-' || lpad(v_next_num::text, 4, '0');
END;
$$;

-- 4. Romaneios / Agrupamento de Saídas (delivery_runs)
CREATE TABLE IF NOT EXISTS public.delivery_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  run_code varchar(30) NOT NULL,
  driver_id uuid,
  status varchar(25) NOT NULL DEFAULT 'dispatched'
    CHECK (status IN ('draft', 'dispatched', 'in_progress', 'completed', 'cancelled')),
  driver_token_hash varchar(128) UNIQUE,
  driver_token_expires_at timestamptz,
  location_sharing_enabled boolean NOT NULL DEFAULT false,
  location_consent_at timestamptz,
  location_ended_at timestamptz,
  route_strategy varchar(40) NOT NULL DEFAULT 'manual'
    CHECK (route_strategy IN ('manual', 'neighborhood_group', 'google_route_optimization')),
  route_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  dispatched_at timestamptz,
  completed_at timestamptz,
  created_by_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_delivery_runs_composite UNIQUE (tenant_id, id),
  CONSTRAINT uq_delivery_runs_code_per_tenant UNIQUE (tenant_id, run_code),
  CONSTRAINT fk_delivery_runs_driver_cross_tenant_safe
    FOREIGN KEY (tenant_id, driver_id)
    REFERENCES public.delivery_drivers(tenant_id, id)
    ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_delivery_runs_tenant_status
  ON public.delivery_runs(tenant_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_delivery_runs_token_hash
  ON public.delivery_runs(driver_token_hash)
  WHERE driver_token_hash IS NOT NULL;

-- 5. Entregas Desacopladas dos Pedidos (order_deliveries)
CREATE TABLE IF NOT EXISTS public.order_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  order_id uuid NOT NULL,
  run_id uuid,
  driver_id uuid,
  stop_sequence integer NOT NULL DEFAULT 1 CHECK (stop_sequence >= 1),
  delivery_status varchar(30) NOT NULL DEFAULT 'pending_dispatch'
    CHECK (delivery_status IN (
      'pending_dispatch',
      'assigned',
      'picked_up',
      'in_transit',
      'arrived',
      'delivered',
      'failed_attempt',
      'returned_to_store',
      'cancelled'
    )),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  payment_to_collect_cents integer NOT NULL DEFAULT 0 CHECK (payment_to_collect_cents >= 0),
  payment_collected_confirmed boolean NOT NULL DEFAULT false,
  proof_recipient_name varchar(120),
  proof_relationship varchar(30)
    CHECK (proof_relationship IS NULL OR proof_relationship IN ('recipient', 'concierge', 'family', 'neighbor', 'other')),
  proof_photo_path text,
  proof_notes text,
  failure_reason text,
  sanitary_quarantine_required boolean NOT NULL DEFAULT false,
  assigned_at timestamptz,
  dispatched_at timestamptz,
  arrived_at timestamptz,
  delivered_at timestamptz,
  failed_at timestamptz,
  returned_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_order_deliveries_composite UNIQUE (tenant_id, id),
  CONSTRAINT uq_order_deliveries_order UNIQUE (tenant_id, order_id),
  CONSTRAINT fk_order_deliveries_order_cross_tenant_safe
    FOREIGN KEY (tenant_id, order_id)
    REFERENCES public.orders(tenant_id, id)
    ON DELETE CASCADE,
  CONSTRAINT fk_order_deliveries_run_cross_tenant_safe
    FOREIGN KEY (tenant_id, run_id)
    REFERENCES public.delivery_runs(tenant_id, id)
    ON DELETE SET NULL,
  CONSTRAINT fk_order_deliveries_driver_cross_tenant_safe
    FOREIGN KEY (tenant_id, driver_id)
    REFERENCES public.delivery_drivers(tenant_id, id)
    ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_order_deliveries_tenant_status
  ON public.order_deliveries(tenant_id, delivery_status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_order_deliveries_run
  ON public.order_deliveries(tenant_id, run_id, stop_sequence ASC);

-- 6. Trilha Imutável de Eventos Logísticos e Ocorrências (delivery_events)
CREATE TABLE IF NOT EXISTS public.delivery_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  delivery_id uuid NOT NULL,
  run_id uuid,
  order_id uuid NOT NULL,
  event_type varchar(40) NOT NULL
    CHECK (event_type IN (
      'assigned',
      'reassigned',
      'dispatched',
      'picked_up',
      'in_transit',
      'arrived',
      'delivered',
      'failed_attempt',
      'returned_to_store',
      'cancelled',
      'location_consent_granted',
      'location_consent_revoked',
      'occurrence_reported'
    )),
  from_status varchar(30),
  to_status varchar(30),
  source varchar(30) NOT NULL DEFAULT 'admin'
    CHECK (source IN ('admin', 'driver', 'system', 'delivery_provider')),
  actor_user_id uuid,
  driver_id uuid,
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_delivery_events_delivery_cross_tenant_safe
    FOREIGN KEY (tenant_id, delivery_id)
    REFERENCES public.order_deliveries(tenant_id, id)
    ON DELETE CASCADE,
  CONSTRAINT fk_delivery_events_order_cross_tenant_safe
    FOREIGN KEY (tenant_id, order_id)
    REFERENCES public.orders(tenant_id, id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_delivery_events_delivery
  ON public.delivery_events(tenant_id, delivery_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_delivery_events_order
  ON public.delivery_events(tenant_id, order_id, created_at ASC);

-- Trigger Anti-Tampering: Imutabilidade Estrita em delivery_events
CREATE OR REPLACE FUNCTION public.prevent_delivery_events_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'A tabela delivery_events é estritamente imutável. Atualizações ou exclusões são proibidas.';
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_delivery_events_mutation ON public.delivery_events;
CREATE TRIGGER trg_prevent_delivery_events_mutation
  BEFORE UPDATE OR DELETE ON public.delivery_events
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_delivery_events_mutation();

-- 7. Pings Efêmeros de Localização por Rota Ativa (Retenção Limitada LGPD)
CREATE TABLE IF NOT EXISTS public.delivery_location_pings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  run_id uuid NOT NULL,
  driver_id uuid,
  latitude numeric(9,6) NOT NULL,
  longitude numeric(9,6) NOT NULL,
  accuracy_meters integer CHECK (accuracy_meters IS NULL OR accuracy_meters >= 0),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  CONSTRAINT fk_delivery_pings_run_cross_tenant_safe
    FOREIGN KEY (tenant_id, run_id)
    REFERENCES public.delivery_runs(tenant_id, id)
    ON DELETE CASCADE,
  CONSTRAINT fk_delivery_pings_driver_cross_tenant_safe
    FOREIGN KEY (tenant_id, driver_id)
    REFERENCES public.delivery_drivers(tenant_id, id)
    ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_delivery_location_pings_run_recent
  ON public.delivery_location_pings(tenant_id, run_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_delivery_location_pings_expires
  ON public.delivery_location_pings(expires_at);

-- 8. Row Level Security (RLS Multi-Tenant Bidirecional Estrita — Zero Acesso Anônimo)
ALTER TABLE public.delivery_drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_delivery_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_location_pings ENABLE ROW LEVEL SECURITY;

-- 8.1 delivery_drivers
DROP POLICY IF EXISTS "Members view tenant drivers" ON public.delivery_drivers;
CREATE POLICY "Members view tenant drivers" ON public.delivery_drivers
  FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id));

DROP POLICY IF EXISTS "Managers manage tenant drivers" ON public.delivery_drivers;
CREATE POLICY "Managers manage tenant drivers" ON public.delivery_drivers
  FOR ALL TO authenticated
  USING (
    public.has_tenant_role(tenant_id, 'tenant_manager') OR
    public.has_tenant_role(tenant_id, 'tenant_admin')
  );

-- 8.2 tenant_delivery_counters
DROP POLICY IF EXISTS "Members view delivery counters" ON public.tenant_delivery_counters;
CREATE POLICY "Members view delivery counters" ON public.tenant_delivery_counters
  FOR ALL TO authenticated
  USING (public.is_tenant_member(tenant_id));

-- 8.3 delivery_runs
DROP POLICY IF EXISTS "Members view tenant delivery runs" ON public.delivery_runs;
CREATE POLICY "Members view tenant delivery runs" ON public.delivery_runs
  FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id));

DROP POLICY IF EXISTS "Managers manage tenant delivery runs" ON public.delivery_runs;
CREATE POLICY "Managers manage tenant delivery runs" ON public.delivery_runs
  FOR ALL TO authenticated
  USING (
    public.has_tenant_role(tenant_id, 'tenant_manager') OR
    public.has_tenant_role(tenant_id, 'tenant_admin')
  );

-- 8.4 order_deliveries
DROP POLICY IF EXISTS "Members view tenant order deliveries" ON public.order_deliveries;
CREATE POLICY "Members view tenant order deliveries" ON public.order_deliveries
  FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id));

DROP POLICY IF EXISTS "Managers manage tenant order deliveries" ON public.order_deliveries;
CREATE POLICY "Managers manage tenant order deliveries" ON public.order_deliveries
  FOR ALL TO authenticated
  USING (
    public.has_tenant_role(tenant_id, 'tenant_manager') OR
    public.has_tenant_role(tenant_id, 'tenant_admin')
  );

-- 8.5 delivery_events (append-only para autenticados do tenant)
DROP POLICY IF EXISTS "Members view tenant delivery events" ON public.delivery_events;
CREATE POLICY "Members view tenant delivery events" ON public.delivery_events
  FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id));

DROP POLICY IF EXISTS "Managers insert tenant delivery events" ON public.delivery_events;
CREATE POLICY "Managers insert tenant delivery events" ON public.delivery_events
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_tenant_role(tenant_id, 'tenant_manager') OR
    public.has_tenant_role(tenant_id, 'tenant_admin')
  );

-- 8.6 delivery_location_pings
DROP POLICY IF EXISTS "Members view tenant location pings" ON public.delivery_location_pings;
CREATE POLICY "Members view tenant location pings" ON public.delivery_location_pings
  FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id));

DROP POLICY IF EXISTS "Managers manage tenant location pings" ON public.delivery_location_pings;
CREATE POLICY "Managers manage tenant location pings" ON public.delivery_location_pings
  FOR ALL TO authenticated
  USING (
    public.has_tenant_role(tenant_id, 'tenant_manager') OR
    public.has_tenant_role(tenant_id, 'tenant_admin')
  );

-- ==============================================================================
-- 9. RPCs Atômicas de Expedição, Rastreamento e Comprovação
-- ==============================================================================

-- 9.1 Despacho de Romaneio / Agrupamento de Rotas (dispatch_delivery_run_atomic)
CREATE OR REPLACE FUNCTION public.dispatch_delivery_run_atomic(
  p_tenant_id uuid,
  p_driver_id uuid,
  p_order_ids uuid[],
  p_driver_token_hash varchar(128),
  p_token_expires_hours integer DEFAULT 12,
  p_route_strategy varchar(40) DEFAULT 'manual',
  p_notes text DEFAULT null,
  p_actor_user_id uuid DEFAULT null
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_driver record;
  v_order record;
  v_existing_delivery record;
  v_run_id uuid := gen_random_uuid();
  v_run_code text;
  v_order_id uuid;
  v_seq integer := 0;
  v_delivery_id uuid;
  v_now timestamptz := now();
  v_expires_at timestamptz := now() + make_interval(hours => GREATEST(1, COALESCE(p_token_expires_hours, 12)));
  v_collect_cents integer;
  v_dispatched_orders integer := 0;
  v_status_res jsonb;
BEGIN
  IF p_order_ids IS NULL OR array_length(p_order_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Selecione ao menos um pedido para montar o romaneio.');
  END IF;

  IF p_driver_token_hash IS NULL OR trim(p_driver_token_hash) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Token criptográfico de acesso do entregador é obrigatório.');
  END IF;

  -- Valida entregador pertencente ao tenant
  SELECT * INTO v_driver
  FROM public.delivery_drivers
  WHERE tenant_id = p_tenant_id AND id = p_driver_id AND is_active = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Entregador não encontrado ou inativo para este estabelecimento.');
  END IF;

  -- Gera código concorrente seguro da rota
  v_run_code := public.generate_next_delivery_run_code(p_tenant_id);

  -- Cria o romaneio já despachado
  INSERT INTO public.delivery_runs (
    id, tenant_id, run_code, driver_id, status,
    driver_token_hash, driver_token_expires_at,
    location_sharing_enabled, route_strategy, notes,
    dispatched_at, created_by_user_id
  ) VALUES (
    v_run_id, p_tenant_id, v_run_code, p_driver_id, 'dispatched',
    p_driver_token_hash, v_expires_at,
    false, COALESCE(p_route_strategy, 'manual'), p_notes,
    v_now, p_actor_user_id
  );

  -- Itera na ordem enviada pelo painel (sequência da rota)
  FOREACH v_order_id IN ARRAY p_order_ids
  LOOP
    v_seq := v_seq + 1;

    SELECT * INTO v_order
    FROM public.orders
    WHERE tenant_id = p_tenant_id AND id = v_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Pedido % não encontrado para este tenant.', v_order_id;
    END IF;

    IF v_order.fulfillment_type != 'delivery' THEN
      RAISE EXCEPTION 'Pedido % não é da modalidade delivery.', v_order.order_number;
    END IF;

    IF v_order.status NOT IN ('ready', 'out_for_delivery') THEN
      RAISE EXCEPTION 'Pedido % precisa estar Pronto ou em Rota para ser despachado (status atual: %).', v_order.order_number, v_order.status;
    END IF;

    -- Valor a cobrar na entrega caso o pagamento ainda não esteja liquidado
    IF v_order.payment_status != 'paid' AND v_order.payment_method IN ('cash', 'card_on_delivery', 'pos_card') THEN
      v_collect_cents := v_order.total_cents;
    ELSE
      v_collect_cents := 0;
    END IF;

    -- Upsert idempotente em order_deliveries (permite re-despacho caso tentativa anterior tenha falhado)
    SELECT * INTO v_existing_delivery
    FROM public.order_deliveries
    WHERE tenant_id = p_tenant_id AND order_id = v_order_id
    FOR UPDATE;

    IF FOUND THEN
      IF v_existing_delivery.delivery_status IN ('delivered', 'cancelled') THEN
        RAISE EXCEPTION 'Pedido % já possui entrega finalizada (%).', v_order.order_number, v_existing_delivery.delivery_status;
      END IF;

      v_delivery_id := v_existing_delivery.id;

      UPDATE public.order_deliveries
      SET run_id = v_run_id,
          driver_id = p_driver_id,
          stop_sequence = v_seq,
          delivery_status = 'assigned',
          payment_to_collect_cents = v_collect_cents,
          assigned_at = v_now,
          dispatched_at = v_now,
          updated_at = v_now
      WHERE id = v_delivery_id;

      INSERT INTO public.delivery_events (
        tenant_id, delivery_id, run_id, order_id,
        event_type, from_status, to_status, source,
        actor_user_id, driver_id, notes
      ) VALUES (
        p_tenant_id, v_delivery_id, v_run_id, v_order_id,
        'reassigned', v_existing_delivery.delivery_status, 'assigned', 'admin',
        p_actor_user_id, p_driver_id,
        format('Pedido reatribuído à rota %s (parada #%s)', v_run_code, v_seq)
      );
    ELSE
      v_delivery_id := gen_random_uuid();

      INSERT INTO public.order_deliveries (
        id, tenant_id, order_id, run_id, driver_id, stop_sequence,
        delivery_status, payment_to_collect_cents,
        assigned_at, dispatched_at
      ) VALUES (
        v_delivery_id, p_tenant_id, v_order_id, v_run_id, p_driver_id, v_seq,
        'assigned', v_collect_cents,
        v_now, v_now
      );

      INSERT INTO public.delivery_events (
        tenant_id, delivery_id, run_id, order_id,
        event_type, from_status, to_status, source,
        actor_user_id, driver_id, notes
      ) VALUES (
        p_tenant_id, v_delivery_id, v_run_id, v_order_id,
        'dispatched', 'pending_dispatch', 'assigned', 'admin',
        p_actor_user_id, p_driver_id,
        format('Despachado na rota %s com %s (parada #%s)', v_run_code, v_driver.name, v_seq)
      );
    END IF;

    -- Transiciona pedido para out_for_delivery se ainda estava 'ready'
    IF v_order.status = 'ready' THEN
      v_status_res := public.update_order_status_atomic(
        p_tenant_id,
        v_order_id,
        'out_for_delivery',
        'admin',
        p_actor_user_id,
        jsonb_build_object('run_id', v_run_id, 'run_code', v_run_code, 'driver_id', p_driver_id, 'driver_name', v_driver.name)
      );

      IF (v_status_res->>'success')::boolean IS NOT TRUE THEN
        RAISE EXCEPTION 'Falha ao transicionar pedido % para Saiu para Entrega: %', v_order.order_number, v_status_res->>'error';
      END IF;
    END IF;

    -- Garante baixa física FEFO idempotente no estoque (Etapa 3D)
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'commit_order_inventory_deduction_atomic') THEN
      PERFORM public.commit_order_inventory_deduction_atomic(p_tenant_id, v_order_id, p_actor_user_id);
    END IF;

    v_dispatched_orders := v_dispatched_orders + 1;
  END LOOP;

  -- Atualiza status de disponibilidade do motoboy
  UPDATE public.delivery_drivers
  SET availability_status = 'on_route',
      updated_at = v_now
  WHERE id = p_driver_id AND tenant_id = p_tenant_id;

  -- Auditoria administrativa
  INSERT INTO public.audit_logs (
    tenant_id, actor_id, action, resource_type, resource_id,
    payload_after
  ) VALUES (
    p_tenant_id, p_actor_user_id, 'delivery_run_dispatched', 'delivery_runs', v_run_id::text,
    jsonb_build_object('run_code', v_run_code, 'driver_id', p_driver_id, 'order_count', v_dispatched_orders)
  );

  RETURN jsonb_build_object(
    'success', true,
    'run_id', v_run_id,
    'run_code', v_run_code,
    'driver_id', p_driver_id,
    'driver_name', v_driver.name,
    'orders_count', v_dispatched_orders,
    'expires_at', v_expires_at
  );
END;
$$;

-- 9.2 Atualização de Etapa da Entrega pelo Entregador ou Admin (update_delivery_step_atomic)
CREATE OR REPLACE FUNCTION public.update_delivery_step_atomic(
  p_tenant_id uuid,
  p_delivery_id uuid,
  p_to_status varchar(30), -- 'picked_up' | 'in_transit' | 'arrived'
  p_source varchar(30) DEFAULT 'driver',
  p_actor_user_id uuid DEFAULT null,
  p_notes text DEFAULT null
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_delivery record;
  v_now timestamptz := now();
  v_valid boolean := false;
BEGIN
  SELECT * INTO v_delivery
  FROM public.order_deliveries
  WHERE tenant_id = p_tenant_id AND id = p_delivery_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Registro de entrega não encontrado.');
  END IF;

  IF v_delivery.delivery_status = p_to_status THEN
    RETURN jsonb_build_object('success', true, 'idempotent', true, 'delivery_id', p_delivery_id, 'status', p_to_status);
  END IF;

  -- Validação de transições logísticas intermediárias
  IF v_delivery.delivery_status = 'assigned' AND p_to_status IN ('picked_up', 'in_transit', 'arrived') THEN
    v_valid := true;
  ELSIF v_delivery.delivery_status = 'picked_up' AND p_to_status IN ('in_transit', 'arrived') THEN
    v_valid := true;
  ELSIF v_delivery.delivery_status = 'in_transit' AND p_to_status = 'arrived' THEN
    v_valid := true;
  END IF;

  IF NOT v_valid THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Transição logística inválida de "%s" para "%s".', v_delivery.delivery_status, p_to_status)
    );
  END IF;

  UPDATE public.order_deliveries
  SET delivery_status = p_to_status,
      arrived_at = CASE WHEN p_to_status = 'arrived' THEN v_now ELSE arrived_at END,
      updated_at = v_now
  WHERE id = p_delivery_id;

  -- Coloca o romaneio em andamento se ainda estava 'dispatched'
  IF v_delivery.run_id IS NOT NULL THEN
    UPDATE public.delivery_runs
    SET status = 'in_progress',
        updated_at = v_now
    WHERE id = v_delivery.run_id AND tenant_id = p_tenant_id AND status = 'dispatched';
  END IF;

  INSERT INTO public.delivery_events (
    tenant_id, delivery_id, run_id, order_id,
    event_type, from_status, to_status, source,
    actor_user_id, driver_id, notes
  ) VALUES (
    p_tenant_id, p_delivery_id, v_delivery.run_id, v_delivery.order_id,
    p_to_status, v_delivery.delivery_status, p_to_status, p_source,
    p_actor_user_id, v_delivery.driver_id, p_notes
  );

  RETURN jsonb_build_object(
    'success', true,
    'idempotent', false,
    'delivery_id', p_delivery_id,
    'from_status', v_delivery.delivery_status,
    'to_status', p_to_status
  );
END;
$$;

-- 9.3 Confirmação e Comprovante de Entrega (confirm_delivery_proof_atomic)
-- Encerra automaticamente o romaneio e o compartilhamento de GPS quando todas as paradas encerram.
CREATE OR REPLACE FUNCTION public.confirm_delivery_proof_atomic(
  p_tenant_id uuid,
  p_delivery_id uuid,
  p_recipient_name varchar(120),
  p_relationship varchar(30) DEFAULT 'recipient',
  p_payment_collected boolean DEFAULT false,
  p_photo_path text DEFAULT null,
  p_notes text DEFAULT null,
  p_source varchar(30) DEFAULT 'driver',
  p_actor_user_id uuid DEFAULT null
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_delivery record;
  v_now timestamptz := now();
  v_remaining_open integer := 0;
  v_run_completed boolean := false;
  v_status_res jsonb;
BEGIN
  IF p_recipient_name IS NULL OR trim(p_recipient_name) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Informe o nome de quem recebeu o pedido para registrar o comprovante.');
  END IF;

  SELECT * INTO v_delivery
  FROM public.order_deliveries
  WHERE tenant_id = p_tenant_id AND id = p_delivery_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Entrega não localizada.');
  END IF;

  IF v_delivery.delivery_status = 'delivered' THEN
    RETURN jsonb_build_object('success', true, 'idempotent', true, 'delivery_id', p_delivery_id);
  END IF;

  IF v_delivery.delivery_status IN ('cancelled', 'returned_to_store') THEN
    RETURN jsonb_build_object('success', false, 'error', format('Entrega encerrada (%s) não pode ser marcada como entregue.', v_delivery.delivery_status));
  END IF;

  UPDATE public.order_deliveries
  SET delivery_status = 'delivered',
      proof_recipient_name = trim(p_recipient_name),
      proof_relationship = COALESCE(p_relationship, 'recipient'),
      payment_collected_confirmed = COALESCE(p_payment_collected, false),
      proof_photo_path = p_photo_path,
      proof_notes = p_notes,
      delivered_at = v_now,
      updated_at = v_now
  WHERE id = p_delivery_id;

  INSERT INTO public.delivery_events (
    tenant_id, delivery_id, run_id, order_id,
    event_type, from_status, to_status, source,
    actor_user_id, driver_id, notes, metadata
  ) VALUES (
    p_tenant_id, p_delivery_id, v_delivery.run_id, v_delivery.order_id,
    'delivered', v_delivery.delivery_status, 'delivered', p_source,
    p_actor_user_id, v_delivery.driver_id,
    format('Entregue para %s (%s)', trim(p_recipient_name), COALESCE(p_relationship, 'recipient')),
    jsonb_build_object('payment_collected', COALESCE(p_payment_collected, false))
  );

  -- Sincroniza status comercial do pedido para 'delivered'
  v_status_res := public.update_order_status_atomic(
    p_tenant_id,
    v_delivery.order_id,
    'delivered',
    p_source,
    p_actor_user_id,
    jsonb_build_object('proof_recipient_name', trim(p_recipient_name), 'delivery_id', p_delivery_id)
  );

  -- Verifica se o romaneio já concluiu todas as paradas
  IF v_delivery.run_id IS NOT NULL THEN
    SELECT count(*) INTO v_remaining_open
    FROM public.order_deliveries
    WHERE tenant_id = p_tenant_id
      AND run_id = v_delivery.run_id
      AND delivery_status NOT IN ('delivered', 'returned_to_store', 'cancelled', 'failed_attempt');

    IF v_remaining_open = 0 THEN
      v_run_completed := true;

      UPDATE public.delivery_runs
      SET status = 'completed',
          location_sharing_enabled = false,
          location_ended_at = COALESCE(location_ended_at, v_now),
          completed_at = v_now,
          driver_token_expires_at = LEAST(COALESCE(driver_token_expires_at, v_now), v_now),
          updated_at = v_now
      WHERE id = v_delivery.run_id AND tenant_id = p_tenant_id;

      IF v_delivery.driver_id IS NOT NULL THEN
        UPDATE public.delivery_drivers
        SET availability_status = 'available',
            updated_at = v_now
        WHERE id = v_delivery.driver_id AND tenant_id = p_tenant_id;
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'idempotent', false,
    'delivery_id', p_delivery_id,
    'order_id', v_delivery.order_id,
    'run_completed', v_run_completed,
    'order_status_sync', v_status_res
  );
END;
$$;

-- 9.4 Registro de Tentativa Frustrada ou Retorno ao Estabelecimento (record_delivery_failure_atomic)
-- Integra sinalização sanitária para alimentos congelados caso retornem à loja.
CREATE OR REPLACE FUNCTION public.record_delivery_failure_atomic(
  p_tenant_id uuid,
  p_delivery_id uuid,
  p_failure_reason text,
  p_action varchar(30) DEFAULT 'failed_attempt', -- 'failed_attempt' | 'returned_to_store'
  p_source varchar(30) DEFAULT 'driver',
  p_actor_user_id uuid DEFAULT null
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_delivery record;
  v_now timestamptz := now();
  v_remaining_open integer := 0;
  v_run_completed boolean := false;
  v_sanitary_flag boolean := false;
BEGIN
  IF p_failure_reason IS NULL OR trim(p_failure_reason) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Informe o motivo da tentativa frustrada ou ocorrência.');
  END IF;

  IF p_action NOT IN ('failed_attempt', 'returned_to_store') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ação inválida. Utilize "failed_attempt" ou "returned_to_store".');
  END IF;

  SELECT * INTO v_delivery
  FROM public.order_deliveries
  WHERE tenant_id = p_tenant_id AND id = p_delivery_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Entrega não localizada.');
  END IF;

  IF v_delivery.delivery_status IN ('delivered', 'cancelled') THEN
    RETURN jsonb_build_object('success', false, 'error', format('Entrega em status final "%s" não aceita ocorrência.', v_delivery.delivery_status));
  END IF;

  v_sanitary_flag := (p_action = 'returned_to_store');

  UPDATE public.order_deliveries
  SET delivery_status = p_action,
      attempt_count = attempt_count + 1,
      failure_reason = trim(p_failure_reason),
      failed_at = v_now,
      returned_at = CASE WHEN p_action = 'returned_to_store' THEN v_now ELSE returned_at END,
      sanitary_quarantine_required = CASE WHEN v_sanitary_flag THEN true ELSE sanitary_quarantine_required END,
      updated_at = v_now
  WHERE id = p_delivery_id;

  INSERT INTO public.delivery_events (
    tenant_id, delivery_id, run_id, order_id,
    event_type, from_status, to_status, source,
    actor_user_id, driver_id, notes, metadata
  ) VALUES (
    p_tenant_id, p_delivery_id, v_delivery.run_id, v_delivery.order_id,
    p_action, v_delivery.delivery_status, p_action, p_source,
    p_actor_user_id, v_delivery.driver_id,
    trim(p_failure_reason),
    jsonb_build_object('attempt_count', v_delivery.attempt_count + 1, 'sanitary_quarantine_required', v_sanitary_flag)
  );

  -- Verifica se o romaneio não tem mais entregas ativas pendentes
  IF v_delivery.run_id IS NOT NULL THEN
    SELECT count(*) INTO v_remaining_open
    FROM public.order_deliveries
    WHERE tenant_id = p_tenant_id
      AND run_id = v_delivery.run_id
      AND delivery_status NOT IN ('delivered', 'returned_to_store', 'cancelled', 'failed_attempt');

    IF v_remaining_open = 0 THEN
      v_run_completed := true;

      UPDATE public.delivery_runs
      SET status = 'completed',
          location_sharing_enabled = false,
          location_ended_at = COALESCE(location_ended_at, v_now),
          completed_at = v_now,
          driver_token_expires_at = LEAST(COALESCE(driver_token_expires_at, v_now), v_now),
          updated_at = v_now
      WHERE id = v_delivery.run_id AND tenant_id = p_tenant_id;

      IF v_delivery.driver_id IS NOT NULL THEN
        UPDATE public.delivery_drivers
        SET availability_status = 'available',
            updated_at = v_now
        WHERE id = v_delivery.driver_id AND tenant_id = p_tenant_id;
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'delivery_id', p_delivery_id,
    'new_status', p_action,
    'attempt_count', v_delivery.attempt_count + 1,
    'sanitary_quarantine_required', v_sanitary_flag,
    'run_completed', v_run_completed
  );
END;
$$;

-- 9.5 Controle de Consentimento de Compartilhamento de Localização (toggle_run_location_sharing_atomic)
CREATE OR REPLACE FUNCTION public.toggle_run_location_sharing_atomic(
  p_tenant_id uuid,
  p_run_id uuid,
  p_enabled boolean,
  p_source varchar(30) DEFAULT 'driver'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_run record;
  v_first_delivery record;
  v_now timestamptz := now();
BEGIN
  SELECT * INTO v_run
  FROM public.delivery_runs
  WHERE tenant_id = p_tenant_id AND id = p_run_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Rota não encontrada.');
  END IF;

  IF p_enabled = true AND v_run.status NOT IN ('dispatched', 'in_progress') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Não é possível ativar compartilhamento de localização em uma rota encerrada.');
  END IF;

  UPDATE public.delivery_runs
  SET location_sharing_enabled = p_enabled,
      location_consent_at = CASE WHEN p_enabled = true THEN v_now ELSE location_consent_at END,
      location_ended_at = CASE WHEN p_enabled = false THEN v_now ELSE null END,
      updated_at = v_now
  WHERE id = p_run_id;

  SELECT * INTO v_first_delivery
  FROM public.order_deliveries
  WHERE tenant_id = p_tenant_id AND run_id = p_run_id
  ORDER BY stop_sequence ASC
  LIMIT 1;

  IF FOUND THEN
    INSERT INTO public.delivery_events (
      tenant_id, delivery_id, run_id, order_id,
      event_type, source, driver_id, notes
    ) VALUES (
      p_tenant_id, v_first_delivery.id, p_run_id, v_first_delivery.order_id,
      CASE WHEN p_enabled THEN 'location_consent_granted' ELSE 'location_consent_revoked' END,
      p_source, v_run.driver_id,
      CASE WHEN p_enabled THEN 'Entregador autorizou compartilhamento temporário de localização durante a rota.'
           ELSE 'Compartilhamento de localização encerrado.' END
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'run_id', p_run_id,
    'location_sharing_enabled', p_enabled
  );
END;
$$;

-- 9.6 Gravação de Ping Efêmero de Localização (record_driver_location_ping_atomic)
CREATE OR REPLACE FUNCTION public.record_driver_location_ping_atomic(
  p_tenant_id uuid,
  p_run_id uuid,
  p_latitude numeric(9,6),
  p_longitude numeric(9,6),
  p_accuracy_meters integer DEFAULT null
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_run record;
  v_ping_id uuid := gen_random_uuid();
BEGIN
  SELECT * INTO v_run
  FROM public.delivery_runs
  WHERE tenant_id = p_tenant_id AND id = p_run_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Rota não encontrada.');
  END IF;

  IF v_run.status NOT IN ('dispatched', 'in_progress') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Rota já encerrada; envio de localização bloqueado.');
  END IF;

  IF v_run.location_sharing_enabled IS NOT TRUE THEN
    RETURN jsonb_build_object('success', false, 'error', 'Compartilhamento de localização não autorizado pelo entregador.');
  END IF;

  INSERT INTO public.delivery_location_pings (
    id, tenant_id, run_id, driver_id,
    latitude, longitude, accuracy_meters,
    recorded_at, expires_at
  ) VALUES (
    v_ping_id, p_tenant_id, p_run_id, v_run.driver_id,
    p_latitude, p_longitude, p_accuracy_meters,
    now(), now() + interval '7 days'
  );

  RETURN jsonb_build_object(
    'success', true,
    'ping_id', v_ping_id
  );
END;
$$;

-- 9.7 Expurgo de Pings Expirados (LGPD)
CREATE OR REPLACE FUNCTION public.purge_expired_delivery_locations()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_deleted integer := 0;
BEGIN
  DELETE FROM public.delivery_location_pings
  WHERE expires_at < now();

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

