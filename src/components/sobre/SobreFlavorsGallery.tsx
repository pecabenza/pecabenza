'use client';

import React, { useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ChevronLeft, ChevronRight, ArrowRight, UtensilsCrossed } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { getProductDisplayPrice } from '@/modules/catalog/pricing';
import { formatBrl } from '@/modules/cart/cart.utils';
import type { Product } from '@/types/database.types';

interface SobreFlavorsGalleryProps {
  products: Product[];
}

export function SobreFlavorsGallery({ products }: SobreFlavorsGalleryProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);

  const scrollTrack = (direction: 'prev' | 'next') => {
    const el = trackRef.current;
    if (!el) return;
    const step = Math.max(280, Math.round(el.clientWidth * 0.78));
    el.scrollBy({
      left: direction === 'next' ? step : -step,
      behavior: 'smooth',
    });
  };

  if (products.length === 0) {
    return (
      <div className="rounded-2xl bg-tenant-surface border border-tenant-border/70 p-8 sm:p-10 text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-tenant-primary/10 text-tenant-primary flex items-center justify-center mx-auto">
          <UtensilsCrossed className="w-5 h-5" />
        </div>
        <div className="space-y-1.5 max-w-md mx-auto">
          <h3 className="font-heading text-xl font-bold text-tenant-text">
            Cardápio em atualização
          </h3>
          <p className="text-sm text-tenant-muted">
            Acesse a página do cardápio para conferir os pratos ativos no momento.
          </p>
        </div>
        <Link
          href="/produtos"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-tenant bg-tenant-button hover:bg-tenant-buttonHover text-white text-xs font-bold uppercase tracking-wider transition-all"
        >
          <span>Ir para o cardápio</span>
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Controles do carrossel */}
      <div className="flex items-center justify-between gap-4">
        <p className="text-xs sm:text-sm text-tenant-muted">
          Deslize para explorar os pratos ativos no cardápio.
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => scrollTrack('prev')}
            aria-label="Pratos anteriores"
            className="w-10 h-10 rounded-full border border-tenant-border bg-tenant-surface text-tenant-text hover:border-tenant-primary hover:text-tenant-primary flex items-center justify-center transition-colors focus:outline-none focus:ring-2 focus:ring-tenant-primary"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => scrollTrack('next')}
            aria-label="Próximos pratos"
            className="w-10 h-10 rounded-full border border-tenant-border bg-tenant-surface text-tenant-text hover:border-tenant-primary hover:text-tenant-primary flex items-center justify-center transition-colors focus:outline-none focus:ring-2 focus:ring-tenant-primary"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Trilho horizontal touch-friendly com snap */}
      <div
        ref={trackRef}
        className="flex gap-6 overflow-x-auto snap-x snap-mandatory pb-3 scroll-smooth"
      >
        {products.map((product) => {
          const displayPrice = getProductDisplayPrice(product.variants);
          return (
            <Link
              key={product.id}
              href={`/produtos/${product.slug}`}
              className="snap-start shrink-0 w-[84%] sm:w-[46%] lg:w-[31.5%] group rounded-2xl bg-tenant-surface border border-tenant-border/70 overflow-hidden flex flex-col hover:shadow-md hover:border-tenant-primary/40 transition-all duration-300"
            >
              <div className="aspect-[16/10] bg-tenant-background relative overflow-hidden border-b border-tenant-border/40 flex items-center justify-center">
                {product.cover_image_url ? (
                  <Image
                    src={product.cover_image_url}
                    alt={product.name}
                    fill
                    loading="lazy"
                    sizes="(max-width: 640px) 84vw, (max-width: 1024px) 46vw, 32vw"
                    className="object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                ) : (
                  <span className="font-heading text-2xl font-bold text-tenant-primary/30">
                    {product.name.charAt(0)}
                  </span>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-transparent opacity-50" />
                {product.category?.name && (
                  <div className="absolute top-3 left-3">
                    <Badge
                      variant="secondary"
                      className="text-[10px] bg-white/90 text-stone-900 border-none font-semibold"
                    >
                      {product.category.name}
                    </Badge>
                  </div>
                )}
              </div>

              <div className="p-5 flex-1 flex flex-col justify-between gap-4">
                <div className="space-y-1.5">
                  <h3 className="font-heading text-lg font-bold text-tenant-text group-hover:text-tenant-primary transition-colors line-clamp-1">
                    {product.name}
                  </h3>
                  {product.short_description && (
                    <p className="text-xs sm:text-sm text-tenant-muted line-clamp-2 leading-relaxed">
                      {product.short_description}
                    </p>
                  )}
                </div>

                <div className="pt-3 border-t border-tenant-border/40 flex items-center justify-between gap-2">
                  <span className="font-heading font-bold text-sm text-tenant-primary">
                    {displayPrice
                      ? displayPrice.hasMultipleVariants
                        ? `A partir de ${formatBrl(displayPrice.priceInCents)}`
                        : formatBrl(displayPrice.priceInCents)
                      : 'Ver detalhes'}
                  </span>
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-tenant-text group-hover:text-tenant-primary transition-colors">
                    <span>Ver prato</span>
                    <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                  </span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

