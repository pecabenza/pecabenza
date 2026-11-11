-- ==============================================================================
-- Migration 00011: Operations Engine, KDS Item Preparation & SLA Configuration
-- ==============================================================================

-- 1. Extensão de Configuração de SLA Operacional por Tenant
ALTER TABLE public.tenant_commerce_settings
  ADD COLUMN IF NOT EXISTS target_confirmation_time_min integer NOT NULL DEFAULT 5 CHECK (target_confirmation_time_min > 0),
  ADD COLUMN IF NOT EXISTS target_preparation_time_min integer NOT NULL DEFAULT 25 CHECK (target_preparation_time_min > 0),
  ADD COLUMN IF NOT EXISTS sla_warning_buffer_min integer NOT NULL DEFAULT 5 CHECK (sla_warning_buffer_min >= 0),
  ADD COLUMN IF NOT EXISTS schedule_preparation_buffer_min integer NOT NULL DEFAULT 5 CHECK (schedule_preparation_buffer_min >= 0);

-- 2. Tabela de Estado Operacional de Preparo por Item (order_item_operations)
-- Preserva order_items (snapshot comercial) intacto.
CREATE TABLE IF NOT EXISTS public.order_item_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  order_id uuid NOT NULL,
  order_item_id uuid NOT NULL,
  preparation_status varchar(20) NOT NULL DEFAULT 'pending'
    CHECK (preparation_status IN ('pending', 'preparing', 'ready')),
  started_at timestamptz,
  completed_at timestamptz,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_order_item_operations_composite UNIQUE (tenant_id, id),
  CONSTRAINT uq_order_item_operations_per_item UNIQUE (tenant_id, order_item_id),
  CONSTRAINT fk_order_item_ops_order_cross_tenant_safe
    FOREIGN KEY (tenant_id, order_id)
    REFERENCES public.orders(tenant_id, id)
    ON DELETE CASCADE,
  CONSTRAINT fk_order_item_ops_item_cross_tenant_safe
    FOREIGN KEY (tenant_id, order_item_id)
    REFERENCES public.order_items(tenant_id, id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_order_item_ops_order
  ON public.order_item_operations(tenant_id, order_id);

CREATE INDEX IF NOT EXISTS idx_order_item_ops_status
  ON public.order_item_operations(tenant_id, preparation_status);

CREATE INDEX IF NOT EXISTS idx_order_item_ops_completed
  ON public.order_item_operations(tenant_id, completed_at DESC)
  WHERE completed_at IS NOT NULL;

-- 3. Tabela Imutável de Eventos Operacionais de Cozinha (order_operation_events)
CREATE TABLE IF NOT EXISTS public.order_operation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  order_id uuid NOT NULL,
  order_item_id uuid,
  event_type varchar(40) NOT NULL CHECK (
    event_type IN (
      'item_started',
      'item_ready',
      'order_started',
      'order_ready',
      'priority_changed',
      'sla_warning',
      'sla_breached'
    )
  ),
  actor_user_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_order_op_events_order_cross_tenant_safe
    FOREIGN KEY (tenant_id, order_id)
    REFERENCES public.orders(tenant_id, id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_order_op_events_order
  ON public.order_operation_events(tenant_id, order_id, created_at ASC);

-- 4. Trigger Anti-Tampering em order_operation_events
CREATE OR REPLACE FUNCTION public.prevent_order_operation_events_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'A tabela order_operation_events é estritamente imutável. Atualizações ou exclusões não são permitidas.';
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_order_operation_events_mutation ON public.order_operation_events;
CREATE TRIGGER trg_prevent_order_operation_events_mutation
  BEFORE UPDATE OR DELETE ON public.order_operation_events
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_order_operation_events_mutation();

-- 5. RPC Atômica: Iniciar Preparo do Pedido e seus Itens (start_order_preparation_atomic)
CREATE OR REPLACE FUNCTION public.start_order_preparation_atomic(
  p_tenant_id uuid,
  p_order_id uuid,
  p_actor_user_id uuid DEFAULT null
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order record;
  v_now timestamptz := timezone('utc'::text, now());
  v_was_already_preparing boolean := false;
  v_items_started integer := 0;
BEGIN
  -- 1. Lock pessimista no pedido
  SELECT id, status INTO v_order
  FROM public.orders
  WHERE tenant_id = p_tenant_id AND id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Pedido não encontrado para o tenant informado.'
    );
  END IF;

  IF v_order.status = 'preparing' THEN
    v_was_already_preparing := true;
  ELSIF v_order.status != 'confirmed' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Não é possível iniciar preparo a partir do status "%s". O pedido deve estar confirmado.', v_order.status)
    );
  END IF;

  -- 2. Se estava 'confirmed', avança para 'preparing' e registra evento comercial
  IF NOT v_was_already_preparing THEN
    UPDATE public.orders
    SET status = 'preparing',
        updated_at = v_now
    WHERE tenant_id = p_tenant_id AND id = p_order_id;

    INSERT INTO public.order_status_events (
      tenant_id, order_id, from_status, to_status, source, actor_user_id, metadata
    ) VALUES (
      p_tenant_id, p_order_id, v_order.status, 'preparing', 'admin', p_actor_user_id,
      jsonb_build_object('trigger', 'kds_start_preparation')
    );

    INSERT INTO public.order_operation_events (
      tenant_id, order_id, event_type, actor_user_id, metadata
    ) VALUES (
      p_tenant_id, p_order_id, 'order_started', p_actor_user_id,
      jsonb_build_object('started_at', v_now)
    );
  END IF;

  -- 3. Inicializa/atualiza todos os itens pendentes do pedido para 'preparing'
  INSERT INTO public.order_item_operations (
    tenant_id, order_id, order_item_id, preparation_status, started_at, updated_by, created_at, updated_at
  )
  SELECT
    p_tenant_id,
    p_order_id,
    oi.id,
    'preparing',
    v_now,
    p_actor_user_id,
    v_now,
    v_now
  FROM public.order_items oi
  WHERE oi.tenant_id = p_tenant_id AND oi.order_id = p_order_id
  ON CONFLICT (tenant_id, order_item_id)
  DO UPDATE SET
    preparation_status = CASE
      WHEN public.order_item_operations.preparation_status = 'pending' THEN 'preparing'
      ELSE public.order_item_operations.preparation_status
    END,
    started_at = COALESCE(public.order_item_operations.started_at, v_now),
    updated_by = COALESCE(p_actor_user_id, public.order_item_operations.updated_by),
    updated_at = v_now;

  GET DIAGNOSTICS v_items_started = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'idempotent', v_was_already_preparing,
    'order_id', p_order_id,
    'status', 'preparing',
    'started_at', v_now,
    'items_affected', v_items_started
  );
