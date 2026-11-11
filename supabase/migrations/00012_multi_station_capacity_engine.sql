-- ==============================================================================
-- Migration 00012: Multi-Station Operations Engine, Sequential Steps & Capacity
-- ==============================================================================

-- 1. Tabela de Estações de Produção por Tenant (production_stations)
CREATE TABLE IF NOT EXISTS public.production_stations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name varchar(120) NOT NULL,
  slug varchar(80) NOT NULL,
  description text,
  display_order integer NOT NULL DEFAULT 0,
  station_type varchar(30) NOT NULL DEFAULT 'kitchen'
    CHECK (station_type IN (
      'kitchen',
      'grill',
      'oven',
      'assembly',
      'drinks',
      'dessert',
      'expedition',
      'custom'
    )),
  is_active boolean NOT NULL DEFAULT true,
  default_capacity integer NOT NULL DEFAULT 4 CHECK (default_capacity >= 1),
  default_duration_seconds integer NOT NULL DEFAULT 600 CHECK (default_duration_seconds >= 10),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_production_stations_composite UNIQUE (tenant_id, id),
  CONSTRAINT uq_production_stations_slug UNIQUE (tenant_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_production_stations_tenant_order
  ON public.production_stations(tenant_id, is_active, display_order ASC);

-- 2. Tabela de Fluxo de Produção Configurável por Produto / Variante (product_production_steps)
CREATE TABLE IF NOT EXISTS public.product_production_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_id uuid NOT NULL,
  variant_id uuid,
  station_id uuid NOT NULL,
  step_order integer NOT NULL CHECK (step_order >= 1),
  estimated_duration_seconds integer NOT NULL DEFAULT 300 CHECK (estimated_duration_seconds >= 5),
  capacity_weight integer NOT NULL DEFAULT 1 CHECK (capacity_weight >= 1),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_product_production_steps_composite UNIQUE (tenant_id, id),
  CONSTRAINT fk_prod_steps_product_cross_tenant_safe
    FOREIGN KEY (tenant_id, product_id)
    REFERENCES public.products(tenant_id, id)
    ON DELETE CASCADE,
  CONSTRAINT fk_prod_steps_variant_cross_tenant_safe
    FOREIGN KEY (tenant_id, variant_id)
    REFERENCES public.product_variants(tenant_id, id)
    ON DELETE CASCADE,
  CONSTRAINT fk_prod_steps_station_cross_tenant_safe
    FOREIGN KEY (tenant_id, station_id)
    REFERENCES public.production_stations(tenant_id, id)
    ON DELETE CASCADE
);

-- Índices únicos parciais garantindo step_order único por produto (sem variante) e por variante
CREATE UNIQUE INDEX IF NOT EXISTS uq_product_steps_product_level_order
  ON public.product_production_steps(tenant_id, product_id, step_order)
  WHERE variant_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_product_steps_variant_level_order
  ON public.product_production_steps(tenant_id, product_id, variant_id, step_order)
  WHERE variant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_product_production_steps_lookup
  ON public.product_production_steps(tenant_id, product_id, variant_id, is_active, step_order ASC);

-- 3. Tabela de Estado Operacional de Etapas por Item do Pedido (order_item_production_steps)
-- Preserva snapshot histórico das estações/etapas no momento do pedido.
CREATE TABLE IF NOT EXISTS public.order_item_production_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  order_id uuid NOT NULL,
  order_item_id uuid NOT NULL,
  station_id uuid,
  snapshot_station_name varchar(120) NOT NULL DEFAULT 'Cozinha Geral',
  snapshot_station_slug varchar(80) NOT NULL DEFAULT 'cozinha-geral',
  snapshot_station_type varchar(30) NOT NULL DEFAULT 'kitchen',
  step_order integer NOT NULL CHECK (step_order >= 1),
  status varchar(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('blocked', 'pending', 'preparing', 'ready', 'skipped', 'cancelled')),
  estimated_duration_seconds integer NOT NULL DEFAULT 600 CHECK (estimated_duration_seconds >= 5),
  capacity_weight integer NOT NULL DEFAULT 1 CHECK (capacity_weight >= 1),
  started_at timestamptz,
  completed_at timestamptz,
  assigned_user_id uuid,
  override_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_order_item_prod_steps_composite UNIQUE (tenant_id, id),
  CONSTRAINT uq_order_item_prod_steps_per_item_order UNIQUE (tenant_id, order_item_id, step_order),
  CONSTRAINT fk_order_item_steps_order_cross_tenant_safe
    FOREIGN KEY (tenant_id, order_id)
    REFERENCES public.orders(tenant_id, id)
    ON DELETE CASCADE,
  CONSTRAINT fk_order_item_steps_item_cross_tenant_safe
    FOREIGN KEY (tenant_id, order_item_id)
    REFERENCES public.order_items(tenant_id, id)
    ON DELETE CASCADE,
  CONSTRAINT fk_order_item_steps_station_cross_tenant_safe
    FOREIGN KEY (tenant_id, station_id)
    REFERENCES public.production_stations(tenant_id, id)
    ON DELETE SET NULL
);

