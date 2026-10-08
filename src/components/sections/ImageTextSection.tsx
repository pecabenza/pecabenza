import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight } from 'lucide-react';
import { Container } from '@/components/ui/Container';
import type { ImageTextContent } from '@/modules/cms/schemas';

interface ImageTextSectionProps {
  content: ImageTextContent;
}

export function ImageTextSection({ content }: ImageTextSectionProps) {
  const isImageRight = content.image_position === 'right';

  return (
    <section className="py-16 sm:py-24 bg-tenant-background transition-colors">
      <Container size="lg">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-16 items-center">
          {/* Imagem */}
          <div className={`lg:col-span-5 ${isImageRight ? 'lg:order-2' : 'lg:order-1'}`}>
            <div className="relative rounded-tenant overflow-hidden aspect-[4/3] bg-tenant-surface border border-tenant-border/60 shadow-sm flex items-center justify-center p-6">
              {content.image_url ? (
                <Image
                  src={content.image_url}
                  alt={content.title}
                  fill
                  className="object-cover"
                />
              ) : (
                <div className="text-center space-y-2 p-6">
                  <div className="w-10 h-10 rounded-full bg-tenant-secondary/15 text-tenant-secondary mx-auto flex items-center justify-center font-bold">
                    ✦
                  </div>
                  <p className="text-xs text-tenant-muted font-medium">
                    Fotografia de Referência
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Texto */}
          <div className={`lg:col-span-7 space-y-6 ${isImageRight ? 'lg:order-1' : 'lg:order-2'}`}>
            {content.eyebrow && (
              <span className="text-xs uppercase font-bold tracking-widest text-tenant-secondary block">
                {content.eyebrow}
              </span>
            )}

            <h2 className="font-heading text-2xl sm:text-3xl lg:text-4xl font-bold text-tenant-text leading-tight">
              {content.title}
            </h2>

            <p className="text-sm sm:text-base text-tenant-muted leading-relaxed whitespace-pre-line">
              {content.description}
            </p>

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
        </div>
      </Container>
    </section>
  );
}
