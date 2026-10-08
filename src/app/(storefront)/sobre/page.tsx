import React from 'react';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { resolveTenantByHost } from '@/lib/tenancy/context';
import { Container } from '@/components/ui/Container';
import { Card } from '@/components/ui/Card';
import { generateBreadcrumbJsonLd } from '@/lib/seo/schema';

export async function generateMetadata(): Promise<Metadata> {
  const headersList = await headers();
  const host = headersList.get('x-tenant-host') || headersList.get('host') || 'localhost:3000';
  const tenantContext = await resolveTenantByHost(host);

  if (!tenantContext) return { title: 'Nossa Proposta' };

  return {
    title: `Nossa Proposta | ${tenantContext.tenant.name}`,
    description: `Conheça a proposta da ${tenantContext.tenant.name}: refeições bem executadas e práticas para o seu dia a dia.`,
    alternates: {
      canonical: `https://${host}/sobre`,
    },
  };
}

export default async function AboutPage() {
  const headersList = await headers();
  const host = headersList.get('x-tenant-host') || headersList.get('host') || 'localhost:3000';
  const tenantContext = await resolveTenantByHost(host);

  if (!tenantContext) {
    notFound();
  }

  const { tenant } = tenantContext;
  const breadcrumbJsonLd = generateBreadcrumbJsonLd([
    { name: 'Início', url: `https://${host}` },
    { name: 'Nossa Proposta', url: `https://${host}/sobre` },
  ]);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <div className="py-12 sm:py-20 bg-tenant-background transition-colors">
        <Container size="md" className="space-y-12">
          {/* Header */}
          <div className="text-center space-y-4">
            <span className="text-xs uppercase font-bold tracking-widest text-tenant-secondary block">
              Nossa Proposta
            </span>
            <h1 className="font-heading text-3xl sm:text-4xl lg:text-5xl font-extrabold text-tenant-text">
              Comida bem feita para a sua rotina
            </h1>
            <p className="text-base sm:text-lg text-tenant-muted max-w-xl mx-auto leading-relaxed">
              Pratos clássicos preparados com atenção aos detalhes, conservados sob congelamento e prontos para aquecer na sua mesa.
            </p>
          </div>

          {/* Artigo Editorial */}
          <Card className="p-8 sm:p-12 bg-tenant-surface space-y-6 text-tenant-text/90 leading-relaxed text-base sm:text-lg">
            <p className="font-medium text-tenant-primary text-xl leading-relaxed">
              A {tenant.name} foi criada a partir de uma premissa simples: oferecer refeições saborosas que tragam comodidade real ao dia a dia, sem complicar a sua rotina.
            </p>

            <p className="text-sm sm:text-base text-tenant-muted leading-relaxed">
              Sabemos que o tempo é escasso e que nem sempre é possível cozinhar do zero. Por isso, preparamos pratos conhecidos e confortáveis, armazenados sob congelamento em porções individuais (500 ml) ou para compartilhar (1000 ml).
            </p>

            <div className="py-4 border-y border-tenant-border/50 grid grid-cols-1 sm:grid-cols-2 gap-6 my-6">
              <div className="space-y-2">
                <span className="font-heading font-bold text-lg text-tenant-text block">
                  Porções Estruturadas
                </span>
                <p className="text-xs text-tenant-muted leading-relaxed">
                  Embalagens pensadas para atender tanto quem mora sozinho quanto refeições a dois ou em família.
                </p>
              </div>
              <div className="space-y-2">
                <span className="font-heading font-bold text-lg text-tenant-text block">
                  Preparo Descomplicado
                </span>
                <p className="text-xs text-tenant-muted leading-relaxed">
                  Instruções diretas na embalagem para aquecer no fogão ou no forno, preservando o ponto ideal do prato.
                </p>
              </div>
            </div>

            <p className="text-sm sm:text-base text-tenant-muted leading-relaxed">
              Nosso compromisso é com a clareza e o respeito a quem senta à mesa: listas de ingredientes transparentes, informações de preparo precisas e o cuidado presente em cada etapa.
            </p>
          </Card>
        </Container>
      </div>
    </>
  );
}
