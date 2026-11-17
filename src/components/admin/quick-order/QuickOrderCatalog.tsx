'use client';

import React, { useMemo } from 'react';
import { Search, Plus, Flame, Sparkles, RefreshCw, AlertCircle, X } from 'lucide-react';
import { formatBrl } from '@/modules/cart/cart.utils';
import { normalizeCatalogSearch } from '@/modules/catalog/catalog-filter';
import type { CatalogCategory, CatalogProduct, CatalogVariant } from './types';

interface QuickOrderCatalogProps {
  categories: CatalogCategory[];
  catalog: CatalogProduct[];
  isLoadingCatalog: boolean;
  catalogError: string | null;
  onRetryLoadCatalog: () => void;
  selectedCategoryId: string;
  onSelectCategoryId: (id: string) => void;
  productSearch: string;
  onChangeProductSearch: (val: string) => void;
  onSelectVariant: (product: CatalogProduct, variant: CatalogVariant) => void;
}

export function QuickOrderCatalog({
  categories,
  catalog,
  isLoadingCatalog,
  catalogError,
  onRetryLoadCatalog,
  selectedCategoryId,
  onSelectCategoryId,
  productSearch,
  onChangeProductSearch,
  onSelectVariant,
}: QuickOrderCatalogProps) {
  const filteredProducts = useMemo(() => {
    const normalizedQuery = normalizeCatalogSearch(productSearch);
    return catalog.filter((p) => {
      if (!normalizedQuery && selectedCategoryId !== 'all' && p.category_id !== selectedCategoryId) {
        return false;
      }
      if (normalizedQuery) {
        const haystack = normalizeCatalogSearch(
          `${p.name} ${p.short_description || ''} ${p.variants.map((v) => v.name).join(' ')}`
        );
        return haystack.includes(normalizedQuery);
      }
      return true;
    });
  }, [catalog, selectedCategoryId, productSearch]);

  return (
    <div className="bg-white rounded-2xl p-4 sm:p-5 border border-stone-200 shadow-xs space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-black uppercase tracking-wider text-stone-800">
            Catálogo Rápido ({filteredProducts.length})
          </h2>
          <p className="text-xs text-stone-500">
            Toque na porção desejada para adicionar imediatamente à sacola
          </p>
        </div>

        <div className="relative w-full sm:w-64">
          <label htmlFor="pos-catalog-search" className="sr-only">
            Buscar prato ou porção no PDV
          </label>
          <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            id="pos-catalog-search"
            type="text"
            value={productSearch}
            onChange={(e) => onChangeProductSearch(e.target.value)}
            placeholder="Buscar prato ou porção..."
            className="w-full min-h-[38px] pl-9 pr-8 py-1.5 rounded-xl bg-stone-100 border border-stone-200 text-xs text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
          {productSearch && (
            <button
              type="button"
              onClick={() => onChangeProductSearch('')}
              aria-label="Limpar busca do catálogo"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Filtro por Categoria */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        <button
          type="button"
          onClick={() => onSelectCategoryId('all')}
          aria-pressed={selectedCategoryId === 'all'}
          className={`min-h-[36px] px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-colors ${
            selectedCategoryId === 'all'
              ? 'bg-stone-900 text-white'
              : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
          }`}
        >
          Todos os Pratos
        </button>
        {categories.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => onSelectCategoryId(cat.id)}
            aria-pressed={selectedCategoryId === cat.id}
            className={`min-h-[36px] px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-colors ${
              selectedCategoryId === cat.id
                ? 'bg-stone-900 text-white'
                : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
            }`}
          >
            {cat.name}
          </button>
        ))}
      </div>

      {/* Estado de Erro de Carregamento */}
      {catalogError ? (
        <div className="p-5 rounded-xl bg-red-50 border border-red-200 text-center space-y-3">
          <AlertCircle className="w-6 h-6 text-red-600 mx-auto" />
          <div className="space-y-1">
            <p className="text-xs font-bold text-red-900">{catalogError}</p>
            <p className="text-xs text-red-700">
              Verifique sua conexão e recarregue o catálogo antes de iniciar o pedido.
            </p>
          </div>
          <button
            type="button"
            onClick={onRetryLoadCatalog}
            className="min-h-[38px] px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold inline-flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Tentar novamente</span>
          </button>
        </div>
      ) : isLoadingCatalog ? (
        <div className="py-16 text-center text-stone-400 text-xs flex flex-col items-center gap-2">
          <RefreshCw className="w-5 h-5 animate-spin text-amber-600" />
          <span>Carregando cardápio ativo...</span>
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="py-12 text-center text-stone-400 text-xs italic">
          Nenhum prato encontrado para o filtro selecionado.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[640px] overflow-y-auto pr-1">
          {filteredProducts.map((product) => {
            const hasModifiers = (product.modifierGroups?.length || 0) > 0;
            const hasRequiredModifiers = (product.modifierGroups || []).some(
              (g) => g.is_required || (g.min_selections || 0) > 0
            );

            return (
              <div
                key={product.id}
                className="p-3.5 rounded-xl border border-stone-200 hover:border-stone-300 bg-stone-50/50 flex flex-col justify-between gap-3"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-bold text-xs sm:text-sm text-stone-900 leading-snug">
                      {product.name}
                    </h3>
                    {product.is_featured && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 flex items-center gap-0.5 shrink-0">
                        <Sparkles className="w-2.5 h-2.5" /> Top
                      </span>
                    )}
                  </div>
                  {product.short_description && (
                    <p className="text-xs text-stone-500 line-clamp-1 mt-0.5">
                      {product.short_description}
                    </p>
                  )}

                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {product.stationNames.map((stName) => (
                      <span
                        key={stName}
                        className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-stone-200/70 text-stone-700 flex items-center gap-1"
                      >
                        <Flame className="w-2.5 h-2.5 text-amber-600" />
                        {stName}
                      </span>
                    ))}
                    {hasModifiers && (
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          hasRequiredModifiers
                            ? 'bg-amber-100 text-amber-900'
                            : 'bg-emerald-100 text-emerald-800'
                        }`}
                      >
                        {hasRequiredModifiers ? 'Complemento obrigatório' : '+ Complementos'}
                      </span>
                    )}
                  </div>
                </div>

                {/* Botões de Variantes / Porções */}
                <div className="flex flex-wrap gap-1.5 pt-2 border-t border-stone-200/60">
                  {product.variants.map((variant) => {
                    const isAvailable = variant.is_available !== false;
                    return (
                      <button
                        key={variant.id}
                        type="button"
                        disabled={!isAvailable}
                        onClick={() => isAvailable && onSelectVariant(product, variant)}
                        className={`flex-1 min-w-[115px] min-h-[40px] px-2.5 py-2 rounded-lg border text-xs font-bold transition-all flex items-center justify-between gap-1 shadow-2xs ${
                          isAvailable
                            ? 'bg-white hover:bg-emerald-50 border-stone-200 hover:border-emerald-400 text-stone-800 active:scale-[0.98]'
                            : 'bg-stone-100 border-stone-200 text-stone-400 cursor-not-allowed'
                        }`}
                      >
                        <span className="truncate">{variant.name}</span>
                        <span
                          className={`font-mono flex items-center gap-0.5 shrink-0 ${
                            isAvailable ? 'text-emerald-700' : 'text-stone-400'
                          }`}
                        >
                          {isAvailable ? (
                            <>
                              {formatBrl(variant.price_in_cents)}
                              <Plus className="w-3.5 h-3.5 text-emerald-600" />
                            </>
                          ) : (
                            'Esgotado'
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

