import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight } from 'lucide-react';
import { Container } from '@/components/ui/Container';
import type { BrandStoryContent } from '@/modules/cms/schemas';

interface BrandStorySectionProps {
  content: BrandStoryContent;
}

export function BrandStorySection({ content }: BrandStorySectionProps) {
  return (
    <section className="py-16 sm:py-24 bg-tenant-surface border-y border-tenant-border/40 transition-colors">
      <Container size="lg">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-16 items-center">
          {/* Coluna de Texto */}
          <div className="lg:col-span-7 space-y-6">
            {content.eyebrow && (
              <span className="text-xs uppercase font-bold tracking-widest text-tenant-secondary block">
                {content.eyebrow}
              </span>
            )}

            <h2 className="font-heading text-2xl sm:text-3xl lg:text-4xl font-bold text-tenant-text leading-tight">
              {content.title}
            </h2>

            {content.lead_paragraph && (
              <p className="text-base sm:text-lg text-tenant-text/90 font-medium leading-relaxed">
                {content.lead_paragraph}
              </p>
            )}

            {content.description && (
              <p className="text-sm sm:text-base text-tenant-muted leading-relaxed">
                {content.description}
              </p>
            )}

            {content.cta_label && content.cta_href && (
              <div className="pt-2">
                <Link
                  href={content.cta_href}
                  className="inline-flex items-center gap-2 text-sm font-semibold text-tenant-primary hover:text-tenant-secondary transition-colors group"
                >
                  <span>{content.cta_label}</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </Link>
              </div>
            )}
          </div>

          {/* Coluna Visual (Card de Composição ou Imagem) */}
          <div className="lg:col-span-5">
            <div className="relative rounded-tenant overflow-hidden aspect-[4/3] bg-tenant-background border border-tenant-border/60 shadow-sm flex items-center justify-center p-8">
              {content.image_url ? (
                <Image
                  src={content.image_url}
                  alt={content.title}
                  fill
                  className="object-cover"
                />
              ) : (
                <div className="text-center space-y-3">
                  <div className="w-12 h-12 rounded-full bg-tenant-primary/10 text-tenant-primary mx-auto flex items-center justify-center font-heading text-xl font-bold">
                    §
                  </div>
                  <p className="text-xs text-tenant-muted uppercase tracking-wider font-semibold">
                    Essência & Cuidado
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
