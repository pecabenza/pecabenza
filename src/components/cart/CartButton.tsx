'use client';

import React from 'react';
import { ShoppingBag } from 'lucide-react';
import { useCart } from '@/modules/cart/CartContext';

interface CartButtonProps {
  className?: string;
}

export function CartButton({ className = '' }: CartButtonProps) {
  const { openCart, totalItemsCount } = useCart();

  return (
    <button
      type="button"
      onClick={openCart}
      className={`relative inline-flex items-center justify-center p-2 rounded-tenant text-tenant-text hover:text-tenant-primary hover:bg-tenant-surface border border-transparent hover:border-tenant-border transition-all focus:outline-none ${className}`}
      aria-label="Abrir sacola de compras"
    >
      <ShoppingBag className="w-5 h-5" />
      {totalItemsCount > 0 && (
        <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-tenant-primary text-white text-[10px] font-bold flex items-center justify-center shadow-xs animate-in zoom-in-50 duration-200">
          {totalItemsCount > 99 ? '99+' : totalItemsCount}
        </span>
      )}
    </button>
  );
}