-- Índices obrigatórios para consultas rápidas de fila por estação, pedido e item
CREATE INDEX IF NOT EXISTS idx_order_item_steps_station_status
  ON public.order_item_production_steps(tenant_id, station_id, status);

CREATE INDEX IF NOT EXISTS idx_order_item_steps_order
  ON public.order_item_production_steps(tenant_id, order_id);

CREATE INDEX IF NOT EXISTS idx_order_item_steps_item_order
  ON public.order_item_production_steps(tenant_id, order_item_id, step_order ASC);

-- 4. Extensão dos Eventos Operacionais Imutáveis (order_operation_events)
ALTER TABLE public.order_operation_events
  DROP CONSTRAINT IF EXISTS order_operation_events_event_type_check;

ALTER TABLE public.order_operation_events
  ADD CONSTRAINT order_operation_events_event_type_check CHECK (
    event_type IN (
      'item_started',
      'item_ready',
      'order_started',
      'order_ready',
      'priority_changed',
      'sla_warning',
      'sla_breached',
      'station_step_started',
      'station_step_completed',
      'station_step_skipped',
      'station_capacity_warning',
      'predicted_delay'
    )
  );

-- 5. Seed de Estações Padrão para o Tenant BENZA (Idempotente)
INSERT INTO public.production_stations (
  tenant_id, name, slug, description, display_order, station_type, is_active, default_capacity, default_duration_seconds
) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Cozinha Quente', 'cozinha-quente', 'Preparo de pratos quentes, feijoadas e acompanhamentos no fogão', 1, 'kitchen', true, 4, 600),
  ('00000000-0000-0000-0000-000000000001', 'Montagem', 'montagem', 'Porcionamento, guarnições e fechamento de embalagens', 2, 'assembly', true, 4, 300),
  ('00000000-0000-0000-0000-000000000001', 'Expedição', 'expedicao', 'Conferência final de itens, lacre e liberação do pedido', 3, 'expedition', true, 6, 180)
ON CONFLICT (tenant_id, slug) DO NOTHING;

