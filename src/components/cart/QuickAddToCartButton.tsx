'use client';

import React, { useState } from 'react';
import { ShoppingBag, Check } from 'lucide-react';
import { useCart } from '@/modules/cart/CartContext';
import type { Product, ProductVariant } from '@/types/database.types';

interface QuickAddToCartButtonProps {
  product: Product & { variants?: ProductVariant[] };
}

export function QuickAddToCartButton({ product }: QuickAddToCartButtonProps) {
  const { addItem } = useCart();
  const [isAdded, setIsAdded] = useState(false);

  const availableVariant =
    product.variants?.find((v) => v.is_available) || product.variants?.[0];

  if (!availableVariant) return null;

  const handleQuickAdd = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    addItem({
      productId: product.id,
      productName: product.name,
      productSlug: product.slug,
      variantId: availableVariant.id,
      variantName: availableVariant.name,
      unitPriceInCents: availableVariant.price_in_cents,
      quantity: 1,
      coverImageUrl: product.cover_image_url,
      unitValue: availableVariant.unit_value,
      unitType: availableVariant.unit_type,
    });

    setIsAdded(true);
    setTimeout(() => setIsAdded(false), 1800);
  };

  return (
    <button
      type="button"
      onClick={handleQuickAdd}
      className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-tenant text-xs font-semibold transition-all ${
        isAdded
          ? 'bg-emerald-600 text-white shadow-xs'
          : 'bg-tenant-primary text-white hover:brightness-110 shadow-xs active:scale-95'
      }`}
      title={`Adicionar ${product.name} (${availableVariant.name}) à sacola`}
      aria-label={`Adicionar ${product.name} à sacola`}
    >
      {isAdded ? (
        <>
          <Check className="w-3.5 h-3.5 stroke-[3]" />
          <span>Adicionado</span>
        </>
      ) : (
        <>
          <ShoppingBag className="w-3.5 h-3.5" />
          <span>Pedir</span>
        </>
      )}
    </button>
  );
}

