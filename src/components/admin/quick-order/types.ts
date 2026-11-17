import type { ProductModifierGroup } from '@/types/database.types';
import type { QuickOrderCreationResult } from '@/modules/orders/orders.service';

export interface CatalogVariant {
  id: string;
  product_id: string;
  name: string;
  sku: string | null;
  unit_type: string;
  unit_value: number;
  price_in_cents: number;
  is_available: boolean;
}

export interface CatalogProduct {
  id: string;
  category_id: string | null;
  name: string;
  slug: string;
  short_description: string | null;
  is_featured: boolean;
  variants: CatalogVariant[];
  modifierGroups?: ProductModifierGroup[];
  stationNames: string[];
}

export interface CatalogCategory {
  id: string;
  name: string;
  slug: string;
}

export interface PosCartItem {
  cartItemKey: string;
  productId: string;
  productName: string;
  variantId: string;
  variantName: string;
  baseUnitPriceInCents: number;
  extraPriceCents: number;
  unitPriceInCents: number;
  quantity: number;
  selectedModifierOptionIds: string[];
  modifierSummary: string;
  stationNames: string[];
}

export interface CreatedOrderWithPix extends QuickOrderCreationResult {
  pixPayment?: {
    paymentId: string;
    pixQrCodeText: string;
    pixQrCodeBase64: string;
    pixExpiresAt: string;
  } | null;
}

