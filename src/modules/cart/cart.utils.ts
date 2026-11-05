import type { CartItem } from './cart.types';

/**
 * Formata um valor monetário em centavos para o formato de moeda brasileiro (BRL).
 * Exemplo: 4800 -> "R$ 48,00"
 */
export function formatBrl(cents: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(cents / 100);
}

/**
 * Retorna a chave do localStorage isolada por tenant para impedir contaminação cross-tenant.
 */
export function getCartStorageKey(tenantId: string): string {
  return `sysfood_cart_${tenantId}`;
}

/**
 * Calcula a quantidade total de pratos/porções no carrinho.
 */
export function calculateCartItemsCount(items: CartItem[]): number {
  return items.reduce((total, item) => total + item.quantity, 0);
}

/**
 * Calcula o valor subtotal do carrinho em centavos.
 */
export function calculateCartSubtotal(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + item.unitPriceInCents * item.quantity, 0);
}

/**
 * Adiciona um item ao carrinho consolidando porções iguais (mesmo variantId).
 */
export function consolidateCartItem(currentItems: CartItem[], newItem: CartItem): CartItem[] {
  const existingIndex = currentItems.findIndex((i) => i.variantId === newItem.variantId);
  if (existingIndex > -1) {
    return currentItems.map((item, idx) =>
      idx === existingIndex
        ? { ...item, quantity: item.quantity + newItem.quantity }
        : item
    );
  }
  return [...currentItems, newItem];
}

/**
 * Atualiza a quantidade de uma porção no carrinho. Se a quantidade for <= 0, remove o item.
 */
export function updateCartItemQuantity(
  currentItems: CartItem[],
  variantId: string,
  quantity: number
): CartItem[] {
  if (quantity <= 0) {
    return currentItems.filter((i) => i.variantId !== variantId);
  }
  return currentItems.map((i) => (i.variantId === variantId ? { ...i, quantity } : i));
}

