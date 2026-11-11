import { createAdminClient } from '@/lib/supabase/admin';
import type {
  RawMaterial,
  ProductVariantStockSetting,
  InventoryBatch,
  Recipe,
  RecipeItem,
  ProductionOrder,
  ProductionBatchInput,
  InventoryMovement,
  InventoryDashboardKPIs,
  RawMaterialCategory,
  UnitOfMeasure,
} from './inventory.types';

// ==============================================================================
// 1. INSUMOS E EMBALAGENS (Raw Materials)
// ==============================================================================

export async function listRawMaterials(
  tenantId: string,
  options?: { category?: string; activeOnly?: boolean }
): Promise<RawMaterial[]> {
  const supabase = createAdminClient();
  let query = supabase
    .from('inventory_raw_materials')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('name', { ascending: true });

  if (options?.category) {
    query = query.eq('category', options.category);
  }
  if (options?.activeOnly) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Erro ao listar insumos: ${error.message}`);
  }

  return (data || []).map((row: any) => ({
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    sku: row.sku,
    category: row.category,
    unitOfMeasure: row.unit_of_measure,
    minStockLevel: Number(row.min_stock_level),
    currentStock: Number(row.current_stock),
    averageCostCents: row.average_cost_cents,
    lastPurchaseCostCents: row.last_purchase_cost_cents,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function createRawMaterial(
  tenantId: string,
  input: {
    name: string;
    sku?: string | null;
    category: RawMaterialCategory;
    unitOfMeasure: UnitOfMeasure;
    minStockLevel?: number;
  }
): Promise<RawMaterial> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('inventory_raw_materials')
    .insert({
      tenant_id: tenantId,
      name: input.name.trim(),
      sku: input.sku?.trim() || null,
      category: input.category,
      unit_of_measure: input.unitOfMeasure,
      min_stock_level: input.minStockLevel || 0,
      current_stock: 0,
      average_cost_cents: 0,
      last_purchase_cost_cents: 0,
      is_active: true,
    })
    .select('*')
    .single();

  if (error) {
    throw new Error(`Erro ao criar insumo: ${error.message}`);
  }

  return {
    id: data.id,
    tenantId: data.tenant_id,
    name: data.name,
    sku: data.sku,
    category: data.category,
    unitOfMeasure: data.unit_of_measure,
    minStockLevel: Number(data.min_stock_level),
    currentStock: Number(data.current_stock),
    averageCostCents: data.average_cost_cents,
    lastPurchaseCostCents: data.last_purchase_cost_cents,
    isActive: data.is_active,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

export async function updateRawMaterial(
  tenantId: string,
  id: string,
  input: {
    name?: string;
    sku?: string | null;
    category?: RawMaterialCategory;
    unitOfMeasure?: UnitOfMeasure;
    minStockLevel?: number;
    isActive?: boolean;
  }
): Promise<void> {
  const supabase = createAdminClient();
  const payload: any = { updated_at: new Date().toISOString() };
  if (input.name !== undefined) payload.name = input.name.trim();
  if (input.sku !== undefined) payload.sku = input.sku?.trim() || null;
  if (input.category !== undefined) payload.category = input.category;
  if (input.unitOfMeasure !== undefined) payload.unit_of_measure = input.unitOfMeasure;
  if (input.minStockLevel !== undefined) payload.min_stock_level = input.minStockLevel;
  if (input.isActive !== undefined) payload.is_active = input.isActive;

  const { error } = await supabase
    .from('inventory_raw_materials')
    .update(payload)
    .eq('tenant_id', tenantId)
    .eq('id', id);

  if (error) {
    throw new Error(`Erro ao atualizar insumo: ${error.message}`);
  }
}

// ==============================================================================
// 2. LOTES DE ESTOQUE (Inventory Batches & FEFO)
// ==============================================================================

export async function listInventoryBatches(
  tenantId: string,
  filters?: {
    batchType?: 'raw_material' | 'finished_product';
    rawMaterialId?: string;
    variantId?: string;
    status?: string;
  }
): Promise<InventoryBatch[]> {
  const supabase = createAdminClient();
  let query = supabase
    .from('inventory_batches')
    .select(`
      *,
      raw_material:inventory_raw_materials(name),
      variant:product_variants(id, name, product:products(name))
    `)
    .eq('tenant_id', tenantId)
    .order('expiration_date', { ascending: true });

  if (filters?.batchType) {
    query = query.eq('batch_type', filters.batchType);
  }
  if (filters?.rawMaterialId) {
    query = query.eq('raw_material_id', filters.rawMaterialId);
  }
  if (filters?.variantId) {
    query = query.eq('variant_id', filters.variantId);
  }
  if (filters?.status) {
    query = query.eq('status', filters.status);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Erro ao listar lotes: ${error.message}`);
  }

  const now = new Date();
  return (data || []).map((b: any) => {
    const expDate = new Date(b.expiration_date);
    const daysToExpiration = Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 3600 * 24));

    return {
      id: b.id,
      tenantId: b.tenant_id,
      batchType: b.batch_type,
      rawMaterialId: b.raw_material_id,
      variantId: b.variant_id,
      batchCode: b.batch_code,
      manufactureDate: b.manufacture_date,
      expirationDate: b.expiration_date,
      initialQuantity: Number(b.initial_quantity),
      currentQuantity: Number(b.current_quantity),
      reservedQuantity: Number(b.reserved_quantity),
      availableQuantity: Math.max(0, Number(b.current_quantity) - Number(b.reserved_quantity)),
      unitCostCents: b.unit_cost_cents,
      supplierName: b.supplier_name,
      invoiceNumber: b.invoice_number,
      storageLocation: b.storage_location,
      status: b.status,
      notes: b.notes,
      createdAt: b.created_at,
      updatedAt: b.updated_at,
      rawMaterialName: b.raw_material?.name || null,
      productName: b.variant?.product?.name || null,
      variantName: b.variant?.name || null,
      daysToExpiration,
    };
  });
}

