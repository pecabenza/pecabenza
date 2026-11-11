import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  listKdsOrders,
  getStationKdsQueue,
} from '@/modules/orders/orders.service';

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
  'Validação Remota — Migration 00012 (Multiestação, Etapas Sequenciais, Capacidade e Override Auditado)',
  () => {
    let adminClient: SupabaseClient<any, 'public', any>;
    let anonClient: SupabaseClient<any, 'public', any>;

    const TENANT_BENZA = '00000000-0000-0000-0000-000000000001';
    const TENANT_CACAU = '00000000-0000-0000-0000-000000000002';

    const createdOrderIds: string[] = [];
    const createdProductStepIds: string[] = [];
    const createdProductIds: string[] = [];

    beforeAll(async () => {
      adminClient = createClient(supabaseUrl, serviceRoleKey);
      anonClient = createClient(supabaseUrl, anonKey);

      // Normaliza qualquer variante de teste anterior para unit_type = 'ml' (compatibilidade com 00004)
      await adminClient
        .from('product_variants')
        .update({ unit_type: 'ml' })
        .eq('tenant_id', TENANT_BENZA)
        .neq('unit_type', 'ml');
    });

    afterAll(async () => {
      if (createdProductStepIds.length > 0) {
        await adminClient
          .from('product_production_steps')
          .delete()
          .in('id', createdProductStepIds);
      }
      if (createdOrderIds.length > 0) {
        await adminClient.from('orders').delete().in('id', createdOrderIds);
      }
      if (createdProductIds.length > 0) {
        await adminClient.from('products').delete().in('id', createdProductIds);
      }
    });

    it('1. Deve validar tabelas da migration 00012 (production_stations, product_production_steps, order_item_production_steps) e estações padrão BENZA', async () => {
      const { data: stations, error: stErr } = await adminClient
        .from('production_stations')
        .select('*')
        .eq('tenant_id', TENANT_BENZA)
        .order('display_order', { ascending: true });

      expect(stErr).toBeNull();
      expect(stations && stations.length).toBeGreaterThanOrEqual(3);

      const slugs = (stations || []).map((s) => s.slug);
      expect(slugs).toContain('cozinha-quente');
      expect(slugs).toContain('montagem');
      expect(slugs).toContain('expedicao');

      const { error: prodStepsErr } = await adminClient
        .from('product_production_steps')
        .select('id')
        .limit(1);
      expect(prodStepsErr).toBeNull();

      const { error: itemStepsErr } = await adminClient
        .from('order_item_production_steps')
        .select('id')
        .limit(1);
      expect(itemStepsErr).toBeNull();
    });

    it('2. Deve validar fluxo real Cozinha Quente → Montagem → Expedição com 2 itens, bloqueio de etapas futuras, desbloqueio sequencial e concorrência', async () => {
      const { data: stations } = await adminClient
        .from('production_stations')
        .select('*')
        .eq('tenant_id', TENANT_BENZA)
        .eq('is_active', true)
        .order('display_order', { ascending: true });

      const stCozinha = stations!.find((s) => s.slug === 'cozinha-quente') || stations![0];
      const stMontagem = stations!.find((s) => s.slug === 'montagem') || stations![1];
      const stExpedicao = stations!.find((s) => s.slug === 'expedicao') || stations![2];

      // Cria produto (draft) e variante (unit_type: 'ml') exclusivos para este teste (evita interferência paralela com 00004 e 00011)
      const uniqueSlug = `prato-multiestacao-3b-${Date.now()}`;
      const { data: tempProd, error: prodErr } = await adminClient
        .from('products')
        .insert({
          tenant_id: TENANT_BENZA,
          name: 'Feijoada Multiestação 3B Teste',
          slug: uniqueSlug,
          status: 'draft',
          is_featured: false,
        })
        .select('id')
        .single();
      expect(prodErr).toBeNull();
      createdProductIds.push(tempProd!.id);

      const { data: tempVar, error: varErr } = await adminClient
        .from('product_variants')
        .insert({
          tenant_id: TENANT_BENZA,
          product_id: tempProd!.id,
          name: 'Porção 1000ml 3B',
          unit_type: 'ml',
          unit_value: 1000,
          price_in_cents: 6500,
          is_available: true,
          display_order: 99,
        })
        .select('id, product_id, name, price_in_cents')
        .single();
      expect(varErr).toBeNull();

      const { data: fallbackVariant } = await adminClient
        .from('product_variants')
        .select('id, product_id, name, price_in_cents')
        .eq('tenant_id', TENANT_BENZA)
        .neq('id', tempVar!.id)
        .limit(1)
        .single();

      const v1 = tempVar!;
      const v2 = fallbackVariant || tempVar!;

      // Configura 3 etapas sequenciais para a variante v1: Cozinha Quente -> Montagem -> Expedição
      const { data: cfgSteps, error: cfgErr } = await adminClient
        .from('product_production_steps')
        .insert([
          {
            tenant_id: TENANT_BENZA,
            product_id: v1.product_id,
            variant_id: v1.id,
            station_id: stCozinha.id,
            step_order: 1,
            estimated_duration_seconds: 480,
            capacity_weight: 1,
            is_active: true,
          },
          {
            tenant_id: TENANT_BENZA,
            product_id: v1.product_id,
            variant_id: v1.id,
            station_id: stMontagem.id,
            step_order: 2,
            estimated_duration_seconds: 240,
            capacity_weight: 1,
            is_active: true,
          },
          {
            tenant_id: TENANT_BENZA,
            product_id: v1.product_id,
            variant_id: v1.id,
            station_id: stExpedicao.id,
            step_order: 3,
            estimated_duration_seconds: 120,
            capacity_weight: 1,
            is_active: true,
          },
        ])
        .select('id');

      expect(cfgErr).toBeNull();
      (cfgSteps || []).forEach((s) => createdProductStepIds.push(s.id));

      // Cria pedido real de homologação com 2 itens
      const { data: created } = await adminClient.rpc('create_order_atomic', {
        p_tenant_id: TENANT_BENZA,
        p_customer_name: 'Roberto Multiestacao Silva',
        p_customer_phone: '11999993333',
        p_customer_email: 'roberto@homolog3b.local',
        p_fulfillment_type: 'delivery',
        p_schedule_type: 'asap',
        p_scheduled_for: null,
        p_subtotal_cents: v1.price_in_cents + v2.price_in_cents,
        p_delivery_fee_cents: 1000,
        p_discount_cents: 0,
        p_total_cents: v1.price_in_cents + v2.price_in_cents + 1000,
        p_currency: 'BRL',
        p_notes: 'Sem pimenta na montagem',
        p_items: [
          {
            product_id: v1.product_id,
            variant_id: v1.id,
            snapshot_product_name: 'Feijoada Completa 3B',
            snapshot_variant_name: v1.name,
            quantity: 1,
            unit_price_cents: v1.price_in_cents,
            subtotal_cents: v1.price_in_cents,
          },
          {
            product_id: v2.product_id,
            variant_id: v2.id,
            snapshot_product_name: 'Acompanhamento 3B',
            snapshot_variant_name: v2.name,
            quantity: 1,
            unit_price_cents: v2.price_in_cents,
            subtotal_cents: v2.price_in_cents,
          },
        ],
        p_address: {
          zip_code: '01310-100',
          street: 'Av. Paulista',
          number: '1500',
          complement: 'Conj 12',
          neighborhood: 'Bela Vista',
          city: 'São Paulo',
          state: 'SP',
          reference: null,
        },
      });

      const orderId = created.order_id;
      createdOrderIds.push(orderId);

      await adminClient
        .from('orders')
        .update({ status: 'pending', payment_status: 'paid' })
        .eq('id', orderId);

      await adminClient.rpc('update_order_status_atomic', {
        p_tenant_id: TENANT_BENZA,
        p_order_id: orderId,
        p_to_status: 'confirmed',
        p_source: 'admin',
      });

      // Inicializa etapas de produção
      const { data: initRes } = await adminClient.rpc(
        'initialize_order_production_steps_atomic',
        {
          p_tenant_id: TENANT_BENZA,
          p_order_id: orderId,
          p_actor_user_id: null,
        }
      );
      expect(initRes.success).toBe(true);

      const { data: orderItems } = await adminClient
        .from('order_items')
        .select('id, snapshot_product_name')
        .eq('order_id', orderId)
        .order('created_at', { ascending: true });

      const item1Id = orderItems!.find((i) =>
        i.snapshot_product_name.includes('Feijoada')
      )!.id;
      const item2Id = orderItems!.find((i) =>
        i.snapshot_product_name.includes('Acompanhamento')
      )!.id;

      const { data: item1Steps } = await adminClient
        .from('order_item_production_steps')
        .select('*')
        .eq('order_item_id', item1Id)
        .order('step_order', { ascending: true });

      expect(item1Steps).toHaveLength(3);
      expect(item1Steps![0].status).toBe('pending');
      expect(item1Steps![0].snapshot_station_slug).toBe('cozinha-quente');
      expect(item1Steps![1].status).toBe('blocked');
      expect(item1Steps![1].snapshot_station_slug).toBe('montagem');
      expect(item1Steps![2].status).toBe('blocked');
      expect(item1Steps![2].snapshot_station_slug).toBe('expedicao');

      const [step1, step2, step3] = item1Steps!;

      // 1. Tentativa de iniciar ou concluir Etapa 2 ou 3 bloqueadas -> REJEITADO
      const { data: blockedStart } = await adminClient.rpc(
        'start_production_step_atomic',
        {
          p_tenant_id: TENANT_BENZA,
          p_step_id: step2.id,
          p_actor_user_id: null,
        }
      );
      expect(blockedStart.success).toBe(false);
      expect(blockedStart.error).toContain('bloqueada');

      const { data: blockedComplete } = await adminClient.rpc(
        'complete_production_step_atomic',
        {
          p_tenant_id: TENANT_BENZA,
          p_step_id: step3.id,
          p_actor_user_id: null,
        }
      );
      expect(blockedComplete.success).toBe(false);

      // 2. Concorrência no start da Etapa 1 (Cozinha Quente)
      const [startA, startB] = await Promise.all([
        adminClient.rpc('start_production_step_atomic', {
          p_tenant_id: TENANT_BENZA,
          p_step_id: step1.id,
          p_actor_user_id: null,
        }),
        adminClient.rpc('start_production_step_atomic', {
          p_tenant_id: TENANT_BENZA,
          p_step_id: step1.id,
          p_actor_user_id: null,
        }),
      ]);
      expect(startA.data.success).toBe(true);
      expect(startB.data.success).toBe(true);

      // Verifica que apenas 1 evento station_step_started foi gravado para step1
      const { data: startEvents } = await adminClient
        .from('order_operation_events')
        .select('id, metadata')
        .eq('order_id', orderId)
        .eq('order_item_id', item1Id)
        .eq('event_type', 'station_step_started');
      expect(startEvents).toHaveLength(1);

      // 3. Conclui Etapa 1 (Cozinha Quente) -> desbloqueia Etapa 2 (Montagem), mantendo Etapa 3 (Expedição) bloqueada
      const { data: complete1 } = await adminClient.rpc(
        'complete_production_step_atomic',
        {
          p_tenant_id: TENANT_BENZA,
          p_step_id: step1.id,
          p_actor_user_id: null,
        }
      );
      expect(complete1.success).toBe(true);
      expect(complete1.unlocked_next_step_id).toBe(step2.id);
      expect(complete1.unlocked_station_slug).toBe('montagem');
      expect(complete1.item_ready).toBe(false);

      const { data: step3Check } = await adminClient
        .from('order_item_production_steps')
        .select('status')
        .eq('id', step3.id)
        .single();
      expect(step3Check?.status).toBe('blocked');

      // 4. Concorrência na conclusão da Etapa 2 (Montagem)
      const [comp2A, comp2B] = await Promise.all([
        adminClient.rpc('complete_production_step_atomic', {
          p_tenant_id: TENANT_BENZA,
          p_step_id: step2.id,
          p_actor_user_id: null,
        }),
        adminClient.rpc('complete_production_step_atomic', {
          p_tenant_id: TENANT_BENZA,
          p_step_id: step2.id,
          p_actor_user_id: null,
        }),
      ]);
      expect(comp2A.data.success).toBe(true);
      expect(comp2B.data.success).toBe(true);

      // Etapa 3 (Expedição) agora deve estar 'pending'
      const { data: step3After2 } = await adminClient
        .from('order_item_production_steps')
        .select('status')
        .eq('id', step3.id)
        .single();
      expect(step3After2?.status).toBe('pending');

      // 5. Tentativa de concluir o pedido enquanto Etapa 3 do item 1 e etapas do item 2 estão pendentes -> REJEITADO
      const { data: prematureOrderComplete } = await adminClient.rpc(
        'complete_order_preparation_atomic',
        {
          p_tenant_id: TENANT_BENZA,
          p_order_id: orderId,
          p_actor_user_id: null,
        }
      );
      expect(prematureOrderComplete.success).toBe(false);
      expect(prematureOrderComplete.error).toContain('etapas de produção pendentes');

      // 6. Conclui Etapa 3 do item 1 e todas as etapas do item 2
      const { data: complete3 } = await adminClient.rpc(
        'complete_production_step_atomic',
        {
          p_tenant_id: TENANT_BENZA,
          p_step_id: step3.id,
          p_actor_user_id: null,
        }
      );
      expect(complete3.success).toBe(true);
      expect(complete3.item_ready).toBe(true);

      const { data: item2Steps } = await adminClient
        .from('order_item_production_steps')
        .select('id')
        .eq('order_item_id', item2Id)
        .order('step_order', { ascending: true });

      for (const s2 of item2Steps || []) {
        const { data: resS2 } = await adminClient.rpc(
          'complete_production_step_atomic',
          {
            p_tenant_id: TENANT_BENZA,
            p_step_id: s2.id,
            p_actor_user_id: null,
          }
        );
        expect(resS2.success).toBe(true);
      }

      // Verifica que order.status permanece 'preparing' até confirmação explícita do operador
      const { data: orderBeforeConfirm } = await adminClient
        .from('orders')
        .select('status')
        .eq('id', orderId)
        .single();
      expect(orderBeforeConfirm?.status).toBe('preparing');

      // 7. Confirmação explícita do operador libera o pedido para 'ready'
      const { data: finalOrderReady } = await adminClient.rpc(
        'complete_order_preparation_atomic',
        {
          p_tenant_id: TENANT_BENZA,
          p_order_id: orderId,
          p_actor_user_id: null,
        }
      );
      expect(finalOrderReady.success).toBe(true);
      expect(finalOrderReady.to_status).toBe('ready');
    });

    it('3. Deve validar Override Administrativo Auditado (motivo obrigatório, desbloqueio da etapa seguinte, registro em audit_logs e order_operation_events)', async () => {
      const { data: variant } = await adminClient
        .from('product_variants')
        .select('id, product_id, name, price_in_cents')
        .eq('tenant_id', TENANT_BENZA)
        .limit(1)
        .single();
      if (!variant) throw new Error('Variante não encontrada.');

      const { data: created } = await adminClient.rpc('create_order_atomic', {
        p_tenant_id: TENANT_BENZA,
        p_customer_name: 'Cliente Override Audit',
        p_customer_phone: '11988884444',
        p_customer_email: null,
        p_fulfillment_type: 'pickup',
        p_schedule_type: 'asap',
        p_scheduled_for: null,
        p_subtotal_cents: variant.price_in_cents,
        p_delivery_fee_cents: 0,
        p_discount_cents: 0,
        p_total_cents: variant.price_in_cents,
        p_currency: 'BRL',
        p_notes: null,
        p_items: [
          {
            product_id: variant.product_id,
            variant_id: variant.id,
            snapshot_product_name: 'Prato Override 3B',
            snapshot_variant_name: variant.name,
            quantity: 1,
            unit_price_cents: variant.price_in_cents,
            subtotal_cents: variant.price_in_cents,
          },
        ],
        p_address: null,
      });

      const overrideOrderId = created.order_id;
      createdOrderIds.push(overrideOrderId);

      await adminClient
        .from('orders')
        .update({ status: 'confirmed', payment_status: 'paid' })
        .eq('id', overrideOrderId);

      await adminClient.rpc('initialize_order_production_steps_atomic', {
        p_tenant_id: TENANT_BENZA,
        p_order_id: overrideOrderId,
        p_actor_user_id: null,
      });

      const { data: steps } = await adminClient
        .from('order_item_production_steps')
        .select('*')
        .eq('order_id', overrideOrderId)
        .order('step_order', { ascending: true });

      const firstStep = steps![0];

      // 1. Override sem motivo válido deve ser rejeitado
      const { data: badOverride } = await adminClient.rpc(
        'override_production_step_atomic',
        {
          p_tenant_id: TENANT_BENZA,
          p_step_id: firstStep.id,
          p_action: 'skip',
          p_reason: ' ',
          p_actor_user_id: null,
        }
      );
      expect(badOverride.success).toBe(false);
      expect(badOverride.error).toContain('Motivo obrigatório');

      // 2. Override válido com motivo obrigatório
      const reasonText = 'Forno auxiliar utilizado na bancada 2';
      const { data: goodOverride } = await adminClient.rpc(
        'override_production_step_atomic',
        {
          p_tenant_id: TENANT_BENZA,
          p_step_id: firstStep.id,
          p_action: 'skip',
          p_reason: reasonText,
          p_actor_user_id: null,
        }
      );
      expect(goodOverride.success).toBe(true);
      expect(goodOverride.status).toBe('skipped');
      expect(goodOverride.reason).toBe(reasonText);

      // Se havia segunda etapa bloqueada, ela deve ter sido desbloqueada para 'pending'
      if (steps!.length > 1) {
        const { data: secondStepAfter } = await adminClient
          .from('order_item_production_steps')
          .select('status')
          .eq('id', steps![1].id)
          .single();
        expect(secondStepAfter?.status).toBe('pending');
      }

      // Verifica trilha em order_operation_events
      const { data: opEv } = await adminClient
        .from('order_operation_events')
        .select('event_type, metadata')
        .eq('order_id', overrideOrderId)
        .eq('event_type', 'station_step_skipped')
        .maybeSingle();
      expect(opEv).toBeDefined();
      expect(opEv?.metadata?.reason).toBe(reasonText);

      // Verifica trilha em audit_logs
      const { data: auditEntry } = await adminClient
        .from('audit_logs')
        .select('action, resource_type, resource_id, payload_after')
        .eq('tenant_id', TENANT_BENZA)
        .eq('action', 'kds_step_override')
        .eq('resource_id', firstStep.id)
        .maybeSingle();
      expect(auditEntry).toBeDefined();
      expect(auditEntry?.payload_after?.reason).toBe(reasonText);
    });

    it('4. Deve validar Isolamento Multi-Tenant Bidirecional (Tenant 01 x Tenant 02) e RLS Anônima', async () => {
      // RLS bloqueia leitura anônima das 3 tabelas
      const [{ data: anonSt }, { data: anonProdSteps }, { data: anonItemSteps }] =
        await Promise.all([
          anonClient.from('production_stations').select('*'),
          anonClient.from('product_production_steps').select('*'),
          anonClient.from('order_item_production_steps').select('*'),
        ]);

      expect(anonSt?.length || 0).toBe(0);
      expect(anonProdSteps?.length || 0).toBe(0);
      expect(anonItemSteps?.length || 0).toBe(0);

      // Cria um pedido no Tenant 02 (Cacau) para testar isolamento nos dois sentidos
      const { data: t2Variant } = await adminClient
        .from('product_variants')
        .select('id, product_id, name, price_in_cents')
        .eq('tenant_id', TENANT_CACAU)
        .limit(1)
        .single();

      let t2StepId = '';
      if (t2Variant) {
        const { data: t2Created } = await adminClient.rpc('create_order_atomic', {
          p_tenant_id: TENANT_CACAU,
          p_customer_name: 'Cliente Cacau 3B',
          p_customer_phone: '11977770000',
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
              snapshot_product_name: 'Bolo Cacau 3B',
              snapshot_variant_name: t2Variant.name,
              quantity: 1,
              unit_price_cents: t2Variant.price_in_cents,
              subtotal_cents: t2Variant.price_in_cents,
            },
          ],
          p_address: null,
        });

        const t2OrderId = t2Created.order_id;
        createdOrderIds.push(t2OrderId);

        await adminClient.rpc('initialize_order_production_steps_atomic', {
          p_tenant_id: TENANT_CACAU,
          p_order_id: t2OrderId,
          p_actor_user_id: null,
        });

        const { data: t2Steps } = await adminClient
          .from('order_item_production_steps')
          .select('id')
          .eq('order_id', t2OrderId)
          .limit(1);
        t2StepId = t2Steps?.[0]?.id || '';
      }

      const { data: t1Step } = await adminClient
        .from('order_item_production_steps')
        .select('id')
        .eq('tenant_id', TENANT_BENZA)
        .limit(1)
        .single();

      // Sentido 1: Tenant 02 tentando manipular etapa do Tenant 01 -> REJEITADO
      if (t1Step) {
        const { data: crossT2onT1Start } = await adminClient.rpc(
          'start_production_step_atomic',
          {
            p_tenant_id: TENANT_CACAU,
            p_step_id: t1Step.id,
            p_actor_user_id: null,
          }
        );
        expect(crossT2onT1Start.success).toBe(false);

        const { data: crossT2onT1Override } = await adminClient.rpc(
          'override_production_step_atomic',
          {
            p_tenant_id: TENANT_CACAU,
            p_step_id: t1Step.id,
            p_action: 'skip',
            p_reason: 'Tentativa cross-tenant',
            p_actor_user_id: null,
          }
        );
        expect(crossT2onT1Override.success).toBe(false);
      }

      // Sentido 2: Tenant 01 tentando manipular etapa do Tenant 02 -> REJEITADO
      if (t2StepId) {
        const { data: crossT1onT2Complete } = await adminClient.rpc(
          'complete_production_step_atomic',
          {
            p_tenant_id: TENANT_BENZA,
            p_step_id: t2StepId,
            p_actor_user_id: null,
          }
        );
        expect(crossT1onT2Complete.success).toBe(false);
      }
    });

    it('5. Deve validar getStationKdsQueue e listKdsOrders reais (carga por estação, caminho crítico, expedição e zero PII desnecessária)', async () => {
      const stationQueue = await getStationKdsQueue(
        TENANT_BENZA,
        'cozinha-quente'
      );
      expect(stationQueue.station.slug).toBe('cozinha-quente');
      expect(stationQueue.stationLoad.defaultCapacity).toBeGreaterThanOrEqual(1);
      expect(['normal', 'warning', 'saturated']).toContain(
        stationQueue.stationLoad.saturationState
      );

      const expeditionQueue = await getStationKdsQueue(TENANT_BENZA, 'expedicao');
      expect(expeditionQueue.station.slug).toBe('expedicao');
      expect(Array.isArray(expeditionQueue.expeditionOrders)).toBe(true);

      const kdsGlobal = await listKdsOrders(TENANT_BENZA);
      expect(kdsGlobal.metrics.stationLoads?.length).toBeGreaterThanOrEqual(3);

      for (const order of kdsGlobal.orders) {
        expect(order.criticalPath).toBeDefined();
        expect(order.advancedSla).toBeDefined();
        expect('customerPhone' in (order as any)).toBe(false);
        expect('customerEmail' in (order as any)).toBe(false);
        expect('address' in (order as any)).toBe(false);
      }
    });
  }
);
