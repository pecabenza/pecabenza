import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { listKdsOrders } from '@/modules/orders/orders.service';

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
  'Validação Remota — Migration 00011 (Operations Engine, KDS Item Checklist & SLA)',
  () => {
    let adminClient: SupabaseClient<any, 'public', any>;
    let anonClient: SupabaseClient<any, 'public', any>;

    const TENANT_BENZA = '00000000-0000-0000-0000-000000000001';
    const TENANT_CACAU = '00000000-0000-0000-0000-000000000002';

    const createdOrderIds: string[] = [];
    let testOrderId = '';
    let testItemIds: string[] = [];
    let tenant2OrderId = '';
    let tenant2ItemId = '';

    beforeAll(() => {
      adminClient = createClient(supabaseUrl, serviceRoleKey);
      anonClient = createClient(supabaseUrl, anonKey);
    });

    afterAll(async () => {
      if (createdOrderIds.length > 0) {
        await adminClient.from('orders').delete().in('id', createdOrderIds);
      }
    });

    it('1. Deve validar existência das tabelas order_item_operations, order_operation_events e colunas de SLA por tenant', async () => {
      const { error: opsErr } = await adminClient
        .from('order_item_operations')
        .select('id')
        .limit(1);
      expect(opsErr).toBeNull();

      const { error: eventsErr } = await adminClient
        .from('order_operation_events')
        .select('id')
        .limit(1);
      expect(eventsErr).toBeNull();

      const { error: slaErr } = await adminClient
        .from('tenant_commerce_settings')
        .select(
          'target_confirmation_time_min, target_preparation_time_min, sla_warning_buffer_min, schedule_preparation_buffer_min'
        )
        .limit(1);
      expect(slaErr).toBeNull();
    });

    it('2. Deve iniciar preparo real (confirmed -> preparing) com 2 itens, timestamps e evento order_started', async () => {
      const { data: variant } = await adminClient
        .from('product_variants')
        .select('id, product_id, name, price_in_cents')
        .eq('tenant_id', TENANT_BENZA)
        .limit(1)
        .single();

      expect(variant).toBeDefined();
      if (!variant) throw new Error('Variante não encontrada no banco.');

      const { data: created, error: createErr } = await adminClient.rpc(
        'create_order_atomic',
        {
          p_tenant_id: TENANT_BENZA,
          p_customer_name: 'Cliente Homologacao KDS',
          p_customer_phone: '11999990000',
          p_customer_email: 'kds@homolog.local',
          p_fulfillment_type: 'pickup',
          p_schedule_type: 'asap',
          p_scheduled_for: null,
          p_subtotal_cents: variant.price_in_cents * 2,
          p_delivery_fee_cents: 0,
          p_discount_cents: 0,
          p_total_cents: variant.price_in_cents * 2,
          p_currency: 'BRL',
          p_notes: 'Sem cebola na feijoada',
          p_items: [
            {
              product_id: variant.product_id,
              variant_id: variant.id,
              snapshot_product_name: 'Prato KDS 01',
              snapshot_variant_name: variant.name,
              quantity: 1,
              unit_price_cents: variant.price_in_cents,
              subtotal_cents: variant.price_in_cents,
            },
            {
              product_id: variant.product_id,
              variant_id: variant.id,
              snapshot_product_name: 'Prato KDS 02',
              snapshot_variant_name: variant.name,
              quantity: 1,
              unit_price_cents: variant.price_in_cents,
              subtotal_cents: variant.price_in_cents,
            },
          ],
          p_address: null,
        }
      );

      expect(createErr).toBeNull();
      testOrderId = created.order_id;
      createdOrderIds.push(testOrderId);

      // Normaliza status inicial de create_order_atomic ('awaiting_payment' -> 'pending') e avança para 'confirmed'
      await adminClient
        .from('orders')
        .update({ status: 'pending', payment_status: 'paid' })
        .eq('id', testOrderId);

      const { data: confirmRes } = await adminClient.rpc(
        'update_order_status_atomic',
        {
          p_tenant_id: TENANT_BENZA,
          p_order_id: testOrderId,
          p_to_status: 'confirmed',
          p_source: 'admin',
        }
      );
      expect(confirmRes?.success).toBe(true);

      const { data: items } = await adminClient
        .from('order_items')
        .select('id')
        .eq('order_id', testOrderId);
      expect(items).toHaveLength(2);
      testItemIds = (items || []).map((i) => i.id);

      // Inicia preparo via RPC start_order_preparation_atomic
      const { data: startRes, error: startErr } = await adminClient.rpc(
        'start_order_preparation_atomic',
        {
          p_tenant_id: TENANT_BENZA,
          p_order_id: testOrderId,
          p_actor_user_id: null,
        }
      );

      expect(startErr).toBeNull();
      expect(startRes.success).toBe(true);
      expect(startRes.status).toBe('preparing');

      // Confirma order.status atualizado
      const { data: orderAfterStart } = await adminClient
        .from('orders')
        .select('status')
        .eq('id', testOrderId)
        .single();
      expect(orderAfterStart?.status).toBe('preparing');

      // Confirma itens inicializados com started_at
      const { data: itemOps } = await adminClient
        .from('order_item_operations')
        .select('order_item_id, preparation_status, started_at, completed_at')
        .eq('tenant_id', TENANT_BENZA)
        .eq('order_id', testOrderId);

      expect(itemOps).toHaveLength(2);
      expect(
        itemOps?.every(
          (op) =>
            op.preparation_status === 'preparing' &&
            Boolean(op.started_at) &&
            op.completed_at === null
        )
      ).toBe(true);

      // Confirma evento operacional order_started
      const { data: opEvents } = await adminClient
        .from('order_operation_events')
        .select('event_type')
        .eq('tenant_id', TENANT_BENZA)
        .eq('order_id', testOrderId);
      expect(opEvents?.some((e) => e.event_type === 'order_started')).toBe(true);
    });

    it('3. Deve controlar checklist parcial, rejeitar conclusão antecipada e validar concorrência e idempotência', async () => {
      const [item1, item2] = testItemIds;

      // 1. Checklist parcial: marca apenas item 1 como ready
      const { data: op1, error: err1 } = await adminClient.rpc(
        'update_order_item_operation_atomic',
        {
          p_tenant_id: TENANT_BENZA,
          p_order_id: testOrderId,
          p_order_item_id: item1,
          p_to_status: 'ready',
          p_actor_user_id: null,
        }
      );

      expect(err1).toBeNull();
      expect(op1.success).toBe(true);
      expect(op1.ready_items).toBe(1);
      expect(op1.total_items).toBe(2);
      expect(op1.all_items_ready).toBe(false);

      // Confirma que order.status permanece 'preparing'
      const { data: orderStillPrep } = await adminClient
        .from('orders')
        .select('status')
        .eq('id', testOrderId)
        .single();
      expect(orderStillPrep?.status).toBe('preparing');

      // 2. Proteção contra conclusão antecipada: tentar concluir com item 2 pendente -> REJEITADO
      const { data: prematureComplete } = await adminClient.rpc(
        'complete_order_preparation_atomic',
        {
          p_tenant_id: TENANT_BENZA,
          p_order_id: testOrderId,
          p_actor_user_id: null,
        }
      );
      expect(prematureComplete.success).toBe(false);
      expect(prematureComplete.error).toMatch(/pendentes/i);

      // 3. Concorrência e Idempotência: 2 operadores atualizando o mesmo item 2 simultaneamente
      const [concurrentA, concurrentB] = await Promise.all([
        adminClient.rpc('update_order_item_operation_atomic', {
          p_tenant_id: TENANT_BENZA,
          p_order_id: testOrderId,
          p_order_item_id: item2,
          p_to_status: 'ready',
          p_actor_user_id: null,
        }),
        adminClient.rpc('update_order_item_operation_atomic', {
          p_tenant_id: TENANT_BENZA,
          p_order_id: testOrderId,
          p_order_item_id: item2,
          p_to_status: 'ready',
          p_actor_user_id: null,
        }),
      ]);

      expect(concurrentA.error).toBeNull();
      expect(concurrentB.error).toBeNull();
      expect(concurrentA.data.success).toBe(true);
      expect(concurrentB.data.success).toBe(true);
      expect(concurrentA.data.all_items_ready).toBe(true);
      expect(concurrentB.data.all_items_ready).toBe(true);

      // Verifica que foi emitido apenas 1 evento item_ready para o item2 (sem duplicação indevida)
      const { data: item2Events } = await adminClient
        .from('order_operation_events')
        .select('id')
        .eq('order_id', testOrderId)
        .eq('order_item_id', item2)
        .eq('event_type', 'item_ready');
      expect(item2Events).toHaveLength(1);

      // Verifica que order.status AINDA continua 'preparing' até confirmação explícita do operador
      const { data: orderBeforeConfirm } = await adminClient
        .from('orders')
        .select('status')
        .eq('id', testOrderId)
        .single();
      expect(orderBeforeConfirm?.status).toBe('preparing');

      // 4. Operador confirma conclusão: preparing -> ready
      const { data: completeRes, error: completeErr } = await adminClient.rpc(
        'complete_order_preparation_atomic',
        {
          p_tenant_id: TENANT_BENZA,
          p_order_id: testOrderId,
          p_actor_user_id: null,
        }
      );
      expect(completeErr).toBeNull();
      expect(completeRes.success).toBe(true);
      expect(completeRes.to_status).toBe('ready');

      // 5. Repetição idempotente de conclusão de pedido
      const { data: completeDup } = await adminClient.rpc(
        'complete_order_preparation_atomic',
        {
          p_tenant_id: TENANT_BENZA,
          p_order_id: testOrderId,
          p_actor_user_id: null,
        }
      );
      expect(completeDup.success).toBe(true);
      expect(completeDup.idempotent).toBe(true);
    });

    it('4. Deve validar Imutabilidade (UPDATE/DELETE proibidos) e RLS Bidirecional (Tenant 01 x Tenant 02)', async () => {
      const { data: t2Variant } = await adminClient
        .from('product_variants')
        .select('id, product_id, name, price_in_cents')
        .eq('tenant_id', TENANT_CACAU)
        .limit(1)
        .single();

      if (t2Variant) {
        const { data: t2Created } = await adminClient.rpc('create_order_atomic', {
          p_tenant_id: TENANT_CACAU,
          p_customer_name: 'Cliente Cacau KDS',
          p_customer_phone: '11988881111',
          p_customer_email: null,
          p_fulfillment_type: 'pickup',
          p_schedule_type: 'asap',
          p_scheduled_for: null,
          p_subtotal_cents: t2Variant.price_in_cents,
          p_delivery_fee_cents: 0,
          p_discount_cents: 0,
          p_total_cents: t2Variant.price_in_cents,
          p_currency: 'BRL',
          p_notes: null,
          p_items: [
            {
              product_id: t2Variant.product_id,
              variant_id: t2Variant.id,
              snapshot_product_name: 'Bolo Cacau KDS',
              snapshot_variant_name: t2Variant.name,
              quantity: 1,
              unit_price_cents: t2Variant.price_in_cents,
              subtotal_cents: t2Variant.price_in_cents,
            },
          ],
          p_address: null,
        });

        if (t2Created?.order_id) {
          tenant2OrderId = t2Created.order_id;
          createdOrderIds.push(tenant2OrderId);
          const { data: t2Items } = await adminClient
            .from('order_items')
            .select('id')
            .eq('order_id', tenant2OrderId);
          tenant2ItemId = t2Items?.[0]?.id || '';
        }
      }

      // Sentido 1: Tenant 02 tentando manipular item/pedido do Tenant 01 -> REJEITADO
      const { data: crossT2onT1 } = await adminClient.rpc(
        'update_order_item_operation_atomic',
        {
          p_tenant_id: TENANT_CACAU,
          p_order_id: testOrderId,
          p_order_item_id: testItemIds[0],
          p_to_status: 'preparing',
          p_actor_user_id: null,
        }
      );
      expect(crossT2onT1.success).toBe(false);

      // Sentido 2: Tenant 01 tentando manipular item/pedido do Tenant 02 -> REJEITADO
      if (tenant2OrderId && tenant2ItemId) {
        const { data: crossT1onT2Start } = await adminClient.rpc(
          'start_order_preparation_atomic',
          {
            p_tenant_id: TENANT_BENZA,
            p_order_id: tenant2OrderId,
            p_actor_user_id: null,
          }
        );
        expect(crossT1onT2Start.success).toBe(false);

        const { data: crossT1onT2Item } = await adminClient.rpc(
          'update_order_item_operation_atomic',
          {
            p_tenant_id: TENANT_BENZA,
            p_order_id: tenant2OrderId,
            p_order_item_id: tenant2ItemId,
            p_to_status: 'ready',
            p_actor_user_id: null,
          }
        );
        expect(crossT1onT2Item.success).toBe(false);
      }

      // Imutabilidade: UPDATE e DELETE em order_operation_events devem ser rejeitados
      const { data: opEvents } = await adminClient
        .from('order_operation_events')
        .select('id')
        .eq('order_id', testOrderId)
        .limit(1);
      expect(opEvents && opEvents.length).toBeGreaterThan(0);

      const eventId = opEvents![0].id;
      const { error: updateEvErr } = await adminClient
        .from('order_operation_events')
        .update({ event_type: 'sla_warning' })
        .eq('id', eventId);
      expect(updateEvErr).toBeDefined();
      expect(updateEvErr?.message).toContain('imutável');

      const { error: deleteEvErr } = await adminClient
        .from('order_operation_events')
        .delete()
        .eq('id', eventId);
      expect(deleteEvErr).toBeDefined();
      expect(deleteEvErr?.message).toContain('imutável');

      // RLS bloqueia leitura anônima
      const { data: anonOps } = await anonClient
        .from('order_item_operations')
        .select('*');
      expect(anonOps?.length || 0).toBe(0);

      const { data: anonEvents } = await anonClient
        .from('order_operation_events')
        .select('*');
      expect(anonEvents?.length || 0).toBe(0);
    });

    it('5. Deve validar KDS real (listKdsOrders), agendamento distante em hold, ordenação por prioridade e ausência de PII', async () => {
      const { data: variant } = await adminClient
        .from('product_variants')
        .select('id, product_id, name, price_in_cents')
        .eq('tenant_id', TENANT_BENZA)
        .limit(1)
        .single();
      if (!variant) throw new Error('Variante não encontrada.');

      // Cria um pedido agendado para daqui a 4 horas (distante)
      const scheduledFutureIso = new Date(
        Date.now() + 4 * 60 * 60 * 1000
      ).toISOString();
      const { data: schedCreated } = await adminClient.rpc(
        'create_order_atomic',
        {
          p_tenant_id: TENANT_BENZA,
          p_customer_name: 'Fernanda Lima Agendada',
          p_customer_phone: '11977771234',
          p_customer_email: 'fernanda@agendada.local',
          p_fulfillment_type: 'delivery',
          p_schedule_type: 'scheduled',
          p_scheduled_for: scheduledFutureIso,
          p_subtotal_cents: variant.price_in_cents,
          p_delivery_fee_cents: 1200,
          p_discount_cents: 0,
          p_total_cents: variant.price_in_cents + 1200,
          p_currency: 'BRL',
          p_notes: 'Entregar na portaria às 18h',
          p_items: [
            {
              product_id: variant.product_id,
              variant_id: variant.id,
              snapshot_product_name: 'Prato Agendado KDS',
              snapshot_variant_name: variant.name,
              quantity: 1,
              unit_price_cents: variant.price_in_cents,
              subtotal_cents: variant.price_in_cents,
            },
          ],
          p_address: {
            zip_code: '01310-100',
            street: 'Avenida Paulista',
            number: '1000',
            complement: 'Apto 101',
            neighborhood: 'Bela Vista',
            city: 'São Paulo',
            state: 'SP',
            reference: 'Próximo ao metrô',
          },
        }
      );

      const schedOrderId = schedCreated.order_id;
      createdOrderIds.push(schedOrderId);

      // Normaliza status inicial e confirma o pedido agendado
      await adminClient
        .from('orders')
        .update({ status: 'pending', payment_status: 'paid' })
        .eq('id', schedOrderId);

      await adminClient.rpc('update_order_status_atomic', {
        p_tenant_id: TENANT_BENZA,
        p_order_id: schedOrderId,
        p_to_status: 'confirmed',
        p_source: 'admin',
      });

      // Cria também um pedido imediato atrasado (em preparo há 35 minutos)
      const thirtyFiveMinAgo = new Date(Date.now() - 35 * 60 * 1000).toISOString();
      const { data: delayedCreated } = await adminClient.rpc(
        'create_order_atomic',
        {
          p_tenant_id: TENANT_BENZA,
          p_customer_name: 'Carlos Urgente Silva',
          p_customer_phone: '11966665555',
          p_customer_email: null,
          p_fulfillment_type: 'delivery',
          p_schedule_type: 'asap',
          p_scheduled_for: null,
          p_subtotal_cents: variant.price_in_cents,
          p_delivery_fee_cents: 1200,
          p_discount_cents: 0,
          p_total_cents: variant.price_in_cents + 1200,
          p_currency: 'BRL',
          p_notes: 'Cliente com pressa',
          p_items: [
            {
              product_id: variant.product_id,
              variant_id: variant.id,
              snapshot_product_name: 'Prato Urgente KDS',
              snapshot_variant_name: variant.name,
              quantity: 1,
              unit_price_cents: variant.price_in_cents,
              subtotal_cents: variant.price_in_cents,
            },
          ],
          p_address: null,
        }
      );

      const delayedOrderId = delayedCreated.order_id;
      createdOrderIds.push(delayedOrderId);

      await adminClient
        .from('orders')
        .update({
          status: 'preparing',
          payment_status: 'paid',
          created_at: thirtyFiveMinAgo,
          updated_at: thirtyFiveMinAgo,
        })
        .eq('id', delayedOrderId);

      // Consulta o serviço real do KDS contra o Supabase remoto
      const kdsData = await listKdsOrders(TENANT_BENZA);

      expect(kdsData.orders.length).toBeGreaterThanOrEqual(3);
      expect(kdsData.slaConfig.targetPreparationTimeMin).toBeGreaterThan(0);

      const readyCard = kdsData.orders.find((o) => o.id === testOrderId);
      const scheduledCard = kdsData.orders.find((o) => o.id === schedOrderId);
      const delayedCard = kdsData.orders.find((o) => o.id === delayedOrderId);

      expect(readyCard).toBeDefined();
      expect(scheduledCard).toBeDefined();
      expect(delayedCard).toBeDefined();

      // Verifica SLA atrasado
      expect(delayedCard?.sla.state).toBe('delayed');

      // Verifica agendamento e hold operacional
      expect(scheduledCard?.preparationDueAt).toBeDefined();
      expect(scheduledCard?.priority.isScheduledFutureHold).toBe(true);

      // Ordenação por prioridade: Pedido atrasado > Pedido imediato normal > Pedido agendado distante
      expect(delayedCard!.priority.score).toBeGreaterThan(
        readyCard!.priority.score
      );
      expect(readyCard!.priority.score).toBeGreaterThan(
        scheduledCard!.priority.score
      );

      // Verifica ausência de PII desnecessária no card do KDS
      expect(scheduledCard?.customerDisplayName).toBe('Fernanda A.');
      expect('customerPhone' in (scheduledCard as any)).toBe(false);
      expect('customerEmail' in (scheduledCard as any)).toBe(false);
      expect('address' in (scheduledCard as any)).toBe(false);
    });
  }
);
