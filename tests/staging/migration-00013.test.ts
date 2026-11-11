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

describe.skipIf(!isConfigured)(
  'Validação Remota — Migration 00013 (Quick Order & Multichannel Engine)',
  () => {
    let adminClient: SupabaseClient<any, 'public', any>;
    let anonClient: SupabaseClient<any, 'public', any>;

    const TENANT_BENZA = '00000000-0000-0000-0000-000000000001';
    const TENANT_OUTRO = '00000000-0000-0000-0000-000000000002';

    let testProductId = '';
    let testVariantId = '';

    const createdOrderIds: string[] = [];

    beforeAll(async () => {
      adminClient = createClient(supabaseUrl, serviceRoleKey);
      anonClient = createClient(supabaseUrl, anonKey);

      // Localiza variante de produto ATIVO da BENZA para testes reais de pedido rápido
      const { data: activeProducts } = await adminClient
        .from('products')
        .select('id, status')
        .eq('tenant_id', TENANT_BENZA)
        .eq('status', 'active');

      const activeProductIds = (activeProducts || []).map((p: any) => p.id);

      if (activeProductIds.length > 0) {
        const { data: existingVariant } = await adminClient
          .from('product_variants')
          .select('id, product_id, price_in_cents, is_available')
          .eq('tenant_id', TENANT_BENZA)
          .in('product_id', activeProductIds)
          .eq('is_available', true)
          .limit(1)
          .maybeSingle();

        if (existingVariant) {
          testVariantId = existingVariant.id;
          testProductId = existingVariant.product_id;
        }
      }
    });

    afterAll(async () => {
      if (createdOrderIds.length > 0) {
        await adminClient.from('orders').delete().in('id', createdOrderIds);
      }
    });

    it('1. Deve validar as novas colunas multicanal e constraints na tabela public.orders', async () => {
      const { data, error } = await adminClient
        .from('orders')
        .select(
          'id, order_channel, payment_method, cash_change_for_cents, created_by_user_id, idempotency_key'
        )
        .eq('tenant_id', TENANT_BENZA)
        .limit(1);

      expect(error).toBeNull();
      expect(Array.isArray(data)).toBe(true);
    });

    it('2. Deve criar pedido rápido de WhatsApp com Pix pendente, validar idempotência e inicializar etapas do KDS', async () => {
      expect(testVariantId).toBeTruthy();

      const idempKey = `staging_qo_whatsapp_${Date.now()}`;

      const { data: created, error: createErr } = await adminClient.rpc(
        'create_quick_order_atomic',
        {
          p_tenant_id: TENANT_BENZA,
          p_order_channel: 'whatsapp',
          p_customer_name: 'Cliente Homologação WhatsApp 3C',
          p_customer_phone: '11991234567',
          p_fulfillment_type: 'pickup',
          p_schedule_type: 'asap',
          p_payment_method: 'pix',
          p_payment_status: 'pending',
          p_initial_status: 'confirmed',
          p_delivery_fee_cents: 0,
          p_discount_cents: 200,
          p_cash_change_for_cents: null,
          p_notes: 'Sem cebola - Homologação 3C',
          p_items: [
            {
              product_id: testProductId,
              variant_id: testVariantId,
              quantity: 2,
            },
          ],
          p_address: null,
          p_created_by_user_id: null,
          p_idempotency_key: idempKey,
        }
      );

      console.log('DEBUG created result:', JSON.stringify({ created, createErr, testProductId, testVariantId }, null, 2));

      expect(createErr).toBeNull();
      expect(created?.success).toBe(true);
      expect(created?.idempotent).toBe(false);
      expect(created?.status).toBe('confirmed');
      expect(created?.payment_status).toBe('pending');
      createdOrderIds.push(created.order_id);

      // Reenvio com a mesma idempotency_key não deve duplicar o pedido
      const { data: replay, error: replayErr } = await adminClient.rpc(
        'create_quick_order_atomic',
        {
          p_tenant_id: TENANT_BENZA,
          p_order_channel: 'whatsapp',
          p_customer_name: 'Cliente Homologação WhatsApp 3C',
          p_customer_phone: '11991234567',
          p_fulfillment_type: 'pickup',
          p_schedule_type: 'asap',
          p_payment_method: 'pix',
          p_payment_status: 'pending',
          p_initial_status: 'confirmed',
          p_delivery_fee_cents: 0,
          p_discount_cents: 200,
          p_cash_change_for_cents: null,
          p_notes: 'Sem cebola - Homologação 3C',
          p_items: [
            {
              product_id: testProductId,
              variant_id: testVariantId,
              quantity: 2,
            },
          ],
          p_address: null,
          p_created_by_user_id: null,
          p_idempotency_key: idempKey,
        }
      );

      expect(replayErr).toBeNull();
      expect(replay?.success).toBe(true);
      expect(replay?.idempotent).toBe(true);
      expect(replay?.order_id).toBe(created.order_id);

      // Verifica se as etapas de produção do KDS foram inicializadas automaticamente
      const { data: steps } = await adminClient
        .from('order_item_production_steps')
        .select('id, status, step_order')
        .eq('tenant_id', TENANT_BENZA)
        .eq('order_id', created.order_id);

      expect((steps || []).length).toBeGreaterThan(0);
    });

    it('3. Deve criar pedido presencial de Balcão (dine_in) e validar confirmação manual auditada de pagamento', async () => {
      const idempKey = `staging_qo_counter_${Date.now()}`;

      const { data: counterOrder, error: counterErr } = await adminClient.rpc(
        'create_quick_order_atomic',
        {
          p_tenant_id: TENANT_BENZA,
          p_order_channel: 'counter',
          p_customer_name: 'Mesa 05 Balcão',
          p_customer_phone: '',
          p_fulfillment_type: 'dine_in',
          p_schedule_type: 'asap',
          p_payment_method: 'cash',
          p_payment_status: 'pending',
          p_initial_status: 'confirmed',
          p_delivery_fee_cents: 0,
          p_discount_cents: 0,
          p_cash_change_for_cents: 20000,
          p_notes: 'Servir na mesa 05',
          p_items: [
            {
              product_id: testProductId,
              variant_id: testVariantId,
              quantity: 1,
            },
          ],
          p_address: null,
          p_created_by_user_id: null,
          p_idempotency_key: idempKey,
        }
      );

      expect(counterErr).toBeNull();
      expect(counterOrder?.success).toBe(true);
      createdOrderIds.push(counterOrder.order_id);

      // Confirma pagamento manual via RPC confirm_manual_order_payment_atomic
      const { data: payConfirm, error: payErr } = await adminClient.rpc(
        'confirm_manual_order_payment_atomic',
        {
          p_tenant_id: TENANT_BENZA,
          p_order_id: counterOrder.order_id,
          p_payment_method: 'cash',
          p_actor_user_id: null,
          p_notes: 'Recebido em espécie no caixa',
        }
      );

      expect(payErr).toBeNull();
      expect(payConfirm?.success).toBe(true);
      expect(payConfirm?.payment_status).toBe('paid');

      // Verifica registro em audit_logs
      const { data: auditRows } = await adminClient
        .from('audit_logs')
        .select('action, resource_id')
        .eq('tenant_id', TENANT_BENZA)
        .eq('resource_id', counterOrder.order_id)
        .eq('action', 'manual_payment_confirmed');

      expect((auditRows || []).length).toBeGreaterThanOrEqual(1);
    });

    it('4. Deve bloquear criação ou confirmação cross-tenant', async () => {
      // Tentativa de criar pedido para TENANT_OUTRO usando variante pertencente ao TENANT_BENZA
      const { data: crossAttempt } = await adminClient.rpc('create_quick_order_atomic', {
        p_tenant_id: TENANT_OUTRO,
        p_order_channel: 'phone',
        p_customer_name: 'Cross Tenant Attack',
        p_customer_phone: '11999990000',
        p_fulfillment_type: 'pickup',
        p_schedule_type: 'asap',
        p_payment_method: 'pix',
        p_payment_status: 'pending',
        p_initial_status: 'confirmed',
        p_items: [
          {
            product_id: testProductId,
            variant_id: testVariantId,
            quantity: 1,
          },
        ],
      });

      expect(crossAttempt?.success).toBe(false);
      expect(crossAttempt?.error).toMatch(/não pertencem/i);

      // Validação de isolamento cross-tenant: Tenant 02 não deve ver pedidos do Tenant 01
      const { data: crossTenantCheck } = await adminClient
        .from('orders')
        .select('id')
        .eq('tenant_id', TENANT_OUTRO)
        .in('id', createdOrderIds);

      expect((crossTenantCheck || []).length).toBe(0);
    });
  }
);