export async function recordRawMaterialReceipt(
  tenantId: string,
  input: {
    rawMaterialId: string;
    batchCode: string;
    manufactureDate: string;
    expirationDate: string;
    quantity: number;
    unitCostCents: number;
    supplierName?: string | null;
    invoiceNumber?: string | null;
    storageLocation?: string;
    actorUserId?: string | null;
    notes?: string | null;
  }
): Promise<{ success: boolean; batchId: string; newStock: number; averageCostCents: number }> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc('record_raw_material_receipt_atomic', {
    p_tenant_id: tenantId,
    p_raw_material_id: input.rawMaterialId,
    p_batch_code: input.batchCode.trim(),
    p_manufacture_date: input.manufactureDate,
    p_expiration_date: input.expirationDate,
    p_quantity: input.quantity,
    p_unit_cost_cents: input.unitCostCents,
    p_supplier_name: input.supplierName?.trim() || null,
    p_invoice_number: input.invoiceNumber?.trim() || null,
    p_storage_location: input.storageLocation?.trim() || 'camara_fria',
    p_actor_user_id: input.actorUserId || null,
    p_notes: input.notes?.trim() || null,
  });

  if (error || !data?.success) {
    throw new Error(data?.error || error?.message || 'Falha ao registrar recebimento de insumo.');
  }

  return {
    success: true,
    batchId: data.batch_id,
    newStock: Number(data.new_stock),
    averageCostCents: data.average_cost_cents,
  };
}

export async function recordFinishedProductReceipt(
  tenantId: string,
  input: {
    variantId: string;
    batchCode: string;
    manufactureDate: string;
    expirationDate: string;
    quantity: number;
    unitCostCents: number;
    supplierName?: string | null;
    storageLocation?: string;
    actorUserId?: string | null;
    notes?: string | null;
  }
): Promise<{ success: boolean; batchId: string; quantity: number }> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc('record_finished_product_receipt_atomic', {
    p_tenant_id: tenantId,
    p_variant_id: input.variantId,
    p_batch_code: input.batchCode.trim(),
    p_manufacture_date: input.manufactureDate,
    p_expiration_date: input.expirationDate,
    p_quantity: input.quantity,
    p_unit_cost_cents: input.unitCostCents,
    p_supplier_name: input.supplierName?.trim() || null,
    p_storage_location: input.storageLocation?.trim() || 'freezer_principal',
    p_actor_user_id: input.actorUserId || null,
    p_notes: input.notes?.trim() || null,
  });

  if (error || !data?.success) {
    throw new Error(data?.error || error?.message || 'Falha ao registrar produto acabado.');
  }

  return {
    success: true,
    batchId: data.batch_id,
    quantity: data.quantity,
  };
}

