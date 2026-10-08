import React from 'react';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { resolveTenantByHost } from '@/lib/tenancy/context';
import { getTenantPageWithSections } from '@/modules/cms/service';
import { getTenantProducts } from '@/modules/catalog/service';
import { SectionRenderer } from '@/components/sections/SectionRenderer';
import { generateBusinessJsonLd } from '@/lib/seo/schema';

export async function generateMetadata(): Promise<Metadata> {
  const headersList = await headers();
  const host = headersList.get('x-tenant-host') || headersList.get('host') || 'localhost:3000';
  const tenantContext = await resolveTenantByHost(host);

  if (!tenantContext) {
    return { title: 'Loja não encontrada' };
  }

  const { tenant, settings } = tenantContext;
  const page = await getTenantPageWithSections(tenant.id, 'home');

  const title = page?.meta_title || `${tenant.name} — Pratos Prontos e Conforto Gastronômico`;
  const description = page?.meta_description || settings.seo_defaults.default_meta_description || 'Cardápio de pratos preparados e porcionados para aquecer na sua mesa.';

  return {
    title,
    description,
    alternates: {
      canonical: `https://${host}`,
    },
    openGraph: {
      title,
      description,
      type: 'website',
      url: `https://${host}`,
      siteName: tenant.name,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  };
}

export default async function HomePage() {
  const headersList = await headers();
  const host = headersList.get('x-tenant-host') || headersList.get('host') || 'localhost:3000';
  const tenantContext = await resolveTenantByHost(host);

  if (!tenantContext) {
    notFound();
  }

  const { tenant, settings, branding } = tenantContext;
  const [page, products] = await Promise.all([
    getTenantPageWithSections(tenant.id, 'home'),
    getTenantProducts(tenant.id),
  ]);

  const jsonLd = generateBusinessJsonLd(tenant, settings, `https://${host}`, branding);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div>
        {page?.sections && page.sections.length > 0 ? (
          page.sections.map((section) => (
            <SectionRenderer
              key={section.id}
              section={section}
              products={products}
              settings={settings}
              tenantId={tenant.id}
              prelaunchCtaText={settings.prelaunch_cta_text}
            />
          ))
        ) : (
          <div className="py-24 text-center">
            <p className="text-tenant-muted">Nenhuma seção configurada para a página inicial.</p>
          </div>
        )}
      </div>
    </>
  );
}
