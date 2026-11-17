'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ShoppingBag, Plus, Minus, Check, Clock } from 'lucide-react';
import { useCart, formatBrl } from '@/modules/cart/CartContext';
import { Button } from '@/components/ui/Button';
import { isCommerceEnabled } from '@/lib/tenancy/site-mode';
import { hasPromotionalPrice, getDiscountPercentage } from '@/modules/catalog/pricing';
import { validateAndResolveModifiers } from '@/modules/catalog/modifiers';
import type {
  ProductVariant,
  ProductModifierGroup,
  SiteMode,
} from '@/types/database.types';

interface ProductCommerceActionProps {
  productId: string;
  productName: string;
  productSlug: string;
  coverImageUrl?: string | null;
  variants: ProductVariant[];
  modifierGroups?: ProductModifierGroup[];
  siteMode?: SiteMode;
}

export function ProductCommerceAction({
  productId,
  productName,
  productSlug,
  coverImageUrl,
  variants,
  modifierGroups = [],
  siteMode = 'commerce',
}: ProductCommerceActionProps) {
  const { addItem } = useCart();

  // Seleciona a primeira variante disponível por padrão
  const defaultVariant = variants.find((v) => v.is_available) || variants[0];
  const [selectedVariantId, setSelectedVariantId] = useState<string>(defaultVariant?.id || '');
  const [selectedModifierIds, setSelectedModifierIds] = useState<string[]>([]);
  const [modifierError, setModifierError] = useState<string | null>(null);
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

  const modifierValidation = validateAndResolveModifiers(
    modifierGroups,
    selectedModifierIds
  );

  const toggleModifierOption = (group: ProductModifierGroup, optionId: string) => {
    setModifierError(null);
    const groupOptionIds = new Set((group.options || []).map((o) => o.id));
    const maxSel = Math.max(1, group.max_selections || 1);

    setSelectedModifierIds((prev) => {
      const isAlreadySelected = prev.includes(optionId);
      if (maxSel === 1) {
        const withoutGroup = prev.filter((id) => !groupOptionIds.has(id));
        if (isAlreadySelected && !group.is_required && (group.min_selections || 0) === 0) {
          return withoutGroup;
        }
        return [...withoutGroup, optionId];
      }

      if (isAlreadySelected) {
        return prev.filter((id) => id !== optionId);
      }

      const currentGroupCount = prev.filter((id) => groupOptionIds.has(id)).length;
      if (currentGroupCount >= maxSel) {
        return prev;
      }
      return [...prev, optionId];
    });
  };

  const handleAddToCart = () => {
    if (!modifierValidation.valid) {
      setModifierError(modifierValidation.error || 'Selecione as opções obrigatórias.');
      return;
    }

    const unitPriceWithModifiers =
      selectedVariant.price_in_cents + modifierValidation.extraPriceCents;

    addItem({
      productId,
      productName,
      productSlug,
      variantId: selectedVariant.id,
      variantName: selectedVariant.name,
      unitPriceInCents: unitPriceWithModifiers,
      quantity,
      coverImageUrl,
      unitValue: selectedVariant.unit_value,
      unitType: selectedVariant.unit_type,
      selectedModifiers: modifierValidation.selectedSnapshots,
    });

    setIsAdded(true);
    setTimeout(() => setIsAdded(false), 2000);
  };

  const unitPriceTotal =
    selectedVariant.price_in_cents +
    validateAndResolveModifiers(
      modifierGroups.map((g) => ({ ...g, is_required: false, min_selections: 0 })),
      selectedModifierIds
    ).extraPriceCents;
  const totalPriceInCents = unitPriceTotal * quantity;

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
            const isPromo = hasPromotionalPrice(v);
            const discountPct = getDiscountPercentage(v);
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
                <div className="flex items-center justify-between w-full gap-2">
                  <span className="font-heading font-bold text-sm text-tenant-text">
                    {v.name}
                  </span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {discountPct && (
                      <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                        -{discountPct}%
                      </span>
                    )}
                    {isSelected && (
                      <div className="w-4 h-4 rounded-full bg-tenant-primary text-white flex items-center justify-center">
                        <Check className="w-2.5 h-2.5 stroke-[3]" />
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-end justify-between w-full mt-1 gap-2">
                  <span className="text-[11px] text-tenant-muted">
                    {v.unit_value} {v.unit_type}
                  </span>
                  <div className="text-right leading-tight">
                    {isPromo && v.compare_at_price_cents && (
                      <span className="block text-[11px] text-tenant-muted line-through">
                        De {formatBrl(v.compare_at_price_cents)}
                      </span>
                    )}
                    <span className="font-heading font-bold text-sm text-tenant-primary">
                      {isPromo ? `Por ${formatBrl(v.price_in_cents)}` : formatBrl(v.price_in_cents)}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 1b. Grupos de Complementos / Adicionais (Estilo iFood) */}
      {modifierGroups.length > 0 && (
        <div className="space-y-4 pt-2 border-t border-tenant-border/50">
          {modifierGroups.map((group) => {
            const options = (group.options || []).filter((o) => o.is_available !== false);
            if (options.length === 0) return null;
            const maxSel = Math.max(1, group.max_selections || 1);
            const minSel = group.is_required ? Math.max(1, group.min_selections || 0) : (group.min_selections || 0);
            const selectedCount = options.filter((o) => selectedModifierIds.includes(o.id)).length;

            return (
              <div key={group.id} className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <span className="text-xs font-bold uppercase tracking-wider text-tenant-text block">
                      {group.name}
                    </span>
                    <span className="text-[11px] text-tenant-muted">
                      {maxSel === 1
                        ? minSel > 0
                          ? 'Escolha 1 opção'
                          : 'Escolha até 1 opção'
                        : minSel > 0
                        ? `Escolha de ${minSel} até ${maxSel} opções (${selectedCount}/${maxSel})`
                        : `Escolha até ${maxSel} opções (${selectedCount}/${maxSel})`}
                    </span>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                      group.is_required || minSel > 0
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-stone-100 text-stone-600'
                    }`}
                  >
                    {group.is_required || minSel > 0 ? 'Obrigatório' : 'Opcional'}
                  </span>
                </div>

                <div className="space-y-2">
                  {options.map((opt) => {
                    const checked = selectedModifierIds.includes(opt.id);
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => toggleModifierOption(group, opt.id)}
                        className={`w-full px-3.5 py-2.5 rounded-xl border text-left flex items-center justify-between gap-3 transition-all ${
                          checked
                            ? 'border-tenant-primary bg-tenant-primary/5 ring-1 ring-tenant-primary'
                            : 'border-tenant-border bg-tenant-background hover:border-tenant-border/80'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span
                            className={`w-4 h-4 shrink-0 border flex items-center justify-center ${
                              maxSel === 1 ? 'rounded-full' : 'rounded'
                            } ${
                              checked
                                ? 'bg-tenant-primary border-tenant-primary text-white'
                                : 'border-stone-300 bg-white'
                            }`}
                          >
                            {checked && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                          </span>
                          <span className="text-xs font-semibold text-tenant-text truncate">
                            {opt.name}
                          </span>
                        </div>
                        <span className="text-xs font-bold text-tenant-primary shrink-0">
                          {opt.price_in_cents > 0 ? `+ ${formatBrl(opt.price_in_cents)}` : 'Incluso'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {modifierError && (
            <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 font-medium">
              {modifierError}
            </div>
          )}
        </div>
      )}

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

