import React from 'react';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { Truck, Store, Clock } from 'lucide-react';
import { resolveTenantByHost } from '@/lib/tenancy/context';
import { getTenantPublicOrigin } from '@/lib/tenancy/origin';
import { getTenantCategories, getTenantProducts } from '@/modules/catalog/service';
import { Container } from '@/components/ui/Container';
import { generateBreadcrumbJsonLd } from '@/lib/seo/schema';
import { StorefrontCatalogView } from '@/components/sections/StorefrontCatalogView';
import { isCommerceEnabled } from '@/lib/tenancy/site-mode';

export async function generateMetadata(): Promise<Metadata> {
  const headersList = await headers();
  const host = headersList.get('x-tenant-host') || headersList.get('host') || 'localhost:3000';
  const tenantContext = await resolveTenantByHost(host);

  if (!tenantContext) return { title: 'Cardápio' };

  const origin = getTenantPublicOrigin(tenantContext);
  const { tenant, settings } = tenantContext;
  const description =
    settings.seo_defaults?.default_meta_description ||
    `Confira o cardápio de ${tenant.name}: escolha suas porções preferidas conforme a disponibilidade.`;

  return {
    metadataBase: new URL(origin),
    title: `Nosso Cardápio | ${tenant.name}`,
    description,
    alternates: {
      canonical: `${origin}/produtos`,
    },
    openGraph: {
      title: `Nosso Cardápio | ${tenant.name}`,
      description,
      type: 'website',
      url: `${origin}/produtos`,
      siteName: tenant.name,
    },
  };
}

export default async function ProductsPage() {
  const headersList = await headers();
  const host = headersList.get('x-tenant-host') || headersList.get('host') || 'localhost:3000';
  const tenantContext = await resolveTenantByHost(host);

  if (!tenantContext) {
    notFound();
  }

  const { tenant, settings, commerceSettings } = tenantContext;
  const origin = getTenantPublicOrigin(tenantContext);
  const [products, categories] = await Promise.all([
    getTenantProducts(tenant.id),
    getTenantCategories(tenant.id),
  ]);

  const commerceEnabled = isCommerceEnabled(tenant.site_mode);

  const catalogSubtitle =
    tenant.slug === 'benza'
      ? 'Feijoadas, lasanhas, escondidinhos e outras delícias preparadas com sabor de comida caseira. Escolha entre nossas opções prontas para saborear ou congeladas para facilitar sua rotina, conforme a disponibilidade do cardápio.'
      : settings.seo_defaults?.default_meta_description ||
        'Escolha seus pratos favoritos e monte seu pedido com praticidade, conforme a disponibilidade do cardápio.';

  const breadcrumbJsonLd = generateBreadcrumbJsonLd([
    { name: 'Início', url: origin },
    { name: 'Cardápio', url: `${origin}/produtos` },
  ]);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <div className="py-10 sm:py-16 bg-tenant-background transition-colors min-h-[70vh]">
        <Container size="lg">
          {/* Header */}
          <div className="max-w-3xl space-y-4 mb-10 sm:mb-12">
            <span className="text-xs uppercase font-bold tracking-widest text-tenant-secondary block">
              {tenant.name}
            </span>
            <h1 className="font-heading text-3xl sm:text-4xl lg:text-5xl font-extrabold text-tenant-text">
              Nosso Cardápio
            </h1>
            <p className="text-sm sm:text-lg text-tenant-muted leading-relaxed">
              {catalogSubtitle}
            </p>

            {/* Contexto Comercial Real (sem hardcode) */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {!commerceEnabled ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-tenant-surface border border-tenant-border text-xs font-medium text-tenant-muted">
                  <Clock className="w-3.5 h-3.5 text-tenant-secondary" />
                  <span>
                    {tenant.site_mode === 'prelaunch'
                      ? settings.prelaunch_cta_text || 'Pré-lançamento — consulte o cardápio'
                      : 'Catálogo institucional'}
                  </span>
                </span>
              ) : (
                <>
                  {commerceSettings?.delivery_enabled && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-tenant-surface border border-tenant-border text-xs font-medium text-tenant-text">
                      <Truck className="w-3.5 h-3.5 text-tenant-primary" />
                      <span>Entrega disponível</span>
                    </span>
                  )}
                  {commerceSettings?.pickup_enabled && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-tenant-surface border border-tenant-border text-xs font-medium text-tenant-text">
                      <Store className="w-3.5 h-3.5 text-tenant-primary" />
                      <span>Retirada no local</span>
                    </span>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Catálogo Organizado por Categorias */}
          <StorefrontCatalogView
            products={products}
            categories={categories}
            siteMode={tenant.site_mode}
          />
        </Container>
      </div>
    </>
  );
}