-- ==============================================================================
-- 6. RPC Atômica: Inicializar Etapas de Produção do Pedido (Snapshot Imutável)
-- Regra de Precedência:
--   1. Etapas ativas da variante (product_id + variant_id) em estações ativas
--   2. Etapas ativas do produto (product_id + variant_id IS NULL) em estações ativas
--   3. Fallback automático de 1 etapa padrão na primeira estação ativa (ou Cozinha Geral)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.initialize_order_production_steps_atomic(
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
  v_item record;
  v_default_station record;
  v_step record;
  v_now timestamptz := timezone('utc'::text, now());
  v_existing_count integer := 0;
  v_inserted_steps integer := 0;
  v_seq integer := 0;
  v_has_variant_steps boolean := false;
  v_has_product_steps boolean := false;
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

  -- Busca primeira estação ativa do tenant para fallback caso o item não tenha fluxo configurado
  SELECT id, name, slug, station_type, default_duration_seconds
  INTO v_default_station
  FROM public.production_stations
  WHERE tenant_id = p_tenant_id AND is_active = true
  ORDER BY display_order ASC, created_at ASC
  LIMIT 1;

  FOR v_item IN
    SELECT id, product_id, variant_id, quantity, snapshot_product_name
    FROM public.order_items
    WHERE tenant_id = p_tenant_id AND order_id = p_order_id
    ORDER BY created_at ASC, id ASC
  LOOP
    -- Garante existência do registro em order_item_operations (compatibilidade Etapa 3A)
    INSERT INTO public.order_item_operations (
      tenant_id, order_id, order_item_id, preparation_status, created_at, updated_at
    ) VALUES (
      p_tenant_id, p_order_id, v_item.id, 'pending', v_now, v_now
    )
    ON CONFLICT (tenant_id, order_item_id) DO NOTHING;

    -- Idempotência: se já existem etapas geradas para este item, não recria
    SELECT count(*) INTO v_existing_count
    FROM public.order_item_production_steps
    WHERE tenant_id = p_tenant_id AND order_item_id = v_item.id;

    IF v_existing_count > 0 THEN
      CONTINUE;
    END IF;

    -- 1. Verifica precedência de variante
    SELECT EXISTS (
      SELECT 1
      FROM public.product_production_steps pps
      JOIN public.production_stations ps
        ON ps.tenant_id = pps.tenant_id AND ps.id = pps.station_id
      WHERE pps.tenant_id = p_tenant_id
        AND pps.product_id = v_item.product_id
        AND pps.variant_id = v_item.variant_id
        AND pps.is_active = true
        AND ps.is_active = true
    ) INTO v_has_variant_steps;

    IF v_has_variant_steps THEN
      v_seq := 0;
      FOR v_step IN
        SELECT
          pps.station_id,
          pps.estimated_duration_seconds,
          pps.capacity_weight,
          ps.name AS station_name,
          ps.slug AS station_slug,
          ps.station_type
        FROM public.product_production_steps pps
        JOIN public.production_stations ps
          ON ps.tenant_id = pps.tenant_id AND ps.id = pps.station_id
        WHERE pps.tenant_id = p_tenant_id
          AND pps.product_id = v_item.product_id
          AND pps.variant_id = v_item.variant_id
          AND pps.is_active = true
          AND ps.is_active = true
        ORDER BY pps.step_order ASC
      LOOP
        v_seq := v_seq + 1;
        INSERT INTO public.order_item_production_steps (
          tenant_id, order_id, order_item_id, station_id,
          snapshot_station_name, snapshot_station_slug, snapshot_station_type,
          step_order, status, estimated_duration_seconds, capacity_weight,
          created_at, updated_at
        ) VALUES (
          p_tenant_id, p_order_id, v_item.id, v_step.station_id,
          v_step.station_name, v_step.station_slug, v_step.station_type,
          v_seq,
          CASE WHEN v_seq = 1 THEN 'pending' ELSE 'blocked' END,
          v_step.estimated_duration_seconds,
          GREATEST(1, v_step.capacity_weight * GREATEST(1, v_item.quantity)),
          v_now, v_now
        );
        v_inserted_steps := v_inserted_steps + 1;
      END LOOP;
      CONTINUE;
    END IF;

    -- 2. Verifica precedência de produto (variant_id IS NULL)
    SELECT EXISTS (
      SELECT 1
      FROM public.product_production_steps pps
      JOIN public.production_stations ps
        ON ps.tenant_id = pps.tenant_id AND ps.id = pps.station_id
      WHERE pps.tenant_id = p_tenant_id
        AND pps.product_id = v_item.product_id
        AND pps.variant_id IS NULL
        AND pps.is_active = true
        AND ps.is_active = true
    ) INTO v_has_product_steps;

    IF v_has_product_steps THEN
      v_seq := 0;
      FOR v_step IN
        SELECT
          pps.station_id,
          pps.estimated_duration_seconds,
          pps.capacity_weight,
          ps.name AS station_name,
          ps.slug AS station_slug,
          ps.station_type
        FROM public.product_production_steps pps
        JOIN public.production_stations ps
          ON ps.tenant_id = pps.tenant_id AND ps.id = pps.station_id
        WHERE pps.tenant_id = p_tenant_id
          AND pps.product_id = v_item.product_id
          AND pps.variant_id IS NULL
          AND pps.is_active = true
          AND ps.is_active = true
        ORDER BY pps.step_order ASC
      LOOP
        v_seq := v_seq + 1;
        INSERT INTO public.order_item_production_steps (
          tenant_id, order_id, order_item_id, station_id,
          snapshot_station_name, snapshot_station_slug, snapshot_station_type,
          step_order, status, estimated_duration_seconds, capacity_weight,
          created_at, updated_at
        ) VALUES (
          p_tenant_id, p_order_id, v_item.id, v_step.station_id,
          v_step.station_name, v_step.station_slug, v_step.station_type,
          v_seq,
          CASE WHEN v_seq = 1 THEN 'pending' ELSE 'blocked' END,
          v_step.estimated_duration_seconds,
          GREATEST(1, v_step.capacity_weight * GREATEST(1, v_item.quantity)),
          v_now, v_now
        );
        v_inserted_steps := v_inserted_steps + 1;
      END LOOP;
      CONTINUE;
    END IF;

    -- 3. Fallback: 1 etapa operacional padrão
    INSERT INTO public.order_item_production_steps (
      tenant_id, order_id, order_item_id, station_id,
      snapshot_station_name, snapshot_station_slug, snapshot_station_type,
      step_order, status, estimated_duration_seconds, capacity_weight,
      created_at, updated_at
    ) VALUES (
      p_tenant_id,
      p_order_id,
      v_item.id,
      v_default_station.id,
      COALESCE(v_default_station.name, 'Cozinha Geral'),
      COALESCE(v_default_station.slug, 'cozinha-geral'),
      COALESCE(v_default_station.station_type, 'kitchen'),
      1,
      'pending',
      COALESCE(v_default_station.default_duration_seconds, 600),
      GREATEST(1, v_item.quantity),
      v_now,
      v_now
    );
    v_inserted_steps := v_inserted_steps + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'steps_created', v_inserted_steps
  );
END;
$$;

-- ==============================================================================
-- 7. Atualização de start_order_preparation_atomic (Compatível 3A + 3B)
-- Inicializa automaticamente as etapas multiestação e marca a 1ª etapa como 'preparing'
-- quando o preparo global do pedido é iniciado.
-- ==============================================================================
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

  -- Garante que todas as etapas de produção dos itens existam (snapshot)
  PERFORM public.initialize_order_production_steps_atomic(p_tenant_id, p_order_id, p_actor_user_id);

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

  -- Inicializa/atualiza todos os itens pendentes do pedido para 'preparing'
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

  -- Coloca a etapa 1 (pending) de cada item em 'preparing'
  UPDATE public.order_item_production_steps
  SET status = 'preparing',
      started_at = COALESCE(started_at, v_now),
      assigned_user_id = COALESCE(p_actor_user_id, assigned_user_id),
      updated_at = v_now
  WHERE tenant_id = p_tenant_id
    AND order_id = p_order_id
    AND step_order = 1
    AND status = 'pending';

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

