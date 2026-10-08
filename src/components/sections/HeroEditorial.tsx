import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, Sparkles, UtensilsCrossed } from 'lucide-react';
import { Container } from '@/components/ui/Container';
import { Badge } from '@/components/ui/Badge';
import type { HeroEditorialContent } from '@/modules/cms/schemas';

interface HeroEditorialProps {
  content: HeroEditorialContent;
}

export function HeroEditorial({ content }: HeroEditorialProps) {
  const hasImage = Boolean(content.image_url);

  return (
    <section className="relative overflow-hidden py-12 sm:py-20 lg:py-24 bg-tenant-background transition-colors">
      <Container size="lg" className="relative z-10">
        <div className={`grid grid-cols-1 ${hasImage ? 'lg:grid-cols-12 gap-12 lg:gap-16 items-center' : 'max-w-3xl'}`}>
          {/* Coluna Editorial / Textos */}
          <div className={`${hasImage ? 'lg:col-span-7' : ''} space-y-6 sm:space-y-8`}>
            {/* Badge opcional */}
            {content.badge && (
              <Badge variant="primary" className="gap-1.5 shadow-xs">
                <Sparkles className="w-3.5 h-3.5 text-tenant-secondary" />
                <span>{content.badge}</span>
              </Badge>
            )}

            {/* Heading Principal (H1 da página) */}
            <h1 className="font-heading text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-tenant-text leading-[1.15]">
              {content.title}
            </h1>

            {/* Subtítulo */}
            {content.subtitle && (
              <p className="text-lg sm:text-xl text-tenant-muted leading-relaxed max-w-2xl font-normal">
                {content.subtitle}
              </p>
            )}

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 pt-2">
              {content.primary_cta_label && content.primary_cta_href && (
                <Link
                  href={content.primary_cta_href}
                  className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-tenant bg-tenant-primary text-white font-medium hover:brightness-110 shadow-sm transition-all text-sm group"
                >
                  <span>{content.primary_cta_label}</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </Link>
              )}

              {content.secondary_cta_label && content.secondary_cta_href && (
                <Link
                  href={content.secondary_cta_href}
                  className="inline-flex items-center justify-center px-6 py-3.5 rounded-tenant bg-tenant-surface border border-tenant-border text-tenant-text font-medium hover:border-tenant-primary hover:text-tenant-primary transition-all text-sm"
                >
                  {content.secondary_cta_label}
                </Link>
              )}
            </div>

            {/* Nota de Destaque / Modo Pré-lançamento */}
            {content.highlight_note && (
              <div className="pt-2">
                <p className="text-xs text-tenant-muted tracking-wide flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-tenant-secondary inline-block animate-ping" />
                  <span>{content.highlight_note}</span>
                </p>
              </div>
            )}
          </div>

          {/* Coluna Visual (Fotografia Editorial) */}
          {hasImage && content.image_url && (
            <div className="lg:col-span-5 relative">
              <div className="relative aspect-[4/3] sm:aspect-[16/11] lg:aspect-[4/3] rounded-2xl overflow-hidden shadow-2xl border border-tenant-border/60 bg-tenant-surface group">
                <Image
                  src={content.image_url}
                  alt={content.title}
                  fill
                  priority
                  className="object-cover object-center group-hover:scale-105 transition-transform duration-700 ease-out"
                  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 40vw"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-stone-950/40 via-transparent to-transparent opacity-60" />

                {/* Badge Flutuante de Culinária */}
                <div className="absolute bottom-4 left-4 right-4 sm:bottom-6 sm:left-6 sm:right-6">
                  <div className="bg-tenant-surface/90 backdrop-blur-md p-3.5 rounded-xl border border-tenant-border/40 shadow-lg flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-tenant-primary/10 text-tenant-primary flex items-center justify-center shrink-0">
                      <UtensilsCrossed className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-tenant-text">Pratos Porcionados</p>
                      <p className="text-[11px] text-tenant-muted">Embalagens sob medida & preparo prático</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </Container>
    </section>
  );
}