export async function adjustInventoryBatch(
  tenantId: string,
  input: {
    batchId: string;
    newQuantity: number;
    reason: string;
    actorUserId?: string | null;
  }
): Promise<void> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc('adjust_inventory_batch_atomic', {
    p_tenant_id: tenantId,
    p_batch_id: input.batchId,
    p_new_quantity: input.newQuantity,
    p_reason: input.reason.trim(),
    p_actor_user_id: input.actorUserId || null,
  });

  if (error || !data?.success) {
    throw new Error(data?.error || error?.message || 'Falha ao ajustar lote.');
  }
}

// ==============================================================================
// 3. FICHAS TÉCNICAS E RECEITAS (Recipes & BOM)
// ==============================================================================

export async function listRecipes(tenantId: string): Promise<Recipe[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('recipes')
    .select(`
      *,
      product:products(name),
      variant:product_variants(name),
      items:recipe_items(
        id, raw_material_id, gross_quantity, net_quantity, unit_of_measure, notes,
        raw_material:inventory_raw_materials(name, average_cost_cents)
      )
    `)
    .eq('tenant_id', tenantId)
    .order('name', { ascending: true });

  if (error) {
    throw new Error(`Erro ao listar fichas técnicas: ${error.message}`);
  }

  return (data || []).map((r: any) => {
    let theoreticalCostCents = 0;
    const items: RecipeItem[] = (r.items || []).map((it: any) => {
      const grossQty = Number(it.gross_quantity);
      const avgCost = it.raw_material?.average_cost_cents || 0;
      const itemCost = Math.round(grossQty * avgCost);
      theoreticalCostCents += itemCost;

      return {
        id: it.id,
        tenantId: r.tenant_id,
        recipeId: r.id,
        rawMaterialId: it.raw_material_id,
        rawMaterialName: it.raw_material?.name || 'Insumo',
        grossQuantity: grossQty,
        netQuantity: Number(it.net_quantity),
        unitOfMeasure: it.unit_of_measure,
        correctionFactor: it.net_quantity > 0 ? Number((grossQty / Number(it.net_quantity)).toFixed(3)) : 1,
        unitCostCents: avgCost,
        itemTotalCostCents: itemCost,
        notes: it.notes,
        createdAt: it.created_at,
      };
    });

    const expectedYield = Number(r.expected_yield_quantity);
    const theoreticalUnitCostCents = expectedYield > 0 ? Math.round(theoreticalCostCents / expectedYield) : 0;

    return {
      id: r.id,
      tenantId: r.tenant_id,
      productId: r.product_id,
      productName: r.product?.name,
      variantId: r.variant_id,
      variantName: r.variant?.name,
      name: r.name,
      version: r.version,
      status: r.status,
      expectedYieldQuantity: expectedYield,
      yieldUnit: r.yield_unit,
      expectedLossPercentage: Number(r.expected_loss_percentage),
      shelfLifeDays: r.shelf_life_days,
      preparationInstructions: r.preparation_instructions,
      items,
      theoreticalCostCents,
      theoreticalUnitCostCents,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  });
}

export async function createRecipe(
  tenantId: string,
  input: {
    productId: string;
    variantId?: string | null;
    name: string;
    expectedYieldQuantity: number;
    yieldUnit?: string;
    expectedLossPercentage?: number;
    shelfLifeDays?: number;
    preparationInstructions?: string | null;
    items?: Array<{
      rawMaterialId: string;
      grossQuantity: number;
      netQuantity: number;
      unitOfMeasure: string;
      notes?: string;
    }>;
  }
): Promise<Recipe> {
  const supabase = createAdminClient();
  const { data: recipe, error: rError } = await supabase
    .from('recipes')
    .insert({
      tenant_id: tenantId,
      product_id: input.productId,
      variant_id: input.variantId || null,
      name: input.name.trim(),
      expected_yield_quantity: input.expectedYieldQuantity,
      yield_unit: input.yieldUnit || 'un',
      expected_loss_percentage: input.expectedLossPercentage || 0,
      shelf_life_days: input.shelfLifeDays || 90,
      preparation_instructions: input.preparationInstructions || null,
      status: 'active',
      version: 1,
    })
    .select('*')
    .single();

  if (rError) {
    throw new Error(`Erro ao criar ficha técnica: ${rError.message}`);
  }

  if (input.items && input.items.length > 0) {
    const itemsPayload = input.items.map((it) => ({
      tenant_id: tenantId,
      recipe_id: recipe.id,
      raw_material_id: it.rawMaterialId,
      gross_quantity: it.grossQuantity,
      net_quantity: it.netQuantity,
      unit_of_measure: it.unitOfMeasure,
      notes: it.notes || null,
    }));

    const { error: itError } = await supabase.from('recipe_items').insert(itemsPayload);
    if (itError) {
      throw new Error(`Erro ao salvar itens da ficha técnica: ${itError.message}`);
    }
  }

  return {
    id: recipe.id,
    tenantId: recipe.tenant_id,
    productId: recipe.product_id,
    variantId: recipe.variant_id,
    name: recipe.name,
    version: recipe.version,
    status: recipe.status,
    expectedYieldQuantity: Number(recipe.expected_yield_quantity),
    yieldUnit: recipe.yield_unit,
    expectedLossPercentage: Number(recipe.expected_loss_percentage),
    shelfLifeDays: recipe.shelf_life_days,
    preparationInstructions: recipe.preparation_instructions,
    createdAt: recipe.created_at,
    updatedAt: recipe.updated_at,
  };
}

// ==============================================================================
// 4. ORDENS DE PRODUÇÃO (Production Runs & Real Yield)
// ==============================================================================

export async function listProductionOrders(tenantId: string): Promise<ProductionOrder[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('production_orders')
    .select(`
      *,
      recipe:recipes(name),
      variant:product_variants(name),
      generated_batch:inventory_batches(batch_code),
      inputs:production_batch_inputs(
        id, raw_material_id, raw_material_batch_id, quantity_consumed, unit_cost_cents, total_cost_cents,
        raw_material:inventory_raw_materials(name),
        batch:inventory_batches(batch_code)
      )
    `)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Erro ao listar ordens de produção: ${error.message}`);
  }

  return (data || []).map((po: any) => ({
    id: po.id,
    tenantId: po.tenant_id,
    recipeId: po.recipe_id,
    recipeName: po.recipe?.name,
    orderCode: po.order_code,
    status: po.status,
    plannedMultiplier: Number(po.planned_multiplier),
    expectedYieldQuantity: Number(po.expected_yield_quantity),
    actualYieldQuantity: po.actual_yield_quantity !== null ? Number(po.actual_yield_quantity) : null,
    staffConsumptionQuantity: Number(po.staff_consumption_quantity),
    wasteSpoilageQuantity: Number(po.waste_spoilage_quantity),
    yieldDeviationPercentage: po.yield_deviation_percentage !== null ? Number(po.yield_deviation_percentage) : null,
    deviationReason: po.deviation_reason,
    totalCostCents: po.total_cost_cents,
    unitCostCents: po.unit_cost_cents,
    producedVariantId: po.produced_variant_id,
    producedVariantName: po.variant?.name,
    generatedBatchId: po.generated_batch_id,
    generatedBatchCode: po.generated_batch?.batch_code,
    startedAt: po.started_at,
    completedAt: po.completed_at,
    notes: po.notes,
    inputs: (po.inputs || []).map((inp: any) => ({
      id: inp.id,
      tenantId: po.tenant_id,
      productionOrderId: po.id,
      rawMaterialId: inp.raw_material_id,
      rawMaterialName: inp.raw_material?.name,
      rawMaterialBatchId: inp.raw_material_batch_id,
      rawMaterialBatchCode: inp.batch?.batch_code,
      quantityConsumed: Number(inp.quantity_consumed),
      unitCostCents: inp.unit_cost_cents,
      totalCostCents: inp.total_cost_cents,
      createdAt: inp.created_at,
    })),
    createdAt: po.created_at,
    updatedAt: po.updated_at,
  }));
}

export async function createProductionOrder(
  tenantId: string,
  input: {
    recipeId: string;
    orderCode: string;
    plannedMultiplier?: number;
    actorUserId?: string | null;
    notes?: string | null;
  }
): Promise<{ productionOrderId: string; orderCode: string; expectedYield: number }> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc('create_production_order_atomic', {
    p_tenant_id: tenantId,
    p_recipe_id: input.recipeId,
    p_order_code: input.orderCode.trim(),
    p_planned_multiplier: input.plannedMultiplier || 1.0,
    p_actor_user_id: input.actorUserId || null,
    p_notes: input.notes?.trim() || null,
  });

  if (error || !data?.success) {
    throw new Error(data?.error || error?.message || 'Falha ao criar ordem de produção.');
  }

  return {
    productionOrderId: data.production_order_id,
    orderCode: data.order_code,
    expectedYield: Number(data.expected_yield),
  };
}

export async function completeProductionOrder(
  tenantId: string,
  input: {
    productionOrderId: string;
    actualYieldQuantity: number;
    batchCode: string;
    staffConsumptionQuantity?: number;
    wasteSpoilageQuantity?: number;
    deviationReason?: string | null;
    storageLocation?: string;
    actorUserId?: string | null;
  }
): Promise<{
  productionOrderId: string;
  generatedBatchId: string;
  batchCode: string;
  unitCostCents: number;
  totalCostCents: number;
}> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc('complete_production_order_atomic', {
    p_tenant_id: tenantId,
    p_production_order_id: input.productionOrderId,
    p_actual_yield_quantity: input.actualYieldQuantity,
    p_batch_code: input.batchCode.trim(),
    p_staff_consumption_quantity: input.staffConsumptionQuantity || 0,
    p_waste_spoilage_quantity: input.wasteSpoilageQuantity || 0,
    p_deviation_reason: input.deviationReason?.trim() || null,
    p_storage_location: input.storageLocation?.trim() || 'freezer_principal',
    p_actor_user_id: input.actorUserId || null,
  });

  if (error || !data?.success) {
    throw new Error(data?.error || error?.message || 'Falha ao concluir ordem de produção.');
  }

  return {
    productionOrderId: data.production_order_id,
    generatedBatchId: data.generated_batch_id,
    batchCode: data.batch_code,
    unitCostCents: data.unit_cost_cents,
    totalCostCents: data.total_cost_cents,
  };
}

// ==============================================================================
// 5. INTEGRAÇÃO COM PEDIDOS: RESERVA, LIBERAÇÃO E BAIXA DEFINITIVA (FEFO)
// ==============================================================================

export async function reserveOrderInventory(
  tenantId: string,
  orderId: string
): Promise<{ success: boolean; reservationsCount: number }> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc('reserve_order_inventory_atomic', {
    p_tenant_id: tenantId,
    p_order_id: orderId,
  });

  if (error || !data?.success) {
    throw new Error(data?.error || error?.message || 'Falha ao reservar estoque do pedido.');
  }

  return {
    success: true,
    reservationsCount: data.reservations_count || 0,
  };
}

export async function releaseOrderInventoryReservation(
  tenantId: string,
  orderId: string,
  reason?: string
): Promise<{ success: boolean; releasedCount: number }> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc('release_order_inventory_reservation_atomic', {
    p_tenant_id: tenantId,
    p_order_id: orderId,
    p_reason: reason || 'Cancelamento de pedido',
  });

  if (error || !data?.success) {
    throw new Error(data?.error || error?.message || 'Falha ao liberar reserva de estoque.');
  }

  return {
    success: true,
    releasedCount: data.released_count || 0,
  };
}

export async function commitOrderInventoryDeduction(
  tenantId: string,
  orderId: string,
  actorUserId?: string | null
): Promise<{ success: boolean; committedCount: number; totalCmvCents: number }> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc('commit_order_inventory_deduction_atomic', {
    p_tenant_id: tenantId,
    p_order_id: orderId,
    p_actor_user_id: actorUserId || null,
  });

  if (error || !data?.success) {
    throw new Error(data?.error || error?.message || 'Falha ao efetuar baixa definitiva de estoque.');
  }

  return {
    success: true,
    committedCount: data.committed_count || 0,
    totalCmvCents: data.total_cmv_cents || 0,
  };
}

// ==============================================================================
// 6. MOVIMENTAÇÕES E DASHBOARD / KPIs
// ==============================================================================

export async function listInventoryMovements(
  tenantId: string,
  limit = 50
): Promise<InventoryMovement[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('inventory_movements')
    .select(`
      *,
      raw_material:inventory_raw_materials(name),
      variant:product_variants(name, product:products(name)),
      batch:inventory_batches(batch_code),
      order:orders(order_number),
      production_order:production_orders(order_code)
    `)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Erro ao listar movimentações: ${error.message}`);
  }

  return (data || []).map((m: any) => {
    let itemName = 'Item';
    if (m.item_type === 'raw_material') {
      itemName = m.raw_material?.name || 'Insumo';
    } else {
      itemName = `${m.variant?.product?.name || 'Produto'} (${m.variant?.name || 'Un'})`;
    }

    return {
      id: m.id,
      tenantId: m.tenant_id,
      itemType: m.item_type,
      rawMaterialId: m.raw_material_id,
      variantId: m.variant_id,
      batchId: m.batch_id,
      batchCode: m.batch?.batch_code,
      itemName,
      movementType: m.movement_type,
      quantity: Number(m.quantity),
      unitCostCents: m.unit_cost_cents,
      totalCostCents: m.total_cost_cents,
      orderId: m.order_id,
      orderNumber: m.order?.order_number,
      productionOrderId: m.production_order_id,
      productionOrderCode: m.production_order?.order_code,
      reason: m.reason,
      performedByUserId: m.performed_by_user_id,
      createdAt: m.created_at,
    };
  });
}

