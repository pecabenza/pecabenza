import React from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Container } from '@/components/ui/Container';
import type { HeroMinimalContent } from '@/modules/cms/schemas';

interface HeroMinimalProps {
  content: HeroMinimalContent;
}

export function HeroMinimal({ content }: HeroMinimalProps) {
  return (
    <section className="py-12 sm:py-20 bg-tenant-background border-b border-tenant-border/40">
      <Container size="md" className="text-center space-y-4">
        <h1 className="font-heading text-3xl sm:text-4xl font-bold text-tenant-text">
          {content.title}
        </h1>
        {content.subtitle && (
          <p className="text-base sm:text-lg text-tenant-muted max-w-xl mx-auto">
            {content.subtitle}
          </p>
        )}
        {content.cta_label && content.cta_href && (
          <div className="pt-2">
            <Link
              href={content.cta_href}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-tenant bg-tenant-primary text-white text-sm font-medium hover:brightness-110 transition-all"
            >
              <span>{content.cta_label}</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        )}
      </Container>
    </section>
  );
}
