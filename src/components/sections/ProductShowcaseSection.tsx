import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, ChevronRight } from 'lucide-react';
import { Container } from '@/components/ui/Container';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import type { ProductShowcaseContent } from '@/modules/cms/schemas';
import type { Product } from '@/types/database.types';

interface ProductShowcaseSectionProps {
  content: ProductShowcaseContent;
  products?: Product[];
  ctaButtonText?: string;
}

export function ProductShowcaseSection({
  content,
  products = [],
  ctaButtonText = 'Em breve',
}: ProductShowcaseSectionProps) {
  return (
    <section className="py-16 sm:py-24 bg-tenant-background transition-colors">
      <Container size="lg">
        {/* Header da Seção */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
          <div className="space-y-3 max-w-2xl">
            <h2 className="font-heading text-2xl sm:text-3xl lg:text-4xl font-bold text-tenant-text">
              {content.title}
            </h2>
            {content.subtitle && (
              <p className="text-sm sm:text-base text-tenant-muted">
                {content.subtitle}
              </p>
            )}
          </div>

          {content.cta_label && content.cta_href && (
            <Link
              href={content.cta_href}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-tenant-primary hover:text-tenant-secondary transition-colors group shrink-0"
            >
              <span>{content.cta_label}</span>
              <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </Link>
          )}
        </div>

        {/* Grade de Produtos */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
          {products.map((product) => (
            <Card key={product.id} hoverEffect className="flex flex-col h-full bg-tenant-surface overflow-hidden group">
              {/* Topo do Card / Visual */}
              <div className="aspect-[16/10] bg-tenant-background relative flex items-center justify-center overflow-hidden border-b border-tenant-border/40">
                {product.cover_image_url ? (
                  <>
                    <Image
                      src={product.cover_image_url}
                      alt={product.name}
                      fill
                      className="object-cover group-hover:scale-105 transition-transform duration-500"
                      sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-40" />
                    <div className="absolute top-3 left-3 z-10">
                      <Badge variant="secondary" className="text-[10px] bg-white/90 backdrop-blur-xs text-stone-900 border-none font-semibold">
                        {product.category?.name || 'Prato'}
                      </Badge>
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
                <div className="space-y-3">
                  <h3 className="font-heading text-xl font-bold text-tenant-text">
                    {product.name}
                  </h3>
                  {product.short_description && (
                    <p className="text-sm text-tenant-muted leading-relaxed line-clamp-2">
                      {product.short_description}
                    </p>
                  )}
                </div>

                {/* Variações disponíveis (ex: 500 ml, 1000 ml) */}
                {content.show_variants && product.variants && product.variants.length > 0 && (
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

                {/* Ação (Pré-lançamento / Detalhes) */}
                <div className="pt-2">
                  <Link
                    href={`/produtos/${product.slug}`}
                    className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-tenant bg-tenant-surface border border-tenant-border text-tenant-text text-sm font-semibold hover:border-tenant-primary hover:text-tenant-primary transition-all group"
                  >
                    <span>Ver Detalhes</span>
                    <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                  </Link>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </Container>
    </section>
  );
}