export async function getInventoryDashboardKPIs(tenantId: string): Promise<InventoryDashboardKPIs> {
  const supabase = createAdminClient();
  const now = new Date();
  const thirtyDaysAhead = new Date(now.getTime() + 30 * 24 * 3600 * 1000).toISOString().split('T')[0];

  const [
    { data: rawMats },
    { data: batches },
    recentMovements,
  ] = await Promise.all([
    supabase
      .from('inventory_raw_materials')
      .select('id, current_stock, min_stock_level, average_cost_cents')
      .eq('tenant_id', tenantId)
      .eq('is_active', true),
    supabase
      .from('inventory_batches')
      .select('id, status, current_quantity, unit_cost_cents, expiration_date')
      .eq('tenant_id', tenantId),
    listInventoryMovements(tenantId, 15),
  ]);

  const rawList = rawMats || [];
  const batchList = batches || [];

  let lowStockCount = 0;
  let rawMatsValuationCents = 0;
  rawList.forEach((rm: any) => {
    const curStock = Number(rm.current_stock);
    const minStock = Number(rm.min_stock_level);
    if (minStock > 0 && curStock <= minStock) {
      lowStockCount++;
    }
    rawMatsValuationCents += Math.round(curStock * rm.average_cost_cents);
  });

  let activeBatchesCount = 0;
  let expiringSoonCount = 0;
  let quarantineCount = 0;
  let batchesValuationCents = 0;

  batchList.forEach((b: any) => {
    if (b.status === 'active') {
      activeBatchesCount++;
      const curQty = Number(b.current_quantity);
      batchesValuationCents += Math.round(curQty * b.unit_cost_cents);
      if (b.expiration_date <= thirtyDaysAhead) {
        expiringSoonCount++;
      }
    } else if (b.status === 'quarantine') {
      quarantineCount++;
    }
  });

  return {
    totalRawMaterialsCount: rawList.length,
    totalBatchesCount: batchList.length,
    activeBatchesCount,
    totalInventoryValuationCents: rawMatsValuationCents + batchesValuationCents,
    lowStockItemsCount: lowStockCount,
    expiringSoonBatchesCount: expiringSoonCount,
    quarantineBatchesCount: quarantineCount,
    recentMovements,
  };
}

