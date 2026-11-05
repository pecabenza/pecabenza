'use client';

import React from 'react';
import { ShoppingBag, ArrowRight } from 'lucide-react';
import { useCart } from '@/modules/cart/CartContext';

export function FloatingCartBar() {
  const { totalItemsCount, formattedSubtotal, openCart, isOpen } = useCart();

  if (totalItemsCount === 0 || isOpen) return null;

  return (
    <div className="fixed bottom-6 inset-x-4 z-40 sm:hidden animate-in slide-in-from-bottom-4 duration-300">
      <button
        onClick={openCart}
        className="w-full bg-tenant-primary text-white p-4 rounded-2xl shadow-xl flex items-center justify-between font-semibold text-sm hover:brightness-110 active:scale-[0.99] transition-all border border-white/20"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
            <ShoppingBag className="w-4 h-4 text-white" />
          </div>
          <div className="text-left">
            <span className="block text-xs text-white/80 uppercase tracking-wider font-bold">
              {totalItemsCount === 1 ? '1 item na sacola' : `${totalItemsCount} itens na sacola`}
            </span>
            <span className="block font-heading text-base font-bold">
              {formattedSubtotal}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider bg-white/20 px-3 py-1.5 rounded-lg">
          <span>Ver Sacola</span>
          <ArrowRight className="w-4 h-4" />
        </div>
      </button>
    </div>
  );
}

