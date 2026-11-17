'use client';

import React from 'react';
import { ShoppingBag, ArrowRight } from 'lucide-react';
import { useCart } from '@/modules/cart/CartContext';

/**
 * Barra flutuante mobile exibida apenas quando há itens na sacola,
 * reutilizando o CartContext existente sem causar layout shift.
 */
export function FloatingCartBar() {
  const { totalItemsCount, formattedSubtotal, openCart } = useCart();

  if (totalItemsCount <= 0) return null;

  return (
    <div className="md:hidden fixed bottom-4 left-4 right-4 z-30 animate-in fade-in slide-in-from-bottom-3 duration-200">
      <button
        type="button"
        onClick={openCart}
        className="w-full px-4 py-3.5 rounded-2xl bg-tenant-button hover:bg-tenant-buttonHover text-white shadow-xl flex items-center justify-between gap-3 transition-all active:scale-[0.98]"
      >
        <div className="flex items-center gap-2.5">
          <span className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-xs font-bold">
            {totalItemsCount}
          </span>
          <span className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
            <ShoppingBag className="w-3.5 h-3.5" />
            <span>Ver Sacola</span>
          </span>
        </div>

        <div className="flex items-center gap-1.5 font-heading font-bold text-sm">
          <span>{formattedSubtotal}</span>
          <ArrowRight className="w-4 h-4" />
        </div>
      </button>
    </div>
  );
}
