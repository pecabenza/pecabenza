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

describe.skipIf(!isConfigured)('Validação Remota — Migration 00009 (Payments, Webhooks & Idempotency)', () => {
  let adminClient: SupabaseClient<any, 'public', any>;
  let anonClient: SupabaseClient<any, 'public', any>;

  const TENANT_BENZA = '00000000-0000-0000-0000-000000000001';
  const TENANT_CACAU = '00000000-0000-0000-0000-000000000002';

  const createdOrderIds: string[] = [];
  const createdPaymentIds: string[] = [];
  const createdEventIds: string[] = [];

  beforeAll(() => {
    adminClient = createClient(supabaseUrl, serviceRoleKey);
    anonClient = createClient(supabaseUrl, anonKey);
  });

  afterAll(async () => {
    // Limpeza de dados de homologação
    if (createdPaymentIds.length > 0) {
      await adminClient.from('payments').delete().in('id', createdPaymentIds);
    }
    if (createdOrderIds.length > 0) {
      await adminClient.from('orders').delete().in('id', createdOrderIds);
    }
    if (createdEventIds.length > 0) {
      await adminClient.from('payment_webhook_events').delete().in('event_id', createdEventIds);
    }
  });

  it('1. Deve validar a existência das tabelas de pagamento no Supabase', async () => {
    // tenant_payment_settings
    const { error: settingsErr } = await adminClient
      .from('tenant_payment_settings')
      .select('tenant_id')
      .limit(1);
    expect(settingsErr).toBeNull();

    // payments
    const { error: paymentsErr } = await adminClient
      .from('payments')
      .select('id')
      .limit(1);
    expect(paymentsErr).toBeNull();

    // payment_webhook_events
    const { error: webhooksErr } = await adminClient
      .from('payment_webhook_events')
      .select('id')
      .limit(1);
    expect(webhooksErr).toBeNull();
  });

  it('2. Deve verificar configurações default de pagamento para os tenants de homologação', async () => {
    const { data: benzaSettings, error } = await adminClient
      .from('tenant_payment_settings')
      .select('*')
      .eq('tenant_id', TENANT_BENZA)
      .maybeSingle();

    expect(error).toBeNull();
    if (benzaSettings) {
      expect(benzaSettings.is_active).toBe(true);
      expect(benzaSettings.pix_enabled).toBe(true);
      expect(benzaSettings.pix_expiration_minutes).toBeGreaterThanOrEqual(5);
    }
  });

  it('3. Deve validar a RPC process_payment_webhook_atomic e atualização atômica de status', async () => {
    // 1. Cria pedido de teste
    const { data: orderNumberData } = await adminClient.rpc('generate_next_order_number', {
      p_tenant_id: TENANT_BENZA,
    });
    const orderNumber = orderNumberData || '#999001';

    const { data: order, error: orderErr } = await adminClient
      .from('orders')
      .insert({
        tenant_id: TENANT_BENZA,
        order_number: orderNumber,
        customer_name: 'Webhook Test Buyer',
        customer_phone: '11988887777',
        fulfillment_type: 'pickup',
        schedule_type: 'asap',
        status: 'awaiting_payment',
        payment_status: 'awaiting_payment',
        subtotal_cents: 5000,
        delivery_fee_cents: 0,
        discount_cents: 0,
        total_cents: 5000,
      })
      .select()
      .single();

    expect(orderErr).toBeNull();
    expect(order).toBeDefined();
    createdOrderIds.push(order.id);

    // 2. Cria registro de pagamento vinculado
    const providerPaymentId = `pay_test_${Date.now()}`;
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    const { data: payment, error: payErr } = await adminClient
      .from('payments')
      .insert({
        tenant_id: TENANT_BENZA,
        order_id: order.id,
        provider: 'mock',
        provider_payment_id: providerPaymentId,
        method: 'pix',
        status: 'pending',
        amount_cents: 5000,
        pix_qr_code_text: '00020126580014br.gov.bcb.pix...',
        pix_expires_at: expiresAt,
      })
      .select()
      .single();

    expect(payErr).toBeNull();
    expect(payment).toBeDefined();
    createdPaymentIds.push(payment.id);

    // 3. Executa RPC process_payment_webhook_atomic simulando confirmação de Pix
    const eventId = `evt_webhook_test_${Date.now()}`;
    createdEventIds.push(eventId);

    const { data: webhookResult, error: rpcErr } = await adminClient.rpc('process_payment_webhook_atomic', {
      p_tenant_id: TENANT_BENZA,
      p_provider: 'mock',
      p_event_id: eventId,
      p_event_type: 'PAYMENT_RECEIVED',
      p_provider_payment_id: providerPaymentId,
      p_new_status: 'paid',
      p_paid_at: new Date().toISOString(),
      p_payload: { amount: 5000, status: 'paid' },
    });

    expect(rpcErr).toBeNull();
    expect(webhookResult.success).toBe(true);
    expect(webhookResult.idempotent).toBe(false);
    expect(webhookResult.new_status).toBe('paid');

    // 4. Valida se o pagamento e o pedido foram atualizados para 'paid'
    const { data: updatedPayment } = await adminClient
      .from('payments')
      .select('status, paid_at')
      .eq('id', payment.id)
      .single();

    expect(updatedPayment?.status).toBe('paid');
    expect(updatedPayment?.paid_at).toBeDefined();

    const { data: updatedOrder } = await adminClient
      .from('orders')
      .select('status, payment_status')
      .eq('id', order.id)
      .single();

    expect(updatedOrder?.status).toBe('paid');
    expect(updatedOrder?.payment_status).toBe('paid');

    // 5. Teste de Idempotência: reenvia exatamente o mesmo evento
    const { data: idempotentResult, error: idempErr } = await adminClient.rpc('process_payment_webhook_atomic', {
      p_tenant_id: TENANT_BENZA,
      p_provider: 'mock',
      p_event_id: eventId,
      p_event_type: 'PAYMENT_RECEIVED',
      p_provider_payment_id: providerPaymentId,
      p_new_status: 'paid',
      p_paid_at: new Date().toISOString(),
      p_payload: { amount: 5000, status: 'paid' },
    });

    expect(idempErr).toBeNull();
    expect(idempotentResult.success).toBe(true);
    expect(idempotentResult.idempotent).toBe(true);
  });

  it('4. Deve validar o isolamento de RLS entre tenants em pagamentos', async () => {
    // Cliente anônimo sem header tenant não deve ver pagamentos
    const { data: anonData } = await anonClient.from('payments').select('*');
    expect(anonData?.length || 0).toBe(0);
  });
});

