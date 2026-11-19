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

  if (!tenantContext) return { title: 'Cardápio Digital' };

  const origin = getTenantPublicOrigin(tenantContext);
  const { tenant, settings } = tenantContext;
  const description =
    settings.seo_defaults?.default_meta_description ||
    `Cardápio digital de ${tenant.name}: consulte pratos, preços e peça online com praticidade.`;

  return {
    metadataBase: new URL(origin),
    title: `Cardápio Digital | ${tenant.name}`,
    description,
    alternates: {
      canonical: `${origin}/cardapio`,
    },
    openGraph: {
      title: `Cardápio Digital | ${tenant.name}`,
      description,
      type: 'website',
      url: `${origin}/cardapio`,
      siteName: tenant.name,
    },
  };
}

export default async function DigitalMenuPage() {
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

  const subtitle =
    tenant.slug === 'benza'
      ? 'Consulte nossos pratos prontos e opções congeladas, escolha suas porções e monte seu pedido direto pelo celular.'
      : settings.seo_defaults?.default_meta_description ||
        'Consulte nosso cardápio digital e monte seu pedido com praticidade.';

  const breadcrumbJsonLd = generateBreadcrumbJsonLd([
    { name: 'Início', url: origin },
    { name: 'Cardápio Digital', url: `${origin}/cardapio` },
  ]);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <div className="py-8 sm:py-12 bg-tenant-background transition-colors min-h-[70vh]">
        <Container size="lg">
          <div className="max-w-3xl space-y-3 mb-8">
            <span className="text-xs uppercase font-bold tracking-widest text-tenant-secondary block">
              {tenant.name} • Cardápio Digital
            </span>
            <h1 className="font-heading text-3xl sm:text-4xl font-extrabold text-tenant-text">
              Escolha seus pratos
            </h1>
            <p className="text-sm text-tenant-muted leading-relaxed">{subtitle}</p>

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

          <StorefrontCatalogView
            products={products}
            categories={categories}
            siteMode={tenant.site_mode}
            variant="compact"
          />
        </Container>
      </div>
    </>
  );
}

