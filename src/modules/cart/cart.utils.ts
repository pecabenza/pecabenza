import type { CartItem } from './cart.types';
import { buildCartItemKey } from '@/modules/catalog/modifiers';

export function resolveCartItemKey(item: Pick<CartItem, 'itemKey' | 'variantId' | 'selectedModifiers'>): string {
  return item.itemKey || buildCartItemKey(item.variantId, item.selectedModifiers);
}

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
  const newKey = resolveCartItemKey(newItem);
  const normalizedNew: CartItem = { ...newItem, itemKey: newKey };
  const existingIndex = currentItems.findIndex((i) => resolveCartItemKey(i) === newKey);
  if (existingIndex > -1) {
    return currentItems.map((item, idx) =>
      idx === existingIndex
        ? { ...item, quantity: item.quantity + normalizedNew.quantity }
        : item
    );
  }
  return [...currentItems, normalizedNew];
}

/**
 * Atualiza a quantidade de uma porção no carrinho. Se a quantidade for <= 0, remove o item.
 */
export function updateCartItemQuantity(
  currentItems: CartItem[],
  itemKeyOrVariantId: string,
  quantity: number
): CartItem[] {
  const matches = (i: CartItem) =>
    resolveCartItemKey(i) === itemKeyOrVariantId || i.variantId === itemKeyOrVariantId;
  if (quantity <= 0) {
    return currentItems.filter((i) => !matches(i));
  }
  return currentItems.map((item) =>
    matches(item) ? { ...item, quantity } : item
  );
}