END;
$$;

-- 6. RPC Atômica: Atualizar Estado Operacional de um Item (update_order_item_operation_atomic)
CREATE OR REPLACE FUNCTION public.update_order_item_operation_atomic(
  p_tenant_id uuid,
  p_order_id uuid,
  p_order_item_id uuid,
  p_to_status varchar,
  p_actor_user_id uuid DEFAULT null
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order record;
  v_item record;
  v_existing_op record;
  v_now timestamptz := timezone('utc'::text, now());
  v_total_items integer := 0;
  v_ready_items integer := 0;
  v_all_ready boolean := false;
BEGIN
  IF p_to_status NOT IN ('pending', 'preparing', 'ready') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Status operacional de item inválido: "%s".', p_to_status)
    );
  END IF;

  -- 1. Verifica e trava o pedido
  SELECT id, status INTO v_order
  FROM public.orders
  WHERE tenant_id = p_tenant_id AND id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Pedido não encontrado para o tenant informado.'
    );
  END IF;

  IF v_order.status IN ('delivered', 'cancelled') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Não é permitido alterar itens de pedido finalizado ("%s").', v_order.status)
    );
  END IF;

  -- 2. Verifica se o item pertence ao pedido e ao tenant
  SELECT id, snapshot_product_name INTO v_item
  FROM public.order_items
  WHERE tenant_id = p_tenant_id AND order_id = p_order_id AND id = p_order_item_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Item não encontrado para este pedido.'
    );
  END IF;

  -- 3. Verifica operação atual do item para idempotência
  SELECT id, preparation_status, started_at, completed_at INTO v_existing_op
  FROM public.order_item_operations
  WHERE tenant_id = p_tenant_id AND order_item_id = p_order_item_id
  FOR UPDATE;

  IF FOUND AND v_existing_op.preparation_status = p_to_status THEN
    SELECT count(*) INTO v_total_items
    FROM public.order_items
    WHERE tenant_id = p_tenant_id AND order_id = p_order_id;

    SELECT count(*) INTO v_ready_items
    FROM public.order_item_operations
    WHERE tenant_id = p_tenant_id AND order_id = p_order_id AND preparation_status = 'ready';

    v_all_ready := (v_total_items > 0 AND v_ready_items = v_total_items);

    RETURN jsonb_build_object(
      'success', true,
      'idempotent', true,
      'order_id', p_order_id,
      'order_item_id', p_order_item_id,
      'preparation_status', p_to_status,
      'ready_items', v_ready_items,
      'total_items', v_total_items,
      'all_items_ready', v_all_ready
    );
  END IF;

  -- 4. Upsert na operação do item
  INSERT INTO public.order_item_operations (
    tenant_id,
    order_id,
    order_item_id,
    preparation_status,
    started_at,
    completed_at,
    updated_by,
    created_at,
    updated_at
  ) VALUES (
    p_tenant_id,
    p_order_id,
    p_order_item_id,
    p_to_status,
    CASE WHEN p_to_status IN ('preparing', 'ready') THEN v_now ELSE null END,
    CASE WHEN p_to_status = 'ready' THEN v_now ELSE null END,
    p_actor_user_id,
    v_now,
    v_now
  )
  ON CONFLICT (tenant_id, order_item_id)
  DO UPDATE SET
    preparation_status = p_to_status,
    started_at = CASE
      WHEN p_to_status IN ('preparing', 'ready') THEN COALESCE(public.order_item_operations.started_at, v_now)
      ELSE public.order_item_operations.started_at
    END,
    completed_at = CASE
      WHEN p_to_status = 'ready' THEN v_now
      ELSE null
    END,
    updated_by = p_actor_user_id,
    updated_at = v_now;

  -- 5. Registra evento operacional granular
  IF p_to_status = 'preparing' THEN
    INSERT INTO public.order_operation_events (
      tenant_id, order_id, order_item_id, event_type, actor_user_id, metadata
    ) VALUES (
      p_tenant_id, p_order_id, p_order_item_id, 'item_started', p_actor_user_id,
      jsonb_build_object('product_name', v_item.snapshot_product_name)
    );
  ELSIF p_to_status = 'ready' THEN
    INSERT INTO public.order_operation_events (
      tenant_id, order_id, order_item_id, event_type, actor_user_id, metadata
    ) VALUES (
      p_tenant_id, p_order_id, p_order_item_id, 'item_ready', p_actor_user_id,
      jsonb_build_object('product_name', v_item.snapshot_product_name)
    );
  END IF;

  -- 6. Contabiliza progresso do pedido (SEM mudar order.status automaticamente para ready)
  SELECT count(*) INTO v_total_items
  FROM public.order_items
  WHERE tenant_id = p_tenant_id AND order_id = p_order_id;

  SELECT count(*) INTO v_ready_items
  FROM public.order_item_operations
  WHERE tenant_id = p_tenant_id AND order_id = p_order_id AND preparation_status = 'ready';

  v_all_ready := (v_total_items > 0 AND v_ready_items = v_total_items);

  RETURN jsonb_build_object(
    'success', true,
    'idempotent', false,
    'order_id', p_order_id,
    'order_item_id', p_order_item_id,
    'preparation_status', p_to_status,
    'ready_items', v_ready_items,
    'total_items', v_total_items,
    'all_items_ready', v_all_ready
  );