-- ==============================================================================
-- 8. RPC Atômica: Iniciar Etapa de Estação (start_production_step_atomic)
-- Valida que a etapa não está 'blocked' nem finalizada. Idempotente se já 'preparing'.
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.start_production_step_atomic(
  p_tenant_id uuid,
  p_step_id uuid,
  p_actor_user_id uuid DEFAULT null
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_step record;
  v_order record;
  v_now timestamptz := timezone('utc'::text, now());
BEGIN
  SELECT * INTO v_step
  FROM public.order_item_production_steps
  WHERE tenant_id = p_tenant_id AND id = p_step_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Etapa de produção não encontrada para o tenant informado.'
    );
  END IF;

  SELECT id, status INTO v_order
  FROM public.orders
  WHERE tenant_id = p_tenant_id AND id = v_step.order_id
  FOR UPDATE;

  IF NOT FOUND OR v_order.status IN ('delivered', 'cancelled') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Não é possível iniciar etapa de um pedido finalizado ou cancelado.'
    );
  END IF;

  IF v_step.status = 'blocked' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Esta etapa está bloqueada aguardando a conclusão da etapa anterior.'
    );
  END IF;

  IF v_step.status IN ('ready', 'skipped', 'cancelled') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Não é possível iniciar etapa com status "%s".', v_step.status)
    );
  END IF;

  -- Idempotência: se já está 'preparing', retorna sucesso sem duplicar eventos
  IF v_step.status = 'preparing' THEN
    RETURN jsonb_build_object(
      'success', true,
      'idempotent', true,
      'step_id', v_step.id,
      'order_id', v_step.order_id,
      'order_item_id', v_step.order_item_id,
      'status', 'preparing',
      'started_at', v_step.started_at
    );
  END IF;

  -- Se o pedido ainda estava em 'confirmed', avança para 'preparing'
  IF v_order.status = 'confirmed' THEN
    UPDATE public.orders
    SET status = 'preparing',
        updated_at = v_now
    WHERE tenant_id = p_tenant_id AND id = v_step.order_id;

    INSERT INTO public.order_status_events (
      tenant_id, order_id, from_status, to_status, source, actor_user_id, metadata
    ) VALUES (
      p_tenant_id, v_step.order_id, 'confirmed', 'preparing', 'admin', p_actor_user_id,
      jsonb_build_object('trigger', 'station_step_started', 'step_id', v_step.id)
    );

    INSERT INTO public.order_operation_events (
      tenant_id, order_id, event_type, actor_user_id, metadata
    ) VALUES (
      p_tenant_id, v_step.order_id, 'order_started', p_actor_user_id,
      jsonb_build_object('started_at', v_now, 'station_slug', v_step.snapshot_station_slug)
    );
  END IF;

  -- Atualiza etapa para 'preparing'
  UPDATE public.order_item_production_steps
  SET status = 'preparing',
      started_at = COALESCE(started_at, v_now),
      assigned_user_id = COALESCE(p_actor_user_id, assigned_user_id),
      updated_at = v_now
  WHERE tenant_id = p_tenant_id AND id = p_step_id;

  -- Sincroniza order_item_operations como 'preparing'
  INSERT INTO public.order_item_operations (
    tenant_id, order_id, order_item_id, preparation_status, started_at, updated_by, created_at, updated_at
  ) VALUES (
    p_tenant_id, v_step.order_id, v_step.order_item_id, 'preparing', v_now, p_actor_user_id, v_now, v_now
  )
  ON CONFLICT (tenant_id, order_item_id)
  DO UPDATE SET
    preparation_status = CASE
      WHEN public.order_item_operations.preparation_status = 'pending' THEN 'preparing'
      ELSE public.order_item_operations.preparation_status
    END,
    started_at = COALESCE(public.order_item_operations.started_at, v_now),
    updated_by = COALESCE(p_actor_user_id, public.order_item_operations.updated_by),
    updated_at = v_now;

  -- Registra evento imutável de início da etapa na estação
  INSERT INTO public.order_operation_events (
    tenant_id, order_id, order_item_id, event_type, actor_user_id, metadata
  ) VALUES (
    p_tenant_id,
    v_step.order_id,
    v_step.order_item_id,
    'station_step_started',
    p_actor_user_id,
    jsonb_build_object(
      'step_id', v_step.id,
      'step_order', v_step.step_order,
      'station_id', v_step.station_id,
      'station_name', v_step.snapshot_station_name,
      'station_slug', v_step.snapshot_station_slug,
      'started_at', v_now
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'idempotent', false,
    'step_id', v_step.id,
    'order_id', v_step.order_id,
    'order_item_id', v_step.order_item_id,
    'step_order', v_step.step_order,
    'status', 'preparing',
    'started_at', v_now
  );
END;
$$;

-- ==============================================================================
-- 9. RPC Atômica: Concluir Etapa de Estação (complete_production_step_atomic)
-- Conclui a etapa atual, desbloqueia a próxima etapa sequencial ('blocked' -> 'pending'),
-- marca o item como 'ready' somente quando todas as suas etapas terminarem,
-- e calcula all_items_ready sem autopromover orders.status para 'ready'.
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.complete_production_step_atomic(
  p_tenant_id uuid,
  p_step_id uuid,
  p_actor_user_id uuid DEFAULT null
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_step record;
  v_order record;
  v_next_step record;
  v_now timestamptz := timezone('utc'::text, now());
  v_remaining_item_steps integer := 0;
  v_item_is_ready boolean := false;
  v_total_items integer := 0;
  v_ready_items integer := 0;
  v_all_items_ready boolean := false;
  v_unlocked_step_id uuid := null;
  v_unlocked_station_slug varchar := null;
BEGIN
  SELECT * INTO v_step
  FROM public.order_item_production_steps
  WHERE tenant_id = p_tenant_id AND id = p_step_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Etapa de produção não encontrada para o tenant informado.'
    );
  END IF;

  SELECT id, status INTO v_order
  FROM public.orders
  WHERE tenant_id = p_tenant_id AND id = v_step.order_id
  FOR UPDATE;

  IF NOT FOUND OR v_order.status IN ('delivered', 'cancelled') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Não é permitido concluir etapa de pedido finalizado ou cancelado.'
    );
  END IF;

  IF v_step.status = 'blocked' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Não é permitido concluir uma etapa bloqueada. Conclua a etapa anterior primeiro.'
    );
  END IF;

  -- Idempotência: se já está 'ready', retorna estado atual sem duplicar eventos
  IF v_step.status = 'ready' THEN
    SELECT count(*) INTO v_total_items
    FROM public.order_items
    WHERE tenant_id = p_tenant_id AND order_id = v_step.order_id;

    SELECT count(*) INTO v_ready_items
    FROM public.order_item_operations
    WHERE tenant_id = p_tenant_id AND order_id = v_step.order_id AND preparation_status = 'ready';

    v_all_items_ready := (v_total_items > 0 AND v_ready_items = v_total_items);

    RETURN jsonb_build_object(
      'success', true,
      'idempotent', true,
      'step_id', v_step.id,
      'order_id', v_step.order_id,
      'order_item_id', v_step.order_item_id,
      'status', 'ready',
      'completed_at', v_step.completed_at,
      'ready_items', v_ready_items,
      'total_items', v_total_items,
      'all_items_ready', v_all_items_ready
    );
  END IF;

  -- Se o pedido estava em 'confirmed', avança para 'preparing'
  IF v_order.status = 'confirmed' THEN
    UPDATE public.orders
    SET status = 'preparing',
        updated_at = v_now
    WHERE tenant_id = p_tenant_id AND id = v_step.order_id;

    INSERT INTO public.order_status_events (
      tenant_id, order_id, from_status, to_status, source, actor_user_id, metadata
    ) VALUES (
      p_tenant_id, v_step.order_id, 'confirmed', 'preparing', 'admin', p_actor_user_id,
      jsonb_build_object('trigger', 'station_step_completed_auto_start')
    );
  END IF;

  -- 1. Marca a etapa atual como 'ready'
  UPDATE public.order_item_production_steps
  SET status = 'ready',
      started_at = COALESCE(started_at, v_now),
      completed_at = v_now,
      assigned_user_id = COALESCE(p_actor_user_id, assigned_user_id),
      updated_at = v_now
  WHERE tenant_id = p_tenant_id AND id = p_step_id;

  -- Registra evento station_step_completed
  INSERT INTO public.order_operation_events (
    tenant_id, order_id, order_item_id, event_type, actor_user_id, metadata
  ) VALUES (
    p_tenant_id,
    v_step.order_id,
    v_step.order_item_id,
    'station_step_completed',
    p_actor_user_id,
    jsonb_build_object(
      'step_id', v_step.id,
      'step_order', v_step.step_order,
      'station_id', v_step.station_id,
      'station_name', v_step.snapshot_station_name,
      'station_slug', v_step.snapshot_station_slug,
      'completed_at', v_now
    )
  );

  -- 2. Desbloqueia a próxima etapa sequencial ('blocked' -> 'pending') se existir
  SELECT id, snapshot_station_slug INTO v_next_step
  FROM public.order_item_production_steps
  WHERE tenant_id = p_tenant_id
    AND order_item_id = v_step.order_item_id
    AND step_order > v_step.step_order
    AND status = 'blocked'
  ORDER BY step_order ASC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    UPDATE public.order_item_production_steps
    SET status = 'pending',
        updated_at = v_now
    WHERE tenant_id = p_tenant_id AND id = v_next_step.id;

    v_unlocked_step_id := v_next_step.id;
    v_unlocked_station_slug := v_next_step.snapshot_station_slug;
  END IF;

  -- 3. Verifica se todas as etapas deste item estão concluídas ('ready' ou 'skipped')
  SELECT count(*) INTO v_remaining_item_steps
  FROM public.order_item_production_steps
  WHERE tenant_id = p_tenant_id
    AND order_item_id = v_step.order_item_id
    AND status NOT IN ('ready', 'skipped');

  IF v_remaining_item_steps = 0 THEN
    v_item_is_ready := true;

    INSERT INTO public.order_item_operations (
      tenant_id, order_id, order_item_id, preparation_status, started_at, completed_at, updated_by, created_at, updated_at
    ) VALUES (
      p_tenant_id, v_step.order_id, v_step.order_item_id, 'ready', COALESCE(v_step.started_at, v_now), v_now, p_actor_user_id, v_now, v_now
    )
    ON CONFLICT (tenant_id, order_item_id)
    DO UPDATE SET
      preparation_status = 'ready',
      started_at = COALESCE(public.order_item_operations.started_at, v_step.started_at, v_now),
      completed_at = v_now,
      updated_by = COALESCE(p_actor_user_id, public.order_item_operations.updated_by),
      updated_at = v_now;

    INSERT INTO public.order_operation_events (
      tenant_id, order_id, order_item_id, event_type, actor_user_id, metadata
    ) VALUES (
      p_tenant_id,
      v_step.order_id,
      v_step.order_item_id,
      'item_ready',
      p_actor_user_id,
      jsonb_build_object('trigger', 'all_station_steps_completed', 'last_step_id', v_step.id)
    );
  ELSE
    -- Mantém item como 'preparing' enquanto ainda houver etapas pendentes/em preparo
    INSERT INTO public.order_item_operations (
      tenant_id, order_id, order_item_id, preparation_status, started_at, updated_by, created_at, updated_at
    ) VALUES (
      p_tenant_id, v_step.order_id, v_step.order_item_id, 'preparing', COALESCE(v_step.started_at, v_now), p_actor_user_id, v_now, v_now
    )
    ON CONFLICT (tenant_id, order_item_id)
    DO UPDATE SET
      preparation_status = 'preparing',
      started_at = COALESCE(public.order_item_operations.started_at, v_step.started_at, v_now),
      completed_at = null,
      updated_by = COALESCE(p_actor_user_id, public.order_item_operations.updated_by),
      updated_at = v_now;
  END IF;

  -- 4. Contabiliza progresso global do pedido (SEM mudar order.status automaticamente para 'ready')
  SELECT count(*) INTO v_total_items
  FROM public.order_items
  WHERE tenant_id = p_tenant_id AND order_id = v_step.order_id;

  SELECT count(*) INTO v_ready_items
  FROM public.order_item_operations
  WHERE tenant_id = p_tenant_id AND order_id = v_step.order_id AND preparation_status = 'ready';

  v_all_items_ready := (v_total_items > 0 AND v_ready_items = v_total_items);

  RETURN jsonb_build_object(
    'success', true,
    'idempotent', false,
    'step_id', v_step.id,
    'order_id', v_step.order_id,
    'order_item_id', v_step.order_item_id,
    'step_order', v_step.step_order,
    'status', 'ready',
    'completed_at', v_now,
    'unlocked_next_step_id', v_unlocked_step_id,
    'unlocked_station_slug', v_unlocked_station_slug,
    'item_ready', v_item_is_ready,
    'ready_items', v_ready_items,
    'total_items', v_total_items,
    'all_items_ready', v_all_items_ready
  );
