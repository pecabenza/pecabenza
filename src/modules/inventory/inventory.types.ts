export type RawMaterialCategory =
  | 'ingredient'
  | 'packaging'
  | 'spice'
  | 'dairy'
  | 'meat'
  | 'beverage'
  | 'cleaning'
  | 'other';

export type UnitOfMeasure = 'kg' | 'g' | 'l' | 'ml' | 'un' | 'cx' | 'pct';

export type BatchType = 'raw_material' | 'finished_product';

export type BatchStatus = 'active' | 'exhausted' | 'quarantine' | 'expired' | 'discarded';

export type RecipeStatus = 'draft' | 'active' | 'archived';

export type ProductionOrderStatus = 'planned' | 'in_progress' | 'completed' | 'cancelled';

export type MovementType =
  | 'purchase_in'
  | 'production_consumption'
  | 'production_yield_in'
  | 'staff_consumption'
  | 'sale_out'
  | 'spoilage_loss'
  | 'expired_loss'
  | 'manual_adjustment_in'
  | 'manual_adjustment_out'
  | 'order_cancelled_return';

export interface RawMaterial {
  id: string;
  tenantId: string;
  name: string;
  sku?: string | null;
  category: RawMaterialCategory;
  unitOfMeasure: UnitOfMeasure;
  minStockLevel: number;
  currentStock: number;
  averageCostCents: number;
  lastPurchaseCostCents: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProductVariantStockSetting {
  id: string;
  tenantId: string;
  variantId: string;
  trackInventory: boolean;
  minStockLevel: number;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryBatch {
  id: string;
  tenantId: string;
  batchType: BatchType;
  rawMaterialId?: string | null;
  variantId?: string | null;
  batchCode: string;
  manufactureDate: string;
  expirationDate: string;
  initialQuantity: number;
  currentQuantity: number;
  reservedQuantity: number;
  availableQuantity: number;
  unitCostCents: number;
  supplierName?: string | null;
  invoiceNumber?: string | null;
  storageLocation: string;
  status: BatchStatus;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  // Joins opcionais
  rawMaterialName?: string | null;
  productName?: string | null;
  variantName?: string | null;
  daysToExpiration?: number;
}

export interface RecipeItem {
  id: string;
  tenantId: string;
  recipeId: string;
  rawMaterialId: string;
  rawMaterialName?: string;
  grossQuantity: number;
  netQuantity: number;
  unitOfMeasure: string;
  correctionFactor?: number;
  unitCostCents?: number;
  itemTotalCostCents?: number;
  notes?: string | null;
  createdAt: string;
}

export interface Recipe {
  id: string;
  tenantId: string;
  productId: string;
  productName?: string;
  variantId?: string | null;
  variantName?: string | null;
  name: string;
  version: number;
  status: RecipeStatus;
  expectedYieldQuantity: number;
  yieldUnit: string;
  expectedLossPercentage: number;
  shelfLifeDays: number;
  preparationInstructions?: string | null;
  items?: RecipeItem[];
  theoreticalCostCents?: number;
  theoreticalUnitCostCents?: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProductionBatchInput {
  id: string;
  tenantId: string;
  productionOrderId: string;
  rawMaterialId: string;
  rawMaterialName?: string;
  rawMaterialBatchId: string;
  rawMaterialBatchCode?: string;
  quantityConsumed: number;
  unitCostCents: number;
  totalCostCents: number;
  createdAt: string;
}

export interface ProductionOrder {
  id: string;
  tenantId: string;
  recipeId: string;
  recipeName?: string;
  orderCode: string;
  status: ProductionOrderStatus;
  plannedMultiplier: number;
  expectedYieldQuantity: number;
  actualYieldQuantity?: number | null;
  staffConsumptionQuantity: number;
  wasteSpoilageQuantity: number;
  yieldDeviationPercentage?: number | null;
  deviationReason?: string | null;
  totalCostCents: number;
  unitCostCents: number;
  producedVariantId?: string | null;
  producedVariantName?: string | null;
  generatedBatchId?: string | null;
  generatedBatchCode?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  notes?: string | null;
  inputs?: ProductionBatchInput[];
  createdAt: string;
  updatedAt: string;
}

export interface InventoryMovement {
  id: string;
  tenantId: string;
  itemType: BatchType;
  rawMaterialId?: string | null;
  variantId?: string | null;
  batchId?: string | null;
  batchCode?: string | null;
  itemName?: string | null;
  movementType: MovementType;
  quantity: number;
  unitCostCents: number;
  totalCostCents: number;
  orderId?: string | null;
  orderNumber?: string | null;
  productionOrderId?: string | null;
  productionOrderCode?: string | null;
  reason?: string | null;
  performedByUserId?: string | null;
  createdAt: string;
}

export interface InventoryDashboardKPIs {
  totalRawMaterialsCount: number;
  totalBatchesCount: number;
  activeBatchesCount: number;
  totalInventoryValuationCents: number;
  lowStockItemsCount: number;
  expiringSoonBatchesCount: number;
  quarantineBatchesCount: number;
  recentMovements: InventoryMovement[];
}

