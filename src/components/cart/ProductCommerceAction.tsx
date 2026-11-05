'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ShoppingBag, Plus, Minus, Check, Clock } from 'lucide-react';
import { useCart, formatBrl } from '@/modules/cart/CartContext';
import { Button } from '@/components/ui/Button';
import { isCommerceEnabled } from '@/lib/tenancy/site-mode';
import type { ProductVariant, SiteMode } from '@/types/database.types';

interface ProductCommerceActionProps {
  productId: string;
  productName: string;
  productSlug: string;
  coverImageUrl?: string | null;
  variants: ProductVariant[];
  siteMode?: SiteMode;
}

export function ProductCommerceAction({
  productId,
  productName,
  productSlug,
  coverImageUrl,
  variants,
  siteMode = 'commerce',
}: ProductCommerceActionProps) {
  const { addItem } = useCart();

  // Seleciona a primeira variante disponível por padrão
  const defaultVariant = variants.find((v) => v.is_available) || variants[0];
  const [selectedVariantId, setSelectedVariantId] = useState<string>(defaultVariant?.id || '');
  const [quantity, setQuantity] = useState<number>(1);
  const [isAdded, setIsAdded] = useState(false);

  // Se o comércio estiver desabilitado no tenant (prelaunch ou institutional), exibir CTA informativo
  if (!isCommerceEnabled(siteMode)) {
    return (
      <div className="p-5 rounded-tenant bg-tenant-surface border border-tenant-border/80 space-y-3">
        <div className="flex items-center gap-2 text-tenant-primary text-xs font-semibold uppercase tracking-wider">
          <Clock className="w-4 h-4" />
          <span>{siteMode === 'prelaunch' ? 'Modo Pré-Lançamento' : 'Catálogo Institucional'}</span>
        </div>
        <p className="text-xs text-tenant-muted leading-relaxed">
          {siteMode === 'prelaunch'
            ? 'Os pedidos serão abertos em breve com lotes semanais programados. Acompanhe as novidades pelo nosso contato.'
            : 'Consulte a disponibilidade de encomendas diretamente com nossa equipe.'}
        </p>
        <div className="pt-1">
          <Link
            href="/contato"
            className="w-full inline-flex items-center justify-center py-3 px-4 rounded-tenant bg-tenant-primary text-white text-sm font-semibold hover:brightness-110 transition-all shadow-sm"
          >
            <span>Falar com a Cozinha</span>
          </Link>
        </div>
      </div>
    );
  }

  const selectedVariant = variants.find((v) => v.id === selectedVariantId) || defaultVariant;

  if (!selectedVariant || variants.length === 0) {
    return (
      <div className="p-4 rounded-tenant bg-tenant-surface border border-tenant-border text-xs text-tenant-muted">
        Nenhuma porção cadastrada no momento para este prato.
      </div>
    );
  }

  const handleAddToCart = () => {
    addItem({
      productId,
      productName,
      productSlug,
      variantId: selectedVariant.id,
      variantName: selectedVariant.name,
      unitPriceInCents: selectedVariant.price_in_cents,
      quantity,
      coverImageUrl,
      unitValue: selectedVariant.unit_value,
      unitType: selectedVariant.unit_type,
    });

    setIsAdded(true);
    setTimeout(() => setIsAdded(false), 2000);
  };

  const totalPriceInCents = selectedVariant.price_in_cents * quantity;

  return (
    <div className="p-6 rounded-2xl bg-tenant-surface border border-tenant-border/80 shadow-sm space-y-6">
      {/* 1. Escolha de Porções / Variações */}
      <div className="space-y-3">
        <label className="text-xs font-bold uppercase tracking-wider text-tenant-text block">
          Selecione a Porção:
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {variants.map((v) => {
            const isSelected = v.id === selectedVariant.id;
            return (
              <button
                key={v.id}
                type="button"
                disabled={!v.is_available}
                onClick={() => setSelectedVariantId(v.id)}
                className={`p-3.5 rounded-xl text-left border transition-all flex flex-col justify-between gap-1 relative ${
                  isSelected
                    ? 'border-tenant-primary bg-tenant-primary/5 ring-1 ring-tenant-primary shadow-xs'
                    : 'border-tenant-border hover:border-tenant-border/80 bg-tenant-background'
                } ${!v.is_available ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
              >
                <div className="flex items-center justify-between w-full">
                  <span className="font-heading font-bold text-sm text-tenant-text">
                    {v.name}
                  </span>
                  {isSelected && (
                    <div className="w-4 h-4 rounded-full bg-tenant-primary text-white flex items-center justify-center">
                      <Check className="w-2.5 h-2.5 stroke-[3]" />
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between w-full mt-1">
                  <span className="text-[11px] text-tenant-muted">
                    {v.unit_value} {v.unit_type}
                  </span>
                  <span className="font-heading font-bold text-sm text-tenant-primary">
                    {formatBrl(v.price_in_cents)}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Quantidade e Totalizador */}
      <div className="pt-4 border-t border-tenant-border/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <label className="text-xs font-bold uppercase tracking-wider text-tenant-muted block">
            Quantidade:
          </label>
          <div className="inline-flex items-center gap-3 bg-tenant-background border border-tenant-border rounded-xl p-1">
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              disabled={quantity <= 1}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-tenant-text hover:bg-tenant-surface disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
              aria-label="Diminuir quantidade"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <span className="font-heading font-bold text-base text-tenant-text w-6 text-center">
              {quantity}
            </span>
            <button
              type="button"
              onClick={() => setQuantity((q) => q + 1)}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-tenant-text hover:bg-tenant-surface transition-colors"
              aria-label="Aumentar quantidade"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="text-right sm:text-right">
          <span className="text-xs text-tenant-muted block">Total da seleção:</span>
          <span className="font-heading text-2xl font-extrabold text-tenant-text">
            {formatBrl(totalPriceInCents)}
          </span>
        </div>
      </div>

      {/* 3. Botão Principal de Adicionar à Sacola */}
      <div className="space-y-2 pt-2">
        <Button
          type="button"
          onClick={handleAddToCart}
          className="w-full py-4 text-sm uppercase tracking-wider font-bold gap-2.5 rounded-xl shadow-md bg-tenant-primary text-white hover:brightness-110 active:scale-[0.99] transition-all"
        >
          {isAdded ? (
            <>
              <Check className="w-4 h-4 stroke-[3]" />
              <span>Adicionado à Sacola!</span>
            </>
          ) : (
            <>
              <ShoppingBag className="w-4 h-4" />
              <span>Adicionar à Sacola</span>
            </>
          )}
        </Button>

        <p className="text-[11px] text-tenant-muted text-center flex items-center justify-center gap-1.5 pt-1">
          <Clock className="w-3.5 h-3.5" />
          <span>Pratos ultracongelados prontos para aquecer em minutos.</span>
        </p>
      </div>
    </div>
  );
}