END;
$$;

-- ==============================================================================
-- 10. RPC Atômica: Override Administrativo de Etapa (override_production_step_atomic)
-- Exclusivo para casos excepcionais (pular etapa ou forçar conclusão).
-- Exige motivo obrigatório, desbloqueia próxima etapa e grava trilha imutável
-- em order_operation_events e audit_logs.
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.override_production_step_atomic(
  p_tenant_id uuid,
  p_step_id uuid,
  p_action varchar,
  p_reason text,
  p_actor_user_id uuid DEFAULT null
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_step record;
  v_order record;
  v_next_step record;
  v_now timestamptz := timezone('utc'::text, now());
  v_clean_reason text := trim(COALESCE(p_reason, ''));
  v_target_status varchar(20);
  v_remaining_item_steps integer := 0;
  v_item_is_ready boolean := false;
  v_total_items integer := 0;
  v_ready_items integer := 0;
  v_all_items_ready boolean := false;
  v_valid_actor_id uuid := null;
BEGIN
  IF p_action NOT IN ('skip', 'force_complete') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Ação de override inválida: "%s". Use "skip" ou "force_complete".', p_action)
    );
  END IF;

  IF length(v_clean_reason) < 3 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Motivo obrigatório (mínimo 3 caracteres) para realizar override administrativo de etapa.'
    );
  END IF;

  SELECT * INTO v_step
  FROM public.order_item_production_steps
  WHERE tenant_id = p_tenant_id AND id = p_step_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Etapa de produção não encontrada para o tenant informado.'
    );
  END IF;

  SELECT id, status INTO v_order
  FROM public.orders
  WHERE tenant_id = p_tenant_id AND id = v_step.order_id
  FOR UPDATE;

  IF NOT FOUND OR v_order.status IN ('delivered', 'cancelled') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Não é permitido realizar override em pedido finalizado ou cancelado.'
    );
  END IF;

  v_target_status := CASE WHEN p_action = 'skip' THEN 'skipped' ELSE 'ready' END;

  -- Atualiza a etapa com o status de override e o motivo
  UPDATE public.order_item_production_steps
  SET status = v_target_status,
      started_at = COALESCE(started_at, v_now),
      completed_at = v_now,
      assigned_user_id = COALESCE(p_actor_user_id, assigned_user_id),
      override_reason = v_clean_reason,
      updated_at = v_now
  WHERE tenant_id = p_tenant_id AND id = p_step_id;

  -- Se a etapa anterior ou atual foi pulada/forçada, garante que a próxima etapa imediata seja desbloqueada
  SELECT id INTO v_next_step
  FROM public.order_item_production_steps
  WHERE tenant_id = p_tenant_id
    AND order_item_id = v_step.order_item_id
    AND step_order > v_step.step_order
    AND status = 'blocked'
  ORDER BY step_order ASC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    UPDATE public.order_item_production_steps
    SET status = 'pending',
        updated_at = v_now
    WHERE tenant_id = p_tenant_id AND id = v_next_step.id;
  END IF;

  -- Verifica se todas as etapas do item estão concluídas ('ready' ou 'skipped')
  SELECT count(*) INTO v_remaining_item_steps
  FROM public.order_item_production_steps
  WHERE tenant_id = p_tenant_id
    AND order_item_id = v_step.order_item_id
    AND status NOT IN ('ready', 'skipped');

  IF v_remaining_item_steps = 0 THEN
    v_item_is_ready := true;
    INSERT INTO public.order_item_operations (
      tenant_id, order_id, order_item_id, preparation_status, started_at, completed_at, updated_by, created_at, updated_at
    ) VALUES (
      p_tenant_id, v_step.order_id, v_step.order_item_id, 'ready', COALESCE(v_step.started_at, v_now), v_now, p_actor_user_id, v_now, v_now
    )
    ON CONFLICT (tenant_id, order_item_id)
    DO UPDATE SET
      preparation_status = 'ready',
      completed_at = v_now,
      updated_by = COALESCE(p_actor_user_id, public.order_item_operations.updated_by),
      updated_at = v_now;
  END IF;

  -- Registra evento operacional imutável
  INSERT INTO public.order_operation_events (
    tenant_id, order_id, order_item_id, event_type, actor_user_id, metadata
  ) VALUES (
    p_tenant_id,
    v_step.order_id,
    v_step.order_item_id,
    'station_step_skipped',
    p_actor_user_id,
    jsonb_build_object(
      'step_id', v_step.id,
      'step_order', v_step.step_order,
      'station_name', v_step.snapshot_station_name,
      'station_slug', v_step.snapshot_station_slug,
      'override_action', p_action,
      'from_status', v_step.status,
      'to_status', v_target_status,
      'reason', v_clean_reason
    )
  );

  -- Verifica se p_actor_user_id existe em auth.users para FK segura em audit_logs
  IF p_actor_user_id IS NOT NULL THEN
    SELECT id INTO v_valid_actor_id FROM auth.users WHERE id = p_actor_user_id;
  END IF;

  INSERT INTO public.audit_logs (
    tenant_id, actor_id, action, resource_type, resource_id, payload_before, payload_after
  ) VALUES (
    p_tenant_id,
    v_valid_actor_id,
    'kds_step_override',
    'order_item_production_step',
    v_step.id::text,
    jsonb_build_object(
      'status', v_step.status,
      'step_order', v_step.step_order,
      'station_slug', v_step.snapshot_station_slug
    ),
    jsonb_build_object(
      'status', v_target_status,
      'override_action', p_action,
      'reason', v_clean_reason,
      'actor_user_id', p_actor_user_id,
      'order_id', v_step.order_id,
      'order_item_id', v_step.order_item_id
    )
  );

  SELECT count(*) INTO v_total_items
  FROM public.order_items
  WHERE tenant_id = p_tenant_id AND order_id = v_step.order_id;

  SELECT count(*) INTO v_ready_items
  FROM public.order_item_operations
  WHERE tenant_id = p_tenant_id AND order_id = v_step.order_id AND preparation_status = 'ready';

  v_all_items_ready := (v_total_items > 0 AND v_ready_items = v_total_items);

  RETURN jsonb_build_object(
    'success', true,
    'step_id', v_step.id,
    'order_id', v_step.order_id,
    'order_item_id', v_step.order_item_id,
    'override_action', p_action,
    'status', v_target_status,
    'reason', v_clean_reason,
    'item_ready', v_item_is_ready,
    'ready_items', v_ready_items,
    'total_items', v_total_items,
    'all_items_ready', v_all_items_ready
  );
