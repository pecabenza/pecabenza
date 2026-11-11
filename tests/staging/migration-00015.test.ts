import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  generateDriverAccessToken,
  isDriverTokenActive,
} from '@/modules/delivery/delivery.engine';
import { getPublicOrderTracking } from '@/modules/orders/orders.service';

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
  'Validação Remota — Migration 00015 (Gestão de Entregas, Expedição e Rastreamento)',
  () => {
    let adminClient: SupabaseClient<any, 'public', any>;
    let anonClient: SupabaseClient<any, 'public', any>;

    const TENANT_BENZA = '00000000-0000-0000-0000-000000000001';
    const TENANT_CACAU = '00000000-0000-0000-0000-000000000002';

    const createdDriverIds: string[] = [];
    const createdRunIds: string[] = [];
    const createdOrderIds: string[] = [];
    const createdBatchIds: string[] = [];
    const createdVariantIds: string[] = [];

    beforeAll(() => {
      adminClient = createClient(supabaseUrl, serviceRoleKey);
      anonClient = createClient(supabaseUrl, anonKey);
    });

    afterAll(async () => {
      if (createdOrderIds.length > 0) {
        await adminClient.from('orders').delete().in('id', createdOrderIds);
      }
      if (createdBatchIds.length > 0) {
        await adminClient.from('inventory_batches').delete().in('id', createdBatchIds);
      }
      if (createdVariantIds.length > 0) {
        await adminClient.from('product_variants').delete().in('id', createdVariantIds);
      }
      if (createdRunIds.length > 0) {
        await adminClient.from('delivery_runs').delete().in('id', createdRunIds);
      }
      if (createdDriverIds.length > 0) {
        await adminClient.from('delivery_drivers').delete().in('id', createdDriverIds);
      }
    });

    it('1. Deve validar existência das 6 novas tabelas da migration 00015', async () => {
      const tables = [
        'delivery_drivers',
        'tenant_delivery_counters',
        'delivery_runs',
        'order_deliveries',
        'delivery_events',
        'delivery_location_pings',
      ];

      for (const table of tables) {
        const { error } = await adminClient.from(table).select('*').limit(1);
        expect(error, `Tabela ${table} deve existir`).toBeNull();
      }
    });

    it('2. Deve bloquear acesso anônimo via RLS (incluindo orders/order_addresses legadas) e garantir isolamento cross-tenant', async () => {
      // Bloqueio anônimo direto nas novas tabelas e tabelas legadas de pedidos (LGPD)
      for (const table of [
        'delivery_drivers',
        'delivery_runs',
        'order_deliveries',
        'delivery_events',
        'delivery_location_pings',
        'orders',
        'order_items',
        'order_addresses',
      ]) {
        const { data, error } = await anonClient.from(table).select('*').limit(5);
        // Ou retorna erro de permissão ou array vazio via RLS restrictiva
        expect(Boolean(error) || (Array.isArray(data) && data.length === 0), `Tabela ${table} não deve expor dados a anon`).toBe(true);
      }

      // Bloqueio de INSERT anônimo direto em orders e delivery_drivers
      const { error: anonInsertOrdErr } = await anonClient.from('orders').insert({
        tenant_id: TENANT_BENZA,
        order_number: '#999999',
        customer_name: 'Anon Invasor',
        customer_phone: '11000000000',
        fulfillment_type: 'pickup',
        subtotal_cents: 100,
        total_cents: 100,
      });
      expect(anonInsertOrdErr).not.toBeNull();

      const { error: anonInsertDrvErr } = await anonClient.from('delivery_drivers').insert({
        tenant_id: TENANT_BENZA,
        name: 'Anon Driver',
        phone: '11000000000',
      });
      expect(anonInsertDrvErr).not.toBeNull();

      // Cria entregador no Tenant BENZA
      const { data: driver, error: dErr } = await adminClient
        .from('delivery_drivers')
        .insert({
          tenant_id: TENANT_BENZA,
          name: `Motoboy Teste ${Date.now()}`,
          phone: '11988887777',
          driver_type: 'internal',
          vehicle_type: 'motorcycle',
        })
        .select('*')
        .single();

      expect(dErr).toBeNull();
      createdDriverIds.push(driver.id);

      // Tentativa de Tenant 02 usar entregador do Tenant 01 deve falhar
      const { tokenHash } = generateDriverAccessToken();
      const { data: crossRes } = await adminClient.rpc('dispatch_delivery_run_atomic', {
        p_tenant_id: TENANT_CACAU,
        p_driver_id: driver.id,
        p_order_ids: ['00000000-0000-0000-0000-000000000999'],
        p_driver_token_hash: tokenHash,
      });

      expect(crossRes.success).toBe(false);
    });

    it('3. Deve validar ciclo completo: Despacho -> Progresso -> GPS Consentido -> Comprovante -> Encerramento Automático + Imutabilidade', async () => {
      // Cria entregador BENZA
      const { data: driver } = await adminClient
        .from('delivery_drivers')
        .insert({
          tenant_id: TENANT_BENZA,
          name: `Carlos Teste ${Date.now()}`,
          phone: '11999990001',
          driver_type: 'internal',
          vehicle_type: 'motorcycle',
        })
        .select('*')
        .single();
      createdDriverIds.push(driver.id);

      // Localiza produto e variante da BENZA
      const { data: variant } = await adminClient
        .from('product_variants')
        .select('id, product_id, price_in_cents')
        .eq('tenant_id', TENANT_BENZA)
        .limit(1)
        .single();
      if (!variant) throw new Error('Variante BENZA não encontrada.');

      // Cria pedido delivery em status 'ready'
      const { data: ord } = await adminClient.rpc('create_order_atomic', {
        p_tenant_id: TENANT_BENZA,
        p_customer_name: 'Maria Rastreamento',
        p_customer_phone: '11977776666',
        p_customer_email: null,
        p_fulfillment_type: 'delivery',
        p_schedule_type: 'asap',
        p_scheduled_for: null,
        p_subtotal_cents: variant.price_in_cents,
        p_delivery_fee_cents: 1200,
        p_discount_cents: 0,
        p_total_cents: variant.price_in_cents + 1200,
        p_currency: 'BRL',
        p_notes: 'Teste Etapa 3E',
        p_items: [
          {
            product_id: variant.product_id,
            variant_id: variant.id,
            snapshot_product_name: 'Feijoada Teste 3E',
            snapshot_variant_name: '500ml',
            quantity: 1,
            unit_price_cents: variant.price_in_cents,
            subtotal_cents: variant.price_in_cents,
          },
        ],
        p_address: {
          zip_code: '04077-000',
          street: 'Av. dos Carinás',
          number: '100',
          complement: 'Apto 12',
          neighborhood: 'Moema',
          city: 'São Paulo',
          state: 'SP',
          reference: 'Próximo ao metrô',
        },
      });
      const orderId = ord.order_id;
      createdOrderIds.push(orderId);

      // Coloca pedido em 'ready' via transições válidas
      await adminClient.rpc('update_order_status_atomic', { p_tenant_id: TENANT_BENZA, p_order_id: orderId, p_to_status: 'confirmed', p_source: 'admin' });
      await adminClient.rpc('update_order_status_atomic', { p_tenant_id: TENANT_BENZA, p_order_id: orderId, p_to_status: 'preparing', p_source: 'admin' });
      await adminClient.rpc('update_order_status_atomic', { p_tenant_id: TENANT_BENZA, p_order_id: orderId, p_to_status: 'ready', p_source: 'admin' });

      // Despacha romaneio
      const { tokenHash } = generateDriverAccessToken();
      const { data: dispatchRes, error: dispErr } = await adminClient.rpc('dispatch_delivery_run_atomic', {
        p_tenant_id: TENANT_BENZA,
        p_driver_id: driver.id,
        p_order_ids: [orderId],
        p_driver_token_hash: tokenHash,
        p_token_expires_hours: 12,
        p_route_strategy: 'neighborhood_group',
      });

      expect(dispErr).toBeNull();
      expect(dispatchRes.success).toBe(true);
      createdRunIds.push(dispatchRes.run_id);

      // Pedido deve ter avançado para out_for_delivery e entregador para on_route
      const { data: orderAfterDispatch } = await adminClient
        .from('orders')
        .select('status')
        .eq('id', orderId)
        .single();
      expect(orderAfterDispatch?.status).toBe('out_for_delivery');

      const { data: driverBusy } = await adminClient
        .from('delivery_drivers')
        .select('availability_status')
        .eq('id', driver.id)
        .single();
      expect(driverBusy?.availability_status).toBe('on_route');

      // Localiza order_delivery criada
      const { data: deliveryRow } = await adminClient
        .from('order_deliveries')
        .select('*')
        .eq('order_id', orderId)
        .single();
      expect(deliveryRow?.delivery_status).toBe('assigned');

      // Ping sem consentimento deve ser bloqueado
      const { data: pingRejected } = await adminClient.rpc('record_driver_location_ping_atomic', {
        p_tenant_id: TENANT_BENZA,
        p_run_id: dispatchRes.run_id,
        p_latitude: -23.601234,
        p_longitude: -46.665432,
      });
      expect(pingRejected.success).toBe(false);

      // Consentimento explícito do entregador
      const { data: consentRes } = await adminClient.rpc('toggle_run_location_sharing_atomic', {
        p_tenant_id: TENANT_BENZA,
        p_run_id: dispatchRes.run_id,
        p_enabled: true,
        p_source: 'driver',
      });
      expect(consentRes.success).toBe(true);

      // Ping com consentimento deve ser aceito
      const { data: pingOk } = await adminClient.rpc('record_driver_location_ping_atomic', {
        p_tenant_id: TENANT_BENZA,
        p_run_id: dispatchRes.run_id,
        p_latitude: -23.601234,
        p_longitude: -46.665432,
        p_accuracy_meters: 15,
      });
      expect(pingOk.success).toBe(true);

      // Progresso manual: in_transit -> arrived
      const { data: stepTransit } = await adminClient.rpc('update_delivery_step_atomic', {
        p_tenant_id: TENANT_BENZA,
        p_delivery_id: deliveryRow.id,
        p_to_status: 'in_transit',
        p_source: 'driver',
      });
      expect(stepTransit.success).toBe(true);

      // Fluxo público legítimo durante a rota: token público funciona e expõe localização consentida + nome mascarado
      const { data: orderWithToken } = await adminClient
        .from('orders')
        .select('public_tracking_token')
        .eq('id', orderId)
        .single();
      if (!orderWithToken?.public_tracking_token) throw new Error('Token público do pedido ausente.');

      const publicTrackActive = await getPublicOrderTracking(orderWithToken.public_tracking_token);
      expect(publicTrackActive).not.toBeNull();
      expect(publicTrackActive?.delivery?.status).toBe('in_transit');
      expect(publicTrackActive?.delivery?.liveLocation).not.toBeNull();
      expect(publicTrackActive?.customer.name).toContain('Maria');

      // Comprovante de entrega -> fecha rota, desliga GPS e libera motoboy
      const { data: proofRes } = await adminClient.rpc('confirm_delivery_proof_atomic', {
        p_tenant_id: TENANT_BENZA,
        p_delivery_id: deliveryRow.id,
        p_recipient_name: 'Sr. José Portaria',
        p_relationship: 'concierge',
        p_payment_collected: false,
        p_source: 'driver',
      });
      expect(proofRes.success).toBe(true);
      expect(proofRes.run_completed).toBe(true);

      // Verifica encerramento de localização, expiração do token do entregador, status do pedido e liberação do motoboy
      const { data: runEnded } = await adminClient
        .from('delivery_runs')
        .select('status, location_sharing_enabled, driver_token_expires_at')
        .eq('id', dispatchRes.run_id)
        .single();
      expect(runEnded?.status).toBe('completed');
      expect(runEnded?.location_sharing_enabled).toBe(false);
      expect(
        isDriverTokenActive({
          status: runEnded?.status,
          driver_token_expires_at: runEnded?.driver_token_expires_at,
        }).valid
      ).toBe(false);

      const publicTrackDone = await getPublicOrderTracking(orderWithToken.public_tracking_token);
      expect(publicTrackDone?.delivery?.status).toBe('delivered');
      expect(publicTrackDone?.delivery?.liveLocation).toBeNull();
      expect(publicTrackDone?.delivery?.proofSummary?.recipientName).toBe('Sr. José Portaria');

      const { data: driverFree } = await adminClient
        .from('delivery_drivers')
        .select('availability_status')
        .eq('id', driver.id)
        .single();
      expect(driverFree?.availability_status).toBe('available');

      const { data: orderDelivered } = await adminClient
        .from('orders')
        .select('status')
        .eq('id', orderId)
        .single();
      expect(orderDelivered?.status).toBe('delivered');

      // Ping após conclusão da rota deve ser bloqueado (LGPD)
      const { data: pingAfterEnd } = await adminClient.rpc('record_driver_location_ping_atomic', {
        p_tenant_id: TENANT_BENZA,
        p_run_id: dispatchRes.run_id,
        p_latitude: -23.601234,
        p_longitude: -46.665432,
      });
      expect(pingAfterEnd.success).toBe(false);

      // Imutabilidade de delivery_events (Anti-Tampering)
      const { data: ev } = await adminClient
        .from('delivery_events')
        .select('id')
        .eq('delivery_id', deliveryRow.id)
        .limit(1)
        .single();
      if (!ev) throw new Error('Evento de entrega não encontrado.');

      const { error: updEvErr } = await adminClient
        .from('delivery_events')
        .update({ notes: 'Tentativa adulteração' })
        .eq('id', ev.id);
      expect(updEvErr).not.toBeNull();
    });

    it('4. Deve registrar ocorrência com retorno à loja (returned_to_store) sinalizando quarentena sanitária', async () => {
      const { data: driver } = await adminClient
        .from('delivery_drivers')
        .insert({
          tenant_id: TENANT_BENZA,
          name: `Pedro Retorno ${Date.now()}`,
          phone: '11999990002',
          driver_type: 'freelance',
          vehicle_type: 'motorcycle',
        })
        .select('*')
        .single();
      createdDriverIds.push(driver.id);

      const { data: baseProduct } = await adminClient
        .from('products')
        .select('id')
        .eq('tenant_id', TENANT_BENZA)
        .limit(1)
        .single();
      if (!baseProduct) throw new Error('Produto BENZA não encontrado.');

      const { data: testVariant } = await adminClient
        .from('product_variants')
        .insert({
          tenant_id: TENANT_BENZA,
          product_id: baseProduct.id,
          name: `Variante Retorno 3E ${Date.now()}`,
          sku: `RET3E-${Date.now()}`,
          unit_type: 'un',
          unit_value: 1,
          price_in_cents: 4500,
          is_available: true,
        })
        .select('id, product_id, price_in_cents')
        .single();
      if (!testVariant) throw new Error('Falha ao criar variante de teste.');
      createdVariantIds.push(testVariant.id);

      // Recebe 5 unidades no freezer ativo
      const { data: recBatch } = await adminClient.rpc('record_finished_product_receipt_atomic', {
        p_tenant_id: TENANT_BENZA,
        p_variant_id: testVariant.id,
        p_batch_code: `RET3E-BATCH-${Date.now()}`,
        p_manufacture_date: new Date().toISOString().split('T')[0],
        p_expiration_date: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
        p_quantity: 5,
        p_unit_cost_cents: 1500,
      });
      if (recBatch?.batch_id) createdBatchIds.push(recBatch.batch_id);

      const { data: ord } = await adminClient.rpc('create_order_atomic', {
        p_tenant_id: TENANT_BENZA,
        p_customer_name: 'Cliente Ausente Teste',
        p_customer_phone: '11966665555',
        p_customer_email: null,
        p_fulfillment_type: 'delivery',
        p_schedule_type: 'asap',
        p_scheduled_for: null,
        p_subtotal_cents: testVariant.price_in_cents,
        p_delivery_fee_cents: 1200,
        p_discount_cents: 0,
        p_total_cents: testVariant.price_in_cents + 1200,
        p_currency: 'BRL',
        p_notes: null,
        p_items: [
          {
            product_id: testVariant.product_id,
            variant_id: testVariant.id,
            snapshot_product_name: 'Lasanha Retorno 3E',
            snapshot_variant_name: '500ml',
            quantity: 1,
            unit_price_cents: testVariant.price_in_cents,
            subtotal_cents: testVariant.price_in_cents,
          },
        ],
        p_address: {
          zip_code: '04101-000',
          street: 'Rua Vergueiro',
          number: '1500',
          complement: null,
          neighborhood: 'Vila Mariana',
          city: 'São Paulo',
          state: 'SP',
          reference: null,
        },
      });
      createdOrderIds.push(ord.order_id);

      await adminClient.rpc('update_order_status_atomic', { p_tenant_id: TENANT_BENZA, p_order_id: ord.order_id, p_to_status: 'confirmed', p_source: 'admin' });
      await adminClient.rpc('reserve_order_inventory_atomic', { p_tenant_id: TENANT_BENZA, p_order_id: ord.order_id });
      await adminClient.rpc('update_order_status_atomic', { p_tenant_id: TENANT_BENZA, p_order_id: ord.order_id, p_to_status: 'preparing', p_source: 'admin' });
      await adminClient.rpc('update_order_status_atomic', { p_tenant_id: TENANT_BENZA, p_order_id: ord.order_id, p_to_status: 'ready', p_source: 'admin' });

      const { tokenHash } = generateDriverAccessToken();
      const { data: disp } = await adminClient.rpc('dispatch_delivery_run_atomic', {
        p_tenant_id: TENANT_BENZA,
        p_driver_id: driver.id,
        p_order_ids: [ord.order_id],
        p_driver_token_hash: tokenHash,
      });
      createdRunIds.push(disp.run_id);

      // Idempotência: segunda baixa não reduz novamente o lote ativo (deve permanecer 4)
      await adminClient.rpc('commit_order_inventory_deduction_atomic', {
        p_tenant_id: TENANT_BENZA,
        p_order_id: ord.order_id,
      });

      const { data: batchAfterDispatch } = await adminClient
        .from('inventory_batches')
        .select('current_quantity')
        .eq('id', recBatch.batch_id)
        .single();
      expect(Number(batchAfterDispatch?.current_quantity)).toBe(4);

      const { data: deliveryRow } = await adminClient
        .from('order_deliveries')
        .select('id')
        .eq('order_id', ord.order_id)
        .single();
      if (!deliveryRow) throw new Error('Entrega não encontrada.');

      const { data: failRes } = await adminClient.rpc('record_delivery_failure_atomic', {
        p_tenant_id: TENANT_BENZA,
        p_delivery_id: deliveryRow.id,
        p_failure_reason: 'Cliente ausente; produto retornando no baú térmico para inspeção',
        p_action: 'returned_to_store',
        p_source: 'driver',
      });

      expect(failRes.success).toBe(true);
      expect(failRes.new_status).toBe('returned_to_store');
      expect(failRes.sanitary_quarantine_required).toBe(true);
      expect(failRes.run_completed).toBe(true);

      // Garante que o lote congelado NÃO foi reintegrado automaticamente ao estoque ativo (permanece 4)
      const { data: batchAfterReturn } = await adminClient
        .from('inventory_batches')
        .select('current_quantity')
        .eq('id', recBatch.batch_id)
        .single();
      expect(Number(batchAfterReturn?.current_quantity)).toBe(4);
    });
  }
);

