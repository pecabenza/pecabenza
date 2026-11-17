import type { SelectedModifierSnapshot } from '@/types/database.types';

export interface CartItem {
  itemKey?: string;
  productId: string;
  productName: string;
  productSlug: string;
  variantId: string;
  variantName: string;
  unitPriceInCents: number;
  quantity: number;
  coverImageUrl?: string | null;
  unitValue?: number;
  unitType?: string;
  selectedModifiers?: SelectedModifierSnapshot[];
}

export interface CartContextType {
  items: CartItem[];
  isOpen: boolean;
  totalItemsCount: number;
  subtotalInCents: number;
  formattedSubtotal: string;
  openCart: () => void;
  closeCart: () => void;
  toggleCart: () => void;
  addItem: (item: Omit<CartItem, 'quantity'> & { quantity?: number }) => void;
  removeItem: (variantId: string) => void;
  updateQuantity: (variantId: string, quantity: number) => void;
  clearCart: () => void;
}

