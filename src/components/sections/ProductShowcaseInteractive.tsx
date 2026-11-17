'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { QuickAddToCartButton } from '@/components/cart/QuickAddToCartButton';
import { getProductDisplayPrice } from '@/modules/catalog/pricing';
import { formatBrl } from '@/modules/cart/cart.utils';
import type { Product, ProductCategory, SiteMode } from '@/types/database.types';

interface ProductShowcaseInteractiveProps {
  products: Product[];
  categories?: ProductCategory[];
  showVariants?: boolean;
  siteMode?: SiteMode | null;
}

export function ProductShowcaseInteractive({
  products,
  categories = [],
  showVariants = true,
  siteMode = 'commerce',
}: ProductShowcaseInteractiveProps) {
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');

  const availableCategories = useMemo(() => {
    const productCatIds = new Set(
      products.map((p) => p.category_id || p.category?.id).filter(Boolean)
    );
    if (categories.length > 0) {
      return categories.filter((c) => productCatIds.has(c.id));
    }
    const derived = new Map<string, ProductCategory>();
    for (const p of products) {
      if (p.category && !derived.has(p.category.id)) {
        derived.set(p.category.id, p.category);
      }
    }
    return Array.from(derived.values());
  }, [products, categories]);

  const filteredProducts = useMemo(() => {
    if (selectedCategoryId === 'all') return products;
    return products.filter(
      (p) => p.category_id === selectedCategoryId || p.category?.id === selectedCategoryId
    );
  }, [products, selectedCategoryId]);

  if (products.length === 0) {
    return (
      <div className="p-8 rounded-2xl bg-tenant-surface border border-tenant-border/70 text-center space-y-3">
        <p className="text-sm text-tenant-muted">
          Nosso cardápio está sendo atualizado. Confira em breve ou fale conosco.
        </p>
        <Link
          href="/contato"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-tenant-primary hover:underline"
        >
          <span>Falar com a equipe</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Navegação por Categorias (Apenas quando houver mais de 1 categoria com produtos) */}
      {availableCategories.length > 1 && (
        <div
          role="tablist"
          aria-label="Filtrar vitrine por categoria"
          className="flex items-center gap-2 overflow-x-auto pb-2"
        >
          <button
            type="button"
            role="tab"
            aria-selected={selectedCategoryId === 'all'}
            onClick={() => setSelectedCategoryId('all')}
            className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all ${
              selectedCategoryId === 'all'
                ? 'bg-tenant-button text-white shadow-xs'
                : 'bg-tenant-surface border border-tenant-border text-tenant-text hover:border-tenant-primary'
            }`}
          >
            Todos ({products.length})
          </button>

          {availableCategories.map((cat) => {
            const count = products.filter(
              (p) => p.category_id === cat.id || p.category?.id === cat.id
            ).length;
            const isSelected = selectedCategoryId === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                role="tab"
                aria-selected={isSelected}
                onClick={() => setSelectedCategoryId(cat.id)}
                className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all ${
                  isSelected
                    ? 'bg-tenant-button text-white shadow-xs'
                    : 'bg-tenant-surface border border-tenant-border text-tenant-text hover:border-tenant-primary'
                }`}
              >
                {cat.name} ({count})
              </button>
            );
          })}
        </div>
      )}

      {/* Grade de Produtos */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
        {filteredProducts.map((product) => {
          const displayPrice = getProductDisplayPrice(product.variants);
          const hasModifiers = Boolean(
            product.modifier_groups && product.modifier_groups.length > 0
          );
          return (
            <Card
              key={product.id}
              hoverEffect
              className="flex flex-col h-full bg-tenant-surface overflow-hidden group"
            >
              {/* Topo do Card / Visual */}
              <div className="aspect-[16/10] bg-tenant-background relative flex items-center justify-center overflow-hidden border-b border-tenant-border/40">
                {product.cover_image_url ? (
                  <>
                    <Image
                      src={product.cover_image_url}
                      alt={product.name}
                      fill
                      loading="lazy"
                      className="object-cover group-hover:scale-105 transition-transform duration-500"
                      sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-40" />
                    <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5">
                      <Badge
                        variant="secondary"
                        className="text-[10px] bg-white/90 backdrop-blur-xs text-stone-900 border-none font-semibold"
                      >
                        {product.category?.name || 'Prato'}
                      </Badge>
                      {displayPrice?.hasPromo && displayPrice.discountPercentage && (
                        <Badge className="text-[10px] bg-emerald-600 text-white border-none font-bold">
                          -{displayPrice.discountPercentage}%
                        </Badge>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="text-center space-y-1 p-6">
                    <span className="text-xs uppercase tracking-widest text-tenant-muted font-semibold block">
                      {product.category?.name || 'Prato'}
                    </span>
                    <p className="font-heading text-xl font-bold text-tenant-text line-clamp-1">
                      {product.name}
                    </p>
                  </div>
                )}
              </div>

              {/* Corpo */}
              <div className="p-6 flex flex-col flex-1 justify-between space-y-5">
                <div className="space-y-2.5">
                  <h3 className="font-heading text-xl font-bold text-tenant-text">
                    {product.name}
                  </h3>
                  {product.short_description && (
                    <p className="text-sm text-tenant-muted leading-relaxed line-clamp-2">
                      {product.short_description}
                    </p>
                  )}
                  {hasModifiers && (
                    <span className="inline-block text-[11px] font-medium text-tenant-secondary">
                      Personalizável com complementos
                    </span>
                  )}
                </div>

                {/* Variações disponíveis */}
                {showVariants && product.variants && product.variants.length > 0 && (
                  <div className="space-y-1.5 pt-2 border-t border-tenant-border/40">
                    <span className="text-[11px] uppercase tracking-wider text-tenant-muted font-semibold block">
                      Porções disponíveis
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {product.variants.map((v) => (
                        <Badge key={v.id} variant="neutral" className="text-[11px]">
                          {v.name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Preço ("De / Por") */}
                {displayPrice && (
                  <div className="pt-2 border-t border-tenant-border/40 flex items-baseline gap-2 flex-wrap">
                    {displayPrice.hasPromo && displayPrice.compareAtPriceCents && (
                      <span className="text-xs text-tenant-muted line-through">
                        De {formatBrl(displayPrice.compareAtPriceCents)}
                      </span>
                    )}
                    <span className="font-heading text-lg font-bold text-tenant-primary">
                      {displayPrice.hasPromo
                        ? `Por ${formatBrl(displayPrice.priceInCents)}`
                        : displayPrice.hasMultipleVariants
                        ? `A partir de ${formatBrl(displayPrice.priceInCents)}`
                        : formatBrl(displayPrice.priceInCents)}
                    </span>
                  </div>
                )}

                {/* Ação */}
                <div className="pt-2 flex items-center gap-2">
                  <Link
                    href={`/produtos/${product.slug}`}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-tenant bg-tenant-surface border border-tenant-border text-tenant-text text-xs font-semibold hover:border-tenant-primary hover:text-tenant-primary transition-all group"
                  >
                    <span>Ver Detalhes</span>
                    <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                  </Link>
                  <QuickAddToCartButton product={product} siteMode={siteMode} />
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

