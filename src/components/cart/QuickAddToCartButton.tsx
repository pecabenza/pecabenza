'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ShoppingBag, Check, SlidersHorizontal } from 'lucide-react';
import { useCart } from '@/modules/cart/CartContext';
import { isCommerceEnabled } from '@/lib/tenancy/site-mode';
import type { Product, ProductVariant, SiteMode } from '@/types/database.types';

interface QuickAddToCartButtonProps {
  product: Product & { variants?: ProductVariant[] };
  siteMode?: SiteMode | null;
}

export function QuickAddToCartButton({ product, siteMode = 'commerce' }: QuickAddToCartButtonProps) {
  const { addItem } = useCart();
  const [isAdded, setIsAdded] = useState(false);

  if (!isCommerceEnabled(siteMode)) {
    return null;
  }

  const availableVariants = (product.variants || []).filter((v) => v.is_available !== false);
  const availableVariant = availableVariants[0];

  if (!product.variants || product.variants.length === 0) return null;

  if (!availableVariant) {
    return (
      <button
        type="button"
        disabled
        className="inline-flex items-center justify-center px-3 py-2 rounded-tenant text-xs font-semibold bg-stone-200 text-stone-500 cursor-not-allowed"
        aria-label={`${product.name} indisponível`}
      >
        Indisponível
      </button>
    );
  }

  const hasRequiredModifiers = Boolean(
    product.modifier_groups?.some((g) => g.is_required || g.min_selections > 0)
  );

  if (hasRequiredModifiers) {
    return (
      <Link
        href={`/produtos/${product.slug}`}
        className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-tenant text-xs font-semibold bg-tenant-primary text-white hover:brightness-110 shadow-xs transition-all"
        title={`Escolher opções para ${product.name}`}
      >
        <SlidersHorizontal className="w-3.5 h-3.5" />
        <span>Escolher</span>
      </Link>
    );
  }

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

