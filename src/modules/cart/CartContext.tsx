'use client';

import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import type { CartItem, CartContextType } from './cart.types';
import {
  formatBrl,
  getCartStorageKey,
  calculateCartItemsCount,
  calculateCartSubtotal,
  consolidateCartItem,
  updateCartItemQuantity,
  resolveCartItemKey,
} from './cart.utils';
import { trackEvent } from '@/lib/analytics/events';

export { formatBrl } from './cart.utils';

const CartContext = createContext<CartContextType | null>(null);

interface CartProviderProps {
  tenantId: string;
  tenantSlug: string;
  children: React.ReactNode;
}

export function CartProvider({ tenantId, tenantSlug, children }: CartProviderProps) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);

  const storageKey = getCartStorageKey(tenantId);

  // 1. Hidratação client-side a partir do localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setItems(parsed);
        }
      }
    } catch (err) {
      console.warn('Falha ao ler carrinho do localStorage:', err);
    } finally {
      setIsHydrated(true);
    }
  }, [storageKey]);

  // 2. Persistência de alterações no localStorage após hidratação
  useEffect(() => {
    if (!isHydrated) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(items));
    } catch (err) {
      console.warn('Falha ao salvar carrinho no localStorage:', err);
    }
  }, [items, isHydrated, storageKey]);

  // Controles de visibilidade do Drawer
  const openCart = useCallback(() => setIsOpen(true), []);
  const closeCart = useCallback(() => setIsOpen(false), []);
  const toggleCart = useCallback(() => setIsOpen((prev) => !prev), []);

  // Adicionar item
  const addItem = useCallback(
    (newItem: Omit<CartItem, 'quantity'> & { quantity?: number }) => {
      const quantityToAdd = newItem.quantity && newItem.quantity > 0 ? newItem.quantity : 1;
      const itemKey = resolveCartItemKey(newItem);

      setItems((prevItems) =>
        consolidateCartItem(prevItems, {
          ...newItem,
          itemKey,
          quantity: quantityToAdd,
        })
      );

      // Disparar evento de e-commerce
      trackEvent('add_to_cart', {
        tenantId,
        tenantSlug,
        productId: newItem.productId,
        productName: newItem.productName,
        productPrice: newItem.unitPriceInCents / 100,
        variantId: newItem.variantId,
        quantity: quantityToAdd,
      });

      // Abre automaticamente o drawer para feedback visual imediato
      setIsOpen(true);
    },
    [tenantId, tenantSlug]
  );

  // Remover item
  const removeItem = useCallback(
    (itemKeyOrVariantId: string) => {
      setItems((prevItems) => {
        const matches = (i: CartItem) =>
          resolveCartItemKey(i) === itemKeyOrVariantId || i.variantId === itemKeyOrVariantId;
        const itemToRemove = prevItems.find(matches);
        if (itemToRemove) {
          trackEvent('remove_from_cart' as any, {
            tenantId,
            tenantSlug,
            productId: itemToRemove.productId,
            productName: itemToRemove.productName,
            variantId: itemToRemove.variantId,
          });
        }
        return prevItems.filter((i) => !matches(i));
      });
    },
    [tenantId, tenantSlug]
  );

  // Atualizar quantidade
  const updateQuantity = useCallback(
    (itemKeyOrVariantId: string, quantity: number) => {
      if (quantity <= 0) {
        removeItem(itemKeyOrVariantId);
        return;
      }
      setItems((prevItems) => updateCartItemQuantity(prevItems, itemKeyOrVariantId, quantity));
    },
    [removeItem]
  );

  // Limpar carrinho
  const clearCart = useCallback(() => {
    setItems([]);
  }, []);

  // Cálculos agregados
  const totalItemsCount = useMemo(
    () => items.reduce((acc, item) => acc + item.quantity, 0),
    [items]
  );

  const subtotalInCents = useMemo(
    () => items.reduce((acc, item) => acc + item.unitPriceInCents * item.quantity, 0),
    [items]
  );

  const formattedSubtotal = useMemo(
    () => formatBrl(subtotalInCents),
    [subtotalInCents]
  );

  const value = useMemo<CartContextType>(
    () => ({
      items,
      isOpen,
      totalItemsCount,
      subtotalInCents,
      formattedSubtotal,
      openCart,
      closeCart,
      toggleCart,
      addItem,
      removeItem,
      updateQuantity,
      clearCart,
    }),
    [
      items,
      isOpen,
      totalItemsCount,
      subtotalInCents,
      formattedSubtotal,
      openCart,
      closeCart,
      toggleCart,
      addItem,
      removeItem,
      updateQuantity,
      clearCart,
    ]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextType {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart deve ser utilizado dentro de um CartProvider');
  }
  return context;
}
