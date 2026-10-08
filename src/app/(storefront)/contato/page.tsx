import React from 'react';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { resolveTenantByHost } from '@/lib/tenancy/context';
import { ContactSection } from '@/components/sections/ContactSection';
import { generateBreadcrumbJsonLd } from '@/lib/seo/schema';

export async function generateMetadata(): Promise<Metadata> {
  const headersList = await headers();
  const host = headersList.get('x-tenant-host') || headersList.get('host') || 'localhost:3000';
  const tenantContext = await resolveTenantByHost(host);

  if (!tenantContext) return { title: 'Contato' };

  return {
    title: `Fale Conosco | ${tenantContext.tenant.name}`,
    description: `Entre em contato com a equipe da ${tenantContext.tenant.name} para tirar dúvidas, dar sugestões ou acompanhar novidades.`,
    alternates: {
      canonical: `https://${host}/contato`,
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
  const breadcrumbJsonLd = generateBreadcrumbJsonLd([
    { name: 'Início', url: `https://${host}` },
    { name: 'Contato', url: `https://${host}/contato` },
  ]);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <div className="py-6 sm:py-12 bg-tenant-background">
        <ContactSection
          content={{
            title: 'Fale Conosco',
            description: 'Tire suas dúvidas sobre nossos pratos, porções, conservação e entregas.',
            show_form: true,
            show_social: true,
          }}
          settings={settings}
          tenantId={tenant.id}
        />
      </div>
    </>
  );
}
