import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const isConfigured = Boolean(
  supabaseUrl &&
  !supabaseUrl.includes('placeholder') &&
  !supabaseUrl.includes('[') &&
  anonKey &&
  !anonKey.includes('placeholder') &&
  !anonKey.includes('[') &&
  serviceRoleKey &&
  !serviceRoleKey.includes('[')
);

describe.skipIf(!isConfigured)('Validação Remota — Migration 00010 (Order Tracking & Immutability Events)', () => {
  let adminClient: SupabaseClient<any, 'public', any>;
  let anonClient: SupabaseClient<any, 'public', any>;

  const TENANT_BENZA = '00000000-0000-0000-0000-000000000001';
  const TENANT_CACAU = '00000000-0000-0000-0000-000000000002';

  const createdOrderIds: string[] = [];

  beforeAll(() => {
    adminClient = createClient(supabaseUrl, serviceRoleKey);
    anonClient = createClient(supabaseUrl, anonKey);
  });

  afterAll(async () => {
    if (createdOrderIds.length > 0) {
      // Cascata remove também os order_status_events
      await adminClient.from('orders').delete().in('id', createdOrderIds);
    }
  });

  it('1. Deve validar a existência da tabela order_status_events e coluna public_tracking_token', async () => {
    // order_status_events
    const { error: eventsErr } = await adminClient
      .from('order_status_events')
      .select('id')
      .limit(1);
    expect(eventsErr).toBeNull();

    // public_tracking_token em orders
    const { data: orderData, error: ordersErr } = await adminClient
      .from('orders')
      .select('id, public_tracking_token')
      .limit(1);
    expect(ordersErr).toBeNull();
    if (orderData && orderData.length > 0) {
      expect(orderData[0].public_tracking_token).toBeDefined();
    }
  });

  it('2. Deve validar o Trigger de Imutabilidade Estrita em order_status_events (Anti-Tampering)', async () => {
    // 1. Cria pedido de homologação
    const { data: orderNum } = await adminClient.rpc('generate_next_order_number', {
      p_tenant_id: TENANT_BENZA,
    });
    const orderNumber = orderNum || '#999101';

    const { data: order, error: orderErr } = await adminClient
      .from('orders')
      .insert({
        tenant_id: TENANT_BENZA,
        order_number: orderNumber,
        customer_name: 'Immutability Audit Customer',
        customer_phone: '11977776666',
        fulfillment_type: 'delivery',
        schedule_type: 'asap',
        status: 'pending',
        payment_status: 'unpaid',
        subtotal_cents: 3500,
        delivery_fee_cents: 1200,
        discount_cents: 0,
        total_cents: 4700,
      })
      .select()
      .single();

    expect(orderErr).toBeNull();
    expect(order).toBeDefined();
    createdOrderIds.push(order.id);

    // 2. Insere evento inicial
    const { data: event, error: insertErr } = await adminClient
      .from('order_status_events')
      .insert({
        tenant_id: TENANT_BENZA,
        order_id: order.id,
        from_status: null,
        to_status: 'pending',
        source: 'system',
        metadata: { initial: true },
      })
      .select()
      .single();

    expect(insertErr).toBeNull();
    expect(event).toBeDefined();

    // 3. Tenta modificar o evento histórico -> Deve ser bloqueado pelo Trigger
    const { error: updateErr } = await adminClient
      .from('order_status_events')
      .update({ to_status: 'confirmed' })
      .eq('id', event.id);

    expect(updateErr).toBeDefined();
    expect(updateErr?.message).toContain('imutável');

    // 4. Tenta deletar o evento histórico diretamente -> Deve ser bloqueado pelo Trigger
    const { error: deleteErr } = await adminClient
      .from('order_status_events')
      .delete()
      .eq('id', event.id);

    expect(deleteErr).toBeDefined();
    expect(deleteErr?.message).toContain('imutável');
  });

  it('3. Deve executar transições de status válidas via RPC update_order_status_atomic', async () => {
    const orderId = createdOrderIds[0];
    expect(orderId).toBeDefined();

    // Transição 1: pending -> confirmed
    const { data: step1, error: err1 } = await adminClient.rpc('update_order_status_atomic', {
      p_tenant_id: TENANT_BENZA,
      p_order_id: orderId,
      p_to_status: 'confirmed',
      p_source: 'admin',
    });

    expect(err1).toBeNull();
    expect(step1.success).toBe(true);
    expect(step1.to_status).toBe('confirmed');

    // Transição 2: confirmed -> preparing
    const { data: step2, error: err2 } = await adminClient.rpc('update_order_status_atomic', {
      p_tenant_id: TENANT_BENZA,
      p_order_id: orderId,
      p_to_status: 'preparing',
      p_source: 'admin',
    });

    expect(err2).toBeNull();
    expect(step2.success).toBe(true);
    expect(step2.to_status).toBe('preparing');

    // Transição 3: Teste de Idempotência (mesmo status)
    const { data: idempStep, error: errIdemp } = await adminClient.rpc('update_order_status_atomic', {
      p_tenant_id: TENANT_BENZA,
      p_order_id: orderId,
      p_to_status: 'preparing',
      p_source: 'admin',
    });

    expect(errIdemp).toBeNull();
    expect(idempStep.success).toBe(true);
    expect(idempStep.idempotent).toBe(true);

    // Transição 4: Rejeição de salto ilegítimo (preparing -> delivered direto para delivery)
    const { data: invalidStep, error: errInvalid } = await adminClient.rpc('update_order_status_atomic', {
      p_tenant_id: TENANT_BENZA,
      p_order_id: orderId,
      p_to_status: 'delivered',
      p_source: 'admin',
    });

    expect(errInvalid).toBeNull();
    expect(invalidStep.success).toBe(false);
    expect(invalidStep.error).toContain('inválida');
  });

  it('4. Deve validar isolamento de RLS em order_status_events', async () => {
    // Cliente anônimo não deve ter leitura irrestrita da tabela inteira
    const { data: anonData } = await anonClient.from('order_status_events').select('*');
    expect(anonData?.length || 0).toBe(0);
  });
});

