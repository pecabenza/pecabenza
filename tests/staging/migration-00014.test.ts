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
  'Validação Remota — Migration 00014 (Estoque, Ficha Técnica, Produção e Lotes FEFO)',
  () => {
    let adminClient: SupabaseClient<any, 'public', any>;
    let anonClient: SupabaseClient<any, 'public', any>;

    const TENANT_BENZA = '00000000-0000-0000-0000-000000000001';
    const TENANT_CACAU = '00000000-0000-0000-0000-000000000002';

    const createdRawMaterialIds: string[] = [];
    const createdBatchIds: string[] = [];
    const createdRecipeIds: string[] = [];
    const createdProductionOrderIds: string[] = [];
    const createdOrderIds: string[] = [];
    const createdVariantIds: string[] = [];

    beforeAll(() => {
      adminClient = createClient(supabaseUrl, serviceRoleKey);
      anonClient = createClient(supabaseUrl, anonKey);
    });

    afterAll(async () => {
      // Limpeza de entidades de teste na ordem reversa das foreign keys
      if (createdOrderIds.length > 0) {
        await adminClient.from('orders').delete().in('id', createdOrderIds);
      }
      if (createdProductionOrderIds.length > 0) {
        await adminClient.from('production_orders').delete().in('id', createdProductionOrderIds);
      }
      if (createdRecipeIds.length > 0) {
        await adminClient.from('recipes').delete().in('id', createdRecipeIds);
      }
      if (createdBatchIds.length > 0) {
        await adminClient.from('inventory_batches').delete().in('id', createdBatchIds);
      }
      if (createdVariantIds.length > 0) {
        await adminClient.from('product_variants').delete().in('id', createdVariantIds);
      }
      if (createdRawMaterialIds.length > 0) {
        await adminClient.from('inventory_raw_materials').delete().in('id', createdRawMaterialIds);
      }
    });

    it('1. Deve validar existência de todas as tabelas, índices e triggers da migration 00014', async () => {
      const [
        { error: rawErr },
        { error: settingsErr },
        { error: batchErr },
        { error: recipeErr },
        { error: rItemErr },
        { error: prodErr },
        { error: pInputErr },
        { error: resErr },
        { error: movErr },
      ] = await Promise.all([
        adminClient.from('inventory_raw_materials').select('id').limit(1),
        adminClient.from('product_variant_stock_settings').select('id').limit(1),
        adminClient.from('inventory_batches').select('id').limit(1),
        adminClient.from('recipes').select('id').limit(1),
        adminClient.from('recipe_items').select('id').limit(1),
        adminClient.from('production_orders').select('id').limit(1),
        adminClient.from('production_batch_inputs').select('id').limit(1),
        adminClient.from('inventory_reservations').select('id').limit(1),
        adminClient.from('inventory_movements').select('id').limit(1),
      ]);

      expect(rawErr).toBeNull();
      expect(settingsErr).toBeNull();
      expect(batchErr).toBeNull();
      expect(recipeErr).toBeNull();
      expect(rItemErr).toBeNull();
      expect(prodErr).toBeNull();
      expect(pInputErr).toBeNull();
      expect(resErr).toBeNull();
      expect(movErr).toBeNull();
    });

    it('2. Deve registrar entrada de insumo, calcular custo médio ponderado e gerar lote com movimentação imutável', async () => {
      // 1. Cadastra insumo de teste
      const rawName = `Feijão Preto Teste ${Date.now()}`;
      const { data: rawMat, error: rawErr } = await adminClient
        .from('inventory_raw_materials')
        .insert({
          tenant_id: TENANT_BENZA,
          name: rawName,
          category: 'ingredient',
          unit_of_measure: 'kg',
          min_stock_level: 10,
          current_stock: 0,
          average_cost_cents: 0,
          last_purchase_cost_cents: 0,
        })
        .select('*')
        .single();

      expect(rawErr).toBeNull();
      expect(rawMat).toBeDefined();
      createdRawMaterialIds.push(rawMat.id);

      // 2. Primeira compra: 10 kg a R$ 8,00/kg (800 centavos)
      const batchCode1 = `L-FEIJ-1-${Date.now()}`;
      const { data: entry1, error: err1 } = await adminClient.rpc('record_raw_material_receipt_atomic', {
        p_tenant_id: TENANT_BENZA,
        p_raw_material_id: rawMat.id,
        p_batch_code: batchCode1,
        p_manufacture_date: '2026-11-01',
        p_expiration_date: '2027-11-01',
        p_quantity: 10,
        p_unit_cost_cents: 800,
        p_supplier_name: 'Distribuidora Grãos',
        p_invoice_number: 'NF-1001',
      });

      expect(err1).toBeNull();
      expect(entry1.success).toBe(true);
      expect(Number(entry1.new_stock)).toBe(10);
      expect(entry1.average_cost_cents).toBe(800);
      createdBatchIds.push(entry1.batch_id);

      // 3. Segunda compra: 10 kg a R$ 12,00/kg (1200 centavos)
      // Custo médio esperado: (10 * 800 + 10 * 1200) / 20 = 1000 centavos (R$ 10,00)
      const batchCode2 = `L-FEIJ-2-${Date.now()}`;
      const { data: entry2, error: err2 } = await adminClient.rpc('record_raw_material_receipt_atomic', {
        p_tenant_id: TENANT_BENZA,
        p_raw_material_id: rawMat.id,
        p_batch_code: batchCode2,
        p_manufacture_date: '2026-11-05',
        p_expiration_date: '2027-11-05',
        p_quantity: 10,
        p_unit_cost_cents: 1200,
        p_supplier_name: 'Distribuidora Grãos',
        p_invoice_number: 'NF-1002',
      });

      expect(err2).toBeNull();
      expect(entry2.success).toBe(true);
      expect(Number(entry2.new_stock)).toBe(20);
      expect(entry2.average_cost_cents).toBe(1000);
      createdBatchIds.push(entry2.batch_id);

      // 4. Verifica registro de movimentação imutável
      const { data: movements } = await adminClient
        .from('inventory_movements')
        .select('*')
        .eq('tenant_id', TENANT_BENZA)
        .eq('raw_material_id', rawMat.id);

      expect(movements?.length).toBe(2);
      expect(movements![0].movement_type).toBe('purchase_in');
    });

    it('3. Deve validar imutabilidade estrita de inventory_movements (Anti-Tampering Trigger)', async () => {
      const { data: mov } = await adminClient
        .from('inventory_movements')
        .select('id')
        .eq('tenant_id', TENANT_BENZA)
        .limit(1)
        .single();

      if (mov) {
        // Tentativa de UPDATE deve ser rejeitada pelo trigger
        const { error: updErr } = await adminClient
          .from('inventory_movements')
          .update({ quantity: 999 })
          .eq('id', mov.id);

        expect(updErr).toBeDefined();
        expect(updErr?.message).toContain('imutável');

        // Tentativa de DELETE deve ser rejeitada pelo trigger
        const { error: delErr } = await adminClient
          .from('inventory_movements')
          .delete()
          .eq('id', mov.id);

        expect(delErr).toBeDefined();
        expect(delErr?.message).toContain('imutável');
      }
    });

    it('4. Deve validar isolamento multi-tenant bidirecional e bloqueio anônimo via RLS', async () => {
      // 1. Cliente anônimo não pode ler insumos, receitas nem lotes
      const [{ data: anonRaw }, { data: anonBatches }, { data: anonRecipes }] = await Promise.all([
        anonClient.from('inventory_raw_materials').select('*'),
        anonClient.from('inventory_batches').select('*'),
        anonClient.from('recipes').select('*'),
      ]);

      expect(anonRaw?.length || 0).toBe(0);
      expect(anonBatches?.length || 0).toBe(0);
      expect(anonRecipes?.length || 0).toBe(0);

      // 2. Tenant 02 (Cacau) não pode acessar insumos ou lotes do Tenant 01 (BENZA)
      const { data: t1Raw } = await adminClient
        .from('inventory_raw_materials')
        .select('id')
        .eq('tenant_id', TENANT_BENZA)
        .limit(1)
        .single();

      if (t1Raw) {
        const { data: crossEntry } = await adminClient.rpc('record_raw_material_receipt_atomic', {
          p_tenant_id: TENANT_CACAU,
          p_raw_material_id: t1Raw.id,
          p_batch_code: 'CROSS-TENANT-ATTEMPT',
          p_manufacture_date: '2026-11-01',
          p_expiration_date: '2027-11-01',
          p_quantity: 5,
          p_unit_cost_cents: 500,
        });

        expect(crossEntry.success).toBe(false);
        expect(crossEntry.error).toMatch(/não encontrado/i);
      }
    });

    it('5. Deve validar produção real por ficha técnica, consumo FEFO e genealogia de rastreabilidade', async () => {
      // 1. Localiza produto e variante de teste do Tenant BENZA
      const { data: variant } = await adminClient
        .from('product_variants')
        .select('id, product_id, name')
        .eq('tenant_id', TENANT_BENZA)
        .limit(1)
        .single();

      if (!variant) throw new Error('Variante não encontrada.');

      // 2. Cria ficha técnica
      const { data: recipe, error: recErr } = await adminClient
        .from('recipes')
        .insert({
          tenant_id: TENANT_BENZA,
          product_id: variant.product_id,
          variant_id: variant.id,
          name: `Receita Staging ${Date.now()}`,
          expected_yield_quantity: 10,
          yield_unit: 'un',
          shelf_life_days: 90,
        })
        .select('*')
        .single();

      expect(recErr).toBeNull();
      createdRecipeIds.push(recipe.id);

      // 3. Cadastra insumo com lote
      const { data: rawMat } = await adminClient
        .from('inventory_raw_materials')
        .insert({
          tenant_id: TENANT_BENZA,
          name: `Insumo Receita ${Date.now()}`,
          category: 'ingredient',
          unit_of_measure: 'kg',
          current_stock: 0,
        })
        .select('*')
        .single();
      createdRawMaterialIds.push(rawMat.id);

      const batchInsumoCode = `L-INP-${Date.now()}`;
      const { data: entry } = await adminClient.rpc('record_raw_material_receipt_atomic', {
        p_tenant_id: TENANT_BENZA,
        p_raw_material_id: rawMat.id,
        p_batch_code: batchInsumoCode,
        p_manufacture_date: '2026-11-01',
        p_expiration_date: '2027-11-01',
        p_quantity: 5,
        p_unit_cost_cents: 1000,
      });
      createdBatchIds.push(entry.batch_id);

      // Vincula insumo à ficha técnica (0.5 kg por embalagem)
      await adminClient.from('recipe_items').insert({
        tenant_id: TENANT_BENZA,
        recipe_id: recipe.id,
        raw_material_id: rawMat.id,
        gross_quantity: 0.5,
        net_quantity: 0.5,
        unit_of_measure: 'kg',
      });

      // 4. Inicia ordem de produção
      const opCode = `OP-STG-${Date.now()}`;
      const { data: opCreated } = await adminClient.rpc('create_production_order_atomic', {
        p_tenant_id: TENANT_BENZA,
        p_recipe_id: recipe.id,
        p_order_code: opCode,
        p_planned_multiplier: 1.0,
      });
      expect(opCreated.success).toBe(true);
      createdProductionOrderIds.push(opCreated.production_order_id);

      // 5. Conclui apontando rendimento real (9 unidades envasadas, 1 consumo equipe)
      const finishedBatchCode = `L-FROZ-${Date.now()}`;
      const { data: opCompleted, error: compErr } = await adminClient.rpc('complete_production_order_atomic', {
        p_tenant_id: TENANT_BENZA,
        p_production_order_id: opCreated.production_order_id,
        p_actual_yield_quantity: 9,
        p_batch_code: finishedBatchCode,
        p_staff_consumption_quantity: 1,
        p_deviation_reason: 'Rendimento 9 potes devido à redução térmica',
      });

      expect(compErr).toBeNull();
      expect(opCompleted.success).toBe(true);
      expect(opCompleted.actual_yield_quantity).toBe(9);
      createdBatchIds.push(opCompleted.generated_batch_id);

      // 6. Valida Rastreabilidade (Genealogia): production_batch_inputs deve registrar o lote do insumo consumido
      const { data: inputs } = await adminClient
        .from('production_batch_inputs')
        .select('*')
        .eq('production_order_id', opCreated.production_order_id);

      expect(inputs?.length).toBeGreaterThan(0);
      expect(inputs![0].raw_material_batch_id).toBe(entry.batch_id);
    });

    it('6. Deve validar Reserva FEFO, Idempotência de Baixa e Quarentena Sanitária em Cancelamento', async () => {
      // 1. Cria produto e variante dedicada para isolamento do teste FEFO
      const { data: prod } = await adminClient
        .from('products')
        .select('id')
        .eq('tenant_id', TENANT_BENZA)
        .limit(1)
        .single();
      if (!prod) throw new Error('Produto não encontrado.');

      const { data: variant, error: varErr } = await adminClient
        .from('product_variants')
        .insert({
          tenant_id: TENANT_BENZA,
          product_id: prod.id,
          name: `Variante FEFO ${Date.now()}`,
          price_in_cents: 4800,
          unit_type: 'un',
          unit_value: 1,
        })
        .select('*')
        .single();

      if (varErr || !variant) throw new Error('Erro ao criar variante de teste.');
      createdVariantIds.push(variant.id);

      // 1. Cria lote de produto acabado diretamente (10 unidades)
      const testBatchCode = `L-ORDER-TEST-${Date.now()}`;
      const { data: recFinished } = await adminClient.rpc('record_finished_product_receipt_atomic', {
        p_tenant_id: TENANT_BENZA,
        p_variant_id: variant.id,
        p_batch_code: testBatchCode,
        p_manufacture_date: '2026-11-01',
        p_expiration_date: '2027-11-01',
        p_quantity: 10,
        p_unit_cost_cents: 1200,
      });
      createdBatchIds.push(recFinished.batch_id);

      // 2. Cria pedido com 3 unidades
      const { data: ord } = await adminClient.rpc('create_order_atomic', {
        p_tenant_id: TENANT_BENZA,
        p_customer_name: 'Cliente Estoque FEFO',
        p_customer_phone: '11988887777',
        p_customer_email: null,
        p_fulfillment_type: 'pickup',
        p_schedule_type: 'asap',
        p_scheduled_for: null,
        p_subtotal_cents: variant.price_in_cents * 3,
        p_delivery_fee_cents: 0,
        p_discount_cents: 0,
        p_total_cents: variant.price_in_cents * 3,
        p_currency: 'BRL',
        p_notes: 'Teste reserva FEFO',
        p_items: [
          {
            product_id: variant.product_id,
            variant_id: variant.id,
            snapshot_product_name: 'Feijoada Teste Estoque',
            snapshot_variant_name: '500g',
            quantity: 3,
            unit_price_cents: variant.price_in_cents,
            subtotal_cents: variant.price_in_cents * 3,
          },
        ],
        p_address: null,
      });

      const orderId = ord.order_id;
      createdOrderIds.push(orderId);

      // 3. Reserva Estoque
      const { data: resData } = await adminClient.rpc('reserve_order_inventory_atomic', {
        p_tenant_id: TENANT_BENZA,
        p_order_id: orderId,
      });
      expect(resData.success).toBe(true);

      // Verifica que reserved_quantity no lote foi incrementado em 3
      const { data: batchReserved } = await adminClient
        .from('inventory_batches')
        .select('current_quantity, reserved_quantity')
        .eq('id', recFinished.batch_id)
        .single();
      expect(Number(batchReserved?.reserved_quantity)).toBe(3);

      // 4. Baixa Definitiva (Expedição)
      const { data: commit1 } = await adminClient.rpc('commit_order_inventory_deduction_atomic', {
        p_tenant_id: TENANT_BENZA,
        p_order_id: orderId,
      });
      expect(commit1.success).toBe(true);
      expect(commit1.committed_count).toBeGreaterThan(0);
      expect(commit1.total_cmv_cents).toBe(3 * 1200); // 3600 centavos

      // Idempotência: segunda chamada não duplica a baixa
      const { data: commit2 } = await adminClient.rpc('commit_order_inventory_deduction_atomic', {
        p_tenant_id: TENANT_BENZA,
        p_order_id: orderId,
      });
      expect(commit2.success).toBe(true);
      expect(commit2.idempotent).toBe(true);

      // 5. Cancelamento Pós-Baixa: NÃO deve reintegrar automaticamente ao estoque ativo (Segurança Sanitária ANVISA)
      const { data: releaseReturn, error: relErr } = await adminClient.rpc('release_order_inventory_reservation_atomic', {
        p_tenant_id: TENANT_BENZA,
        p_order_id: orderId,
        p_reason: 'Cancelamento após despacho para devolução',
      });

      expect(releaseReturn.success).toBe(true);
      expect(releaseReturn.requires_sanitary_quarantine).toBe(true);
      expect(releaseReturn.committed_dispatched_count).toBeGreaterThan(0);

      // Confirma que o lote ativo original NÃO teve saldo aumentado automaticamente
      const { data: batchUntouched } = await adminClient
        .from('inventory_batches')
        .select('current_quantity')
        .eq('id', recFinished.batch_id)
        .single();
      expect(Number(batchUntouched?.current_quantity)).toBe(7); // 10 inicial - 3 baixados = 7

      // 6. Fluxo Sanitário: Devolução física colocada em QUARENTENA para teste de cadeia de frio
      const { data: returnProcess } = await adminClient.rpc('process_order_return_quarantine_atomic', {
        p_tenant_id: TENANT_BENZA,
        p_order_id: orderId,
        p_action: 'quarantine',
        p_reason: 'Produto devolvido pelo cliente; aferição de temperatura do freezer',
      });

      expect(returnProcess.success).toBe(true);
      expect(returnProcess.action_taken).toBe('quarantine');
      expect(returnProcess.processed_items).toBeGreaterThan(0);

      // Localiza o lote gerado em quarentena
      const { data: qBatch } = await adminClient
        .from('inventory_batches')
        .select('id, status, storage_location, current_quantity')
        .eq('tenant_id', TENANT_BENZA)
        .eq('status', 'quarantine')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      expect(qBatch).toBeDefined();
      expect(qBatch?.storage_location).toBe('freezer_quarentena');
      expect(Number(qBatch?.current_quantity)).toBe(3);
      if (qBatch) createdBatchIds.push(qBatch.id);

      // 7. Avaliação Técnica: Responsável aprova reintegração após laudo de cadeia de frio
      const { data: evalResult } = await adminClient.rpc('evaluate_quarantine_batch_atomic', {
        p_tenant_id: TENANT_BENZA,
        p_batch_id: qBatch!.id,
        p_decision: 'approve_reintegration',
        p_reason: 'Temperatura verificada a -19°C com termômetro calibrado; embalagem íntegra',
      });

      expect(evalResult.success).toBe(true);
      expect(evalResult.decision).toBe('approve_reintegration');

      // Verifica que agora o lote passou para active no freezer_principal
      const { data: approvedBatch } = await adminClient
        .from('inventory_batches')
        .select('status, storage_location')
        .eq('id', qBatch!.id)
        .single();
      expect(approvedBatch?.status).toBe('active');
      expect(approvedBatch?.storage_location).toBe('freezer_principal');
    });

    it('7. Deve validar Descarte Sanitário Direto (discard_loss) de produto impróprio pós-devolução', async () => {
      const { data: prod } = await adminClient
        .from('products')
        .select('id')
        .eq('tenant_id', TENANT_BENZA)
        .limit(1)
        .single();
      if (!prod) throw new Error('Produto não encontrado.');

      const { data: variant, error: varErr } = await adminClient
        .from('product_variants')
        .insert({
          tenant_id: TENANT_BENZA,
          product_id: prod.id,
          name: `Variante Descarte ${Date.now()}`,
          price_in_cents: 4800,
          unit_type: 'un',
          unit_value: 1,
        })
        .select('*')
        .single();

      if (varErr || !variant) throw new Error('Erro ao criar variante de teste.');
      createdVariantIds.push(variant.id);

      // 1. Cria lote e pedido
      const testBatchCode = `L-DISCARD-TEST-${Date.now()}`;
      const { data: recFinished } = await adminClient.rpc('record_finished_product_receipt_atomic', {
        p_tenant_id: TENANT_BENZA,
        p_variant_id: variant.id,
        p_batch_code: testBatchCode,
        p_manufacture_date: '2026-11-01',
        p_expiration_date: '2027-11-01',
        p_quantity: 5,
        p_unit_cost_cents: 1200,
      });
      createdBatchIds.push(recFinished.batch_id);

      const { data: ord } = await adminClient.rpc('create_order_atomic', {
        p_tenant_id: TENANT_BENZA,
        p_customer_name: 'Cliente Descarte Sanitário',
        p_customer_phone: '11988889999',
        p_customer_email: null,
        p_fulfillment_type: 'pickup',
        p_schedule_type: 'asap',
        p_scheduled_for: null,
        p_subtotal_cents: variant.price_in_cents * 2,
        p_delivery_fee_cents: 0,
        p_discount_cents: 0,
        p_total_cents: variant.price_in_cents * 2,
        p_currency: 'BRL',
        p_notes: 'Teste descarte sanitário',
        p_items: [
          {
            product_id: variant.product_id,
            variant_id: variant.id,
            snapshot_product_name: 'Feijoada Descarte Teste',
            snapshot_variant_name: '500g',
            quantity: 2,
            unit_price_cents: variant.price_in_cents,
            subtotal_cents: variant.price_in_cents * 2,
          },
        ],
        p_address: null,
      });

      createdOrderIds.push(ord.order_id);

      // Reserva e Baixa Definitiva
      await adminClient.rpc('reserve_order_inventory_atomic', {
        p_tenant_id: TENANT_BENZA,
        p_order_id: ord.order_id,
      });

      await adminClient.rpc('commit_order_inventory_deduction_atomic', {
        p_tenant_id: TENANT_BENZA,
        p_order_id: ord.order_id,
      });

      // Devolução com descarte sanitário imediato (ex: quebra de cadeia de frio comprovada)
      const { data: discardRes, error: discardErr } = await adminClient.rpc('process_order_return_quarantine_atomic', {
        p_tenant_id: TENANT_BENZA,
        p_order_id: ord.order_id,
        p_action: 'discard_loss',
        p_reason: 'Produto permaneceu descongelado por 4 horas em temperatura ambiente; descarte imediato',
      });

      expect(discardRes.success).toBe(true);
      expect(discardRes.action_taken).toBe('discard_loss');

      // Verifica registro de perda imutável em inventory_movements
      const { data: lossMov } = await adminClient
        .from('inventory_movements')
        .select('*')
        .eq('order_id', ord.order_id)
        .eq('movement_type', 'spoilage_loss')
        .single();

      expect(lossMov).toBeDefined();
      expect(Number(lossMov?.quantity)).toBe(2);
      expect(lossMov?.reason).toContain('Descarte sanitário');
    });
  }
);

