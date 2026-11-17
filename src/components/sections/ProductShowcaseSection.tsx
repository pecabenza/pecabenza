import React from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { Container } from '@/components/ui/Container';
import { ProductShowcaseInteractive } from './ProductShowcaseInteractive';
import type { ProductShowcaseContent } from '@/modules/cms/schemas';
import type { Product, ProductCategory, SiteMode } from '@/types/database.types';

interface ProductShowcaseSectionProps {
  content: ProductShowcaseContent;
  products?: Product[];
  categories?: ProductCategory[];
  ctaButtonText?: string;
  siteMode?: SiteMode | null;
}

export function ProductShowcaseSection({
  content,
  products = [],
  categories = [],
  siteMode = 'commerce',
}: ProductShowcaseSectionProps) {
  return (
    <section className="py-16 sm:py-24 bg-tenant-background transition-colors">
      <Container size="lg">
        {/* Header da Seção */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
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

        {/* Vitrine Interativa com Categorias e Compra */}
        <ProductShowcaseInteractive
          products={products}
          categories={categories}
          showVariants={content.show_variants}
          siteMode={siteMode}
        />
      </Container>
    </section>
  );
}
