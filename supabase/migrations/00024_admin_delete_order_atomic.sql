-- ==============================================================================
-- Migration 00024: Exclusão administrativa atômica de pedidos (ex.: pedidos de teste)
-- Mantém imutabilidade contra UPDATE/DELETE direto nas tabelas de eventos,
-- liberando apenas o CASCADE controlado dentro de admin_delete_order_atomic().
-- Remove eventual lançamento financeiro vinculado e registra motivo em audit_logs.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.prevent_order_status_events_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('app.allow_order_purge', true) = 'true' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'A tabela order_status_events é estritamente imutável. Atualizações ou exclusões de eventos históricos são proibidas.';
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_order_operation_events_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('app.allow_order_purge', true) = 'true' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'A tabela order_operation_events é estritamente imutável. Atualizações ou exclusões não são permitidas.';
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_delivery_events_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('app.allow_order_purge', true) = 'true' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'A tabela delivery_events é estritamente imutável. Atualizações ou exclusões são proibidas.';
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_order_atomic(
  p_tenant_id uuid,
  p_order_id uuid,
  p_actor_user_id uuid DEFAULT NULL,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order record;
  v_reason text := NULLIF(btrim(COALESCE(p_reason, '')), '');
  v_finance_removed_count integer := 0;
  v_finance_removed_cents integer := 0;
BEGIN
  SELECT id, order_number, customer_name, total_cents, payment_method, payment_status, status
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id
    AND tenant_id = p_tenant_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Pedido não encontrado.');
  END IF;

  IF v_reason IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Informe o motivo da exclusão do pedido.');
  END IF;

  SELECT COUNT(*)::integer, COALESCE(SUM(amount_cents), 0)::integer
  INTO v_finance_removed_count, v_finance_removed_cents
  FROM public.finance_entries
  WHERE tenant_id = p_tenant_id
    AND order_id = p_order_id;

  PERFORM set_config('app.allow_order_purge', 'true', true);

  DELETE FROM public.finance_entries
  WHERE tenant_id = p_tenant_id
    AND order_id = p_order_id;

  DELETE FROM public.orders
  WHERE id = p_order_id
    AND tenant_id = p_tenant_id;

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
    'ORDER_DELETED',
    'order',
    p_order_id::text,
    jsonb_build_object(
      'order_number', v_order.order_number,
      'customer_name', v_order.customer_name,
      'total_cents', v_order.total_cents,
      'payment_method', v_order.payment_method,
      'payment_status', v_order.payment_status,
      'status', v_order.status
    ),
    jsonb_build_object(
      'reason', v_reason,
      'finance_entries_removed', v_finance_removed_count,
      'finance_removed_cents', v_finance_removed_cents
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'orderNumber', v_order.order_number,
    'financeEntriesRemoved', v_finance_removed_count
  );
END;
$$;