END;
$$;

-- ==============================================================================
-- 11. Atualização de update_order_item_operation_atomic (Compatibilidade 3A + 3B)
-- Se o item possui múltiplas etapas e existem etapas anteriores ainda abertas,
-- sincroniza ou impede pular etapas sem override. Se for item de etapa única,
-- atualiza a etapa correspondente junto com order_item_operations.
-- ==============================================================================
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
  v_steps_count integer := 0;
  v_unfinished_prior_steps integer := 0;
BEGIN
  IF p_to_status NOT IN ('pending', 'preparing', 'ready') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Status operacional de item inválido: "%s".', p_to_status)
    );
  END IF;

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

  SELECT id, snapshot_product_name INTO v_item
  FROM public.order_items
  WHERE tenant_id = p_tenant_id AND order_id = p_order_id AND id = p_order_item_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Item não encontrado para este pedido.'
    );
  END IF;

  -- Verifica se este item possui múltiplas etapas configuradas
  SELECT count(*) INTO v_steps_count
  FROM public.order_item_production_steps
  WHERE tenant_id = p_tenant_id AND order_item_id = p_order_item_id;

  -- Se o operador tentar marcar o item inteiro como 'ready' diretamente e houver > 1 etapa com etapas bloqueadas/abertas:
  IF p_to_status = 'ready' AND v_steps_count > 1 THEN
    SELECT count(*) INTO v_unfinished_prior_steps
    FROM public.order_item_production_steps
    WHERE tenant_id = p_tenant_id
      AND order_item_id = p_order_item_id
      AND status NOT IN ('ready', 'skipped');

    IF v_unfinished_prior_steps > 1 THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', format('Este item possui %s etapas sequenciais pendentes nas estações. Conclua as etapas em ordem na estação correspondente.', v_unfinished_prior_steps)
      );
    END IF;
  END IF;

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

  INSERT INTO public.order_item_operations (
    tenant_id, order_id, order_item_id, preparation_status, started_at, completed_at, updated_by, created_at, updated_at
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

  -- Sincroniza etapa única (ou última etapa ativa) em order_item_production_steps
  IF v_steps_count <= 1 THEN
    UPDATE public.order_item_production_steps
    SET status = p_to_status,
        started_at = CASE
          WHEN p_to_status IN ('preparing', 'ready') THEN COALESCE(started_at, v_now)
          ELSE started_at
        END,
        completed_at = CASE
          WHEN p_to_status = 'ready' THEN v_now
          ELSE null
        END,
        assigned_user_id = COALESCE(p_actor_user_id, assigned_user_id),
        updated_at = v_now
    WHERE tenant_id = p_tenant_id AND order_item_id = p_order_item_id;
  ELSIF p_to_status = 'ready' THEN
    UPDATE public.order_item_production_steps
    SET status = 'ready',
        started_at = COALESCE(started_at, v_now),
        completed_at = COALESCE(completed_at, v_now),
        updated_at = v_now
    WHERE tenant_id = p_tenant_id
      AND order_item_id = p_order_item_id
      AND status NOT IN ('ready', 'skipped');
  END IF;

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

-- ==============================================================================
-- 12. Atualização de complete_order_preparation_atomic (Compatibilidade 3A + 3B)
-- Garante que todos os itens E todas as etapas obrigatórias em todas as estações
-- estejam concluídas ('ready' ou 'skipped') antes de avançar preparing -> ready.
-- ==============================================================================
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
  v_pending_steps integer := 0;
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

  -- Verifica se existem etapas multiestação ainda abertas
  SELECT count(*) INTO v_pending_steps
  FROM public.order_item_production_steps
  WHERE tenant_id = p_tenant_id
    AND order_id = p_order_id
    AND status IN ('blocked', 'pending', 'preparing');

  IF v_pending_steps > 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Ainda existem %s etapas de produção pendentes nas estações. Conclua todas as etapas antes de liberar o pedido.', v_pending_steps),
      'pending_steps', v_pending_steps
    );
  END IF;

  -- Verifica se todos os itens em order_item_operations estão prontos
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

-- ==============================================================================
-- 13. Row Level Security (RLS) Multi-Tenant Estrita
-- ==============================================================================
ALTER TABLE public.production_stations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_production_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_item_production_steps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_production_stations ON public.production_stations;
CREATE POLICY tenant_isolation_production_stations ON public.production_stations
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

DROP POLICY IF EXISTS tenant_isolation_product_production_steps ON public.product_production_steps;
CREATE POLICY tenant_isolation_product_production_steps ON public.product_production_steps
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

DROP POLICY IF EXISTS tenant_isolation_order_item_production_steps ON public.order_item_production_steps;
CREATE POLICY tenant_isolation_order_item_production_steps ON public.order_item_production_steps
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