END;
$$;

-- 7. RPC Atômica: Concluir Preparo do Pedido (complete_order_preparation_atomic)
-- Valida que todos os itens estão prontos antes de avançar preparing -> ready.
CREATE OR REPLACE FUNCTION public.complete_order_preparation_atomic(
  p_tenant_id uuid,
  p_order_id uuid,
  p_actor_user_id uuid DEFAULT null
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order record;
  v_total_items integer := 0;
  v_ready_items integer := 0;
  v_now timestamptz := timezone('utc'::text, now());
BEGIN
  SELECT id, status INTO v_order
  FROM public.orders
  WHERE tenant_id = p_tenant_id AND id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Pedido não encontrado para o tenant informado.'
    );
  END IF;

  IF v_order.status = 'ready' THEN
    RETURN jsonb_build_object(
      'success', true,
      'idempotent', true,
      'order_id', p_order_id,
      'status', 'ready'
    );
  END IF;

  IF v_order.status != 'preparing' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('O pedido deve estar em preparo ("preparing") para ser concluído. Status atual: "%s".', v_order.status)
    );
  END IF;

  -- Verifica se todos os itens necessários estão prontos
  SELECT count(*) INTO v_total_items
  FROM public.order_items
  WHERE tenant_id = p_tenant_id AND order_id = p_order_id;

  SELECT count(*) INTO v_ready_items
  FROM public.order_item_operations
  WHERE tenant_id = p_tenant_id AND order_id = p_order_id AND preparation_status = 'ready';

  IF v_total_items > 0 AND v_ready_items < v_total_items THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Ainda existem itens pendentes (%s de %s prontos). Conclua todos os itens antes de finalizar o preparo.', v_ready_items, v_total_items),
      'ready_items', v_ready_items,
      'total_items', v_total_items
    );
  END IF;

  -- Avança o pedido para 'ready'
  UPDATE public.orders
  SET status = 'ready',
      updated_at = v_now
  WHERE tenant_id = p_tenant_id AND id = p_order_id;

  INSERT INTO public.order_status_events (
    tenant_id, order_id, from_status, to_status, source, actor_user_id, metadata
  ) VALUES (
    p_tenant_id, p_order_id, 'preparing', 'ready', 'admin', p_actor_user_id,
    jsonb_build_object('trigger', 'kds_complete_preparation', 'ready_items', v_ready_items)
  );

  INSERT INTO public.order_operation_events (
    tenant_id, order_id, event_type, actor_user_id, metadata
  ) VALUES (
    p_tenant_id, p_order_id, 'order_ready', p_actor_user_id,
    jsonb_build_object('completed_at', v_now, 'total_items', v_total_items)
  );

  RETURN jsonb_build_object(
    'success', true,
    'idempotent', false,
    'order_id', p_order_id,
    'from_status', 'preparing',
    'to_status', 'ready',
    'completed_at', v_now
  );
END;
$$;

-- 8. Row Level Security (RLS)
ALTER TABLE public.order_item_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_operation_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_order_item_operations ON public.order_item_operations;
CREATE POLICY tenant_isolation_order_item_operations ON public.order_item_operations
  FOR ALL
  USING (
    public.is_tenant_member(tenant_id)
    OR tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
    OR current_setting('role', true) = 'service_role'
  )
  WITH CHECK (
    public.is_tenant_member(tenant_id)
    OR tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
    OR current_setting('role', true) = 'service_role'
  );

DROP POLICY IF EXISTS tenant_isolation_order_operation_events ON public.order_operation_events;
CREATE POLICY tenant_isolation_order_operation_events ON public.order_operation_events
  FOR ALL
  USING (
    public.is_tenant_member(tenant_id)
    OR tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
    OR current_setting('role', true) = 'service_role'
  )
  WITH CHECK (
    public.is_tenant_member(tenant_id)
    OR tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
    OR current_setting('role', true) = 'service_role'
  );

