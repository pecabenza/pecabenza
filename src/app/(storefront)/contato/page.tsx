import React from 'react';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { resolveTenantByHost } from '@/lib/tenancy/context';
import { getTenantPublicOrigin } from '@/lib/tenancy/origin';
import { getTenantPageSections } from '@/modules/cms/page-sections';
import { ContactSection } from '@/components/sections/ContactSection';
import { generateBreadcrumbJsonLd } from '@/lib/seo/schema';

export async function generateMetadata(): Promise<Metadata> {
  const headersList = await headers();
  const host = headersList.get('x-tenant-host') || headersList.get('host') || 'localhost:3000';
  const tenantContext = await resolveTenantByHost(host);

  if (!tenantContext) return { title: 'Contato' };

  const origin = getTenantPublicOrigin(tenantContext);

  return {
    metadataBase: new URL(origin),
    title: `Fale Conosco | ${tenantContext.tenant.name}`,
    description: `Entre em contato com a equipe da ${tenantContext.tenant.name} para tirar dúvidas, dar sugestões ou acompanhar novidades.`,
    alternates: {
      canonical: `${origin}/contato`,
    },
  };
}

export default async function ContactPage() {
  const headersList = await headers();
  const host = headersList.get('x-tenant-host') || headersList.get('host') || 'localhost:3000';
  const tenantContext = await resolveTenantByHost(host);

  if (!tenantContext) {
    notFound();
  }

  const { tenant, settings } = tenantContext;
  const origin = getTenantPublicOrigin(tenantContext);
  const cmsSections = await getTenantPageSections(tenant.id, 'contato');
  const contactSec = cmsSections.find((s) => s.section_type === 'ContactSection');

  const breadcrumbJsonLd = generateBreadcrumbJsonLd([
    { name: 'Início', url: origin },
    { name: 'Contato', url: `${origin}/contato` },
  ]);

  if (contactSec && contactSec.is_active === false) {
    return (
      <>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
        />
        <div className="py-16 text-center text-sm text-tenant-muted bg-tenant-background">
          Página de contato temporariamente oculta nas configurações do site.
        </div>
      </>
    );
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <div className="py-6 sm:py-12 bg-tenant-background">
        <ContactSection
          content={{
            title: contactSec?.content?.title || 'Fale Conosco',
            description:
              contactSec?.content?.description ||
              'Tire suas dúvidas sobre nossos pratos, porções, conservação e entregas.',
            show_form: contactSec?.content?.show_form ?? true,
            show_social: contactSec?.content?.show_social ?? true,
          }}
          settings={settings}
          tenantId={tenant.id}
        />
      </div>
    </>
  );
}
