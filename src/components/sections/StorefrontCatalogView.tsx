'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Search, X, UtensilsCrossed } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { QuickAddToCartButton } from '@/components/cart/QuickAddToCartButton';
import { SafeProductImage } from '@/components/storefront/SafeProductImage';
import { getProductDisplayPrice } from '@/modules/catalog/pricing';
import { buildCatalogSections } from '@/modules/catalog/catalog-filter';
import { formatBrl } from '@/modules/cart/cart.utils';
import type { Product, ProductCategory, SiteMode } from '@/types/database.types';

interface StorefrontCatalogViewProps {
  products: Product[];
  categories: ProductCategory[];
  siteMode: SiteMode;
  variant?: 'default' | 'compact';
}

export function StorefrontCatalogView({
  products,
  categories,
  siteMode,
  variant = 'default',
}: StorefrontCatalogViewProps) {
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const hasSearch = searchQuery.trim().length > 0;

  // Seções completas (para abas e contadores estáveis) e seções filtradas pela busca
  const allSections = useMemo(
    () => buildCatalogSections(products, categories, ''),
    [products, categories]
  );

  const searchedSections = useMemo(
    () => (hasSearch ? buildCatalogSections(products, categories, searchQuery) : allSections),
    [hasSearch, products, categories, searchQuery, allSections]
  );

  // Quando há busca ativa, exibe resultados globais para evitar falso "vazio" em outra categoria
  const visibleSections =
    hasSearch || selectedCategoryId === 'all'
      ? searchedSections
      : searchedSections.filter((s) => s.category.id === selectedCategoryId);

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    if (value.trim() && selectedCategoryId !== 'all') {
      setSelectedCategoryId('all');
    }
  };

  if (products.length === 0) {
    return (
      <div className="p-8 sm:p-12 rounded-2xl bg-tenant-surface border border-tenant-border text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-tenant-primary/10 text-tenant-primary flex items-center justify-center mx-auto">
          <UtensilsCrossed className="w-5 h-5" />
        </div>
        <div className="space-y-1.5 max-w-md mx-auto">
          <h2 className="font-heading text-xl font-bold text-tenant-text">
            Cardápio em atualização
          </h2>
          <p className="text-sm text-tenant-muted leading-relaxed">
            Ainda não há pratos ativos disponíveis para exibição no momento. Fale com nossa equipe para mais informações.
          </p>
        </div>
        <Link
          href="/contato"
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-tenant bg-tenant-button hover:bg-tenant-buttonHover text-white text-xs font-bold uppercase tracking-wider transition-all"
        >
          <span>Falar com a equipe</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    );
  }

  const renderProductCard = (product: Product) => {
    const displayPrice = getProductDisplayPrice(product.variants);
    const hasModifiers = Boolean(product.modifier_groups && product.modifier_groups.length > 0);
    const isAvailable = displayPrice ? displayPrice.hasAvailableVariant : false;

    if (variant === 'compact') {
      return (
        <Card
          key={product.id}
          hoverEffect
          className="flex flex-row items-stretch bg-tenant-surface overflow-hidden group motion-reduce:transition-none"
        >
          <Link
            href={`/produtos/${product.slug}`}
            className="w-28 sm:w-36 shrink-0 bg-tenant-background relative flex items-center justify-center overflow-hidden border-r border-tenant-border/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-tenant-primary"
          >
            <SafeProductImage
              src={product.cover_image_url}
              alt={product.name}
              categoryLabel={product.category?.name || 'Prato'}
              sizes="144px"
              className="object-cover group-hover:scale-105 transition-transform duration-500 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
            />
            {displayPrice?.hasPromo && displayPrice.discountPercentage && (
              <Badge className="absolute top-2 left-2 z-10 text-[10px] bg-emerald-600 text-white border-none font-bold">
                -{displayPrice.discountPercentage}%
              </Badge>
            )}
            {!isAvailable && (
              <Badge className="absolute top-2 left-2 z-10 text-[10px] bg-stone-800 text-white border-none font-bold">
                Indisponível
              </Badge>
            )}
          </Link>

          <div className="p-3.5 sm:p-4 flex flex-col flex-1 justify-between gap-2 min-w-0">
            <div className="space-y-1">
              <div className="flex items-start justify-between gap-2">
                <Link
                  href={`/produtos/${product.slug}`}
                  className="font-heading text-base sm:text-lg font-bold text-tenant-text group-hover:text-tenant-primary transition-colors line-clamp-1"
                >
                  {product.name}
                </Link>
              </div>
              {product.short_description && (
                <p className="text-xs text-tenant-muted leading-snug line-clamp-2">
                  {product.short_description}
                </p>
              )}
              {hasModifiers && (
                <span className="inline-block text-[10px] font-medium text-tenant-secondary">
                  Personalizável com complementos
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t border-tenant-border/40">
              {displayPrice ? (
                <div className="flex items-baseline gap-1.5 flex-wrap">
                  {displayPrice.hasPromo && displayPrice.compareAtPriceCents && (
                    <span className="text-[11px] text-tenant-muted line-through">
                      {formatBrl(displayPrice.compareAtPriceCents)}
                    </span>
                  )}
                  <span className="font-heading text-sm sm:text-base font-extrabold text-tenant-primary">
                    {displayPrice.hasPromo
                      ? formatBrl(displayPrice.priceInCents)
                      : displayPrice.hasMultipleVariants
                      ? `A partir de ${formatBrl(displayPrice.priceInCents)}`
                      : formatBrl(displayPrice.priceInCents)}
                  </span>
                </div>
              ) : (
                <span />
              )}

              <div className="flex items-center gap-1.5">
                <Link
                  href={`/produtos/${product.slug}`}
                  className="px-2.5 py-2 rounded-tenant bg-tenant-surface border border-tenant-border text-[11px] font-semibold text-tenant-text hover:border-tenant-primary hover:text-tenant-primary transition-colors"
                >
                  Detalhes
                </Link>
                <QuickAddToCartButton product={product} siteMode={siteMode} />
              </div>
            </div>
          </div>
        </Card>
      );
    }

    return (
      <Card
        key={product.id}
        hoverEffect
        className="flex flex-col h-full bg-tenant-surface overflow-hidden group motion-reduce:transition-none"
      >
        {/* Visual Header */}
        <Link
          href={`/produtos/${product.slug}`}
          className="aspect-[16/10] bg-tenant-background relative flex items-center justify-center overflow-hidden border-b border-tenant-border/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-tenant-primary"
        >
          <SafeProductImage
            src={product.cover_image_url}
            alt={product.name}
            categoryLabel={product.category?.name || 'Prato'}
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            className="object-cover group-hover:scale-105 transition-transform duration-500 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
            overlayClassName="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-40"
          />

          <div className="absolute top-2.5 left-2.5 z-10 flex items-center gap-1.5 flex-wrap">
            {product.category?.name && (
              <Badge
                variant="secondary"
                className="text-[10px] bg-white/95 text-stone-900 border-none font-semibold shadow-xs"
              >
                {product.category.name}
              </Badge>
            )}
            {displayPrice?.hasPromo && displayPrice.discountPercentage && (
              <Badge className="text-[10px] bg-emerald-600 text-white border-none font-bold">
                -{displayPrice.discountPercentage}%
              </Badge>
            )}
            {!isAvailable && (
              <Badge className="text-[10px] bg-stone-800 text-white border-none font-bold">
                Indisponível
              </Badge>
            )}
          </div>
        </Link>

        {/* Conteúdo compacto mobile-first */}
        <div className="p-4 sm:p-5 flex flex-col flex-1 justify-between space-y-4">
          <div className="space-y-1.5">
            <Link
              href={`/produtos/${product.slug}`}
              className="block focus:outline-none focus-visible:underline"
            >
              <h3 className="font-heading text-lg sm:text-xl font-bold text-tenant-text group-hover:text-tenant-primary transition-colors">
                {product.name}
              </h3>
            </Link>
            {product.short_description && (
              <p className="text-xs sm:text-sm text-tenant-muted leading-relaxed line-clamp-2">
                {product.short_description}
              </p>
            )}
            {hasModifiers && (
              <span className="inline-block text-[11px] font-medium text-tenant-secondary">
                Personalizável com complementos
              </span>
            )}
          </div>

          {/* Variações */}
          {product.variants && product.variants.length > 0 && (
            <div className="space-y-1.5 pt-2 border-t border-tenant-border/40">
              <span className="text-[10px] uppercase tracking-wider text-tenant-muted font-semibold block">
                Porções disponíveis
              </span>
              <div className="flex flex-wrap gap-1.5">
                {product.variants.map((v) => (
                  <Badge
                    key={v.id}
                    variant="neutral"
                    className={`text-[11px] ${v.is_available === false ? 'opacity-50 line-through' : ''}`}
                  >
                    {v.name}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Preço ("De / Por") */}
          {displayPrice && (
            <div className="pt-2 border-t border-tenant-border/40 flex items-baseline justify-between gap-2">
              <div className="flex items-baseline gap-2 flex-wrap">
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
            </div>
          )}

          {/* Ações */}
          <div className="pt-1 flex items-center gap-2">
            <Link
              href={`/produtos/${product.slug}`}
              className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-tenant bg-tenant-surface border border-tenant-border text-tenant-text text-xs font-semibold hover:border-tenant-primary hover:text-tenant-primary transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-tenant-primary"
            >
              <span>Ver detalhes</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
            <QuickAddToCartButton product={product} siteMode={siteMode} />
          </div>
        </div>
      </Card>
    );
  };

  return (
    <div className="space-y-8">
      {/* Barra de Busca e Abas de Categoria */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-tenant-border/50">
        <div
          role="group"
          aria-label="Filtrar por categoria"
          className="flex items-center gap-2 overflow-x-auto pb-1"
        >
          <button
            type="button"
            aria-pressed={selectedCategoryId === 'all'}
            onClick={() => setSelectedCategoryId('all')}
            className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-tenant-primary ${
              selectedCategoryId === 'all'
                ? 'bg-tenant-button text-white shadow-xs'
                : 'bg-tenant-surface border border-tenant-border text-tenant-text hover:border-tenant-primary'
            }`}
          >
            Todos ({products.length})
          </button>
          {allSections.map((sec) => {
            const active = selectedCategoryId === sec.category.id && !hasSearch;
            return (
              <button
                key={sec.category.id}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  setSelectedCategoryId(sec.category.id);
                  if (hasSearch) setSearchQuery('');
                }}
                className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-tenant-primary ${
                  active
                    ? 'bg-tenant-button text-white shadow-xs'
                    : 'bg-tenant-surface border border-tenant-border text-tenant-text hover:border-tenant-primary'
                }`}
              >
                {sec.category.name} ({sec.items.length})
              </button>
            );
          })}
        </div>

        <div className="relative w-full md:w-72 shrink-0">
          <label htmlFor="catalog-search-input" className="sr-only">
            Buscar prato no cardápio
          </label>
          <Search className="w-4 h-4 text-tenant-muted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            id="catalog-search-input"
            type="search"
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Buscar prato ou ingrediente..."
            className="w-full pl-9 pr-9 py-2 rounded-full bg-tenant-surface border border-tenant-border text-xs sm:text-sm text-tenant-text focus:outline-none focus-visible:ring-2 focus-visible:ring-tenant-primary focus:border-tenant-primary"
          />
          {hasSearch && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              aria-label="Limpar pesquisa"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-full text-tenant-muted hover:text-tenant-text transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Seções Agrupadas por Categoria */}
      {visibleSections.length === 0 ? (
        <div className="p-10 rounded-tenant bg-tenant-surface border border-tenant-border text-center space-y-3">
          <p className="text-sm text-tenant-muted">
            Nenhum prato encontrado para &ldquo;{searchQuery.trim()}&rdquo;.
          </p>
          {hasSearch && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setSelectedCategoryId('all');
              }}
              className="inline-flex items-center justify-center px-4 py-2 rounded-tenant bg-tenant-button hover:bg-tenant-buttonHover text-white text-xs font-semibold transition-all"
            >
              Limpar pesquisa
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-12">
          {visibleSections.map((section) => (
            <section key={section.category.id} className="space-y-5">
              <div className="flex items-baseline justify-between border-b border-tenant-border/40 pb-2">
                <h2 className="font-heading text-2xl font-bold text-tenant-text">
                  {section.category.name}
                </h2>
                <span className="text-xs text-tenant-muted font-medium">
                  {section.items.length}{' '}
                  {section.items.length === 1 ? 'opção' : 'opções'}
                </span>
              </div>
              <div
                className={
                  variant === 'compact'
                    ? 'grid grid-cols-1 lg:grid-cols-2 gap-3.5 sm:gap-4'
                    : 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8'
                }
              >
                {section.items.map(renderProductCard)}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
