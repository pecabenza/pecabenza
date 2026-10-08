import React from 'react';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { resolveTenantByHost } from '@/lib/tenancy/context';
import { Container } from '@/components/ui/Container';
import { FileText, CheckCircle2, ShieldCheck } from 'lucide-react';

export async function generateMetadata(): Promise<Metadata> {
  const headersList = await headers();
  const host = headersList.get('x-tenant-host') || headersList.get('host') || 'localhost:3000';
  const tenantContext = await resolveTenantByHost(host);

  if (!tenantContext) {
    return { title: 'Página não encontrada' };
  }

  const { tenant } = tenantContext;
  const title = `Termos de Uso | ${tenant.name}`;
  const description = `Condições gerais de navegação, consulta de cardápio e relacionamento com a ${tenant.name}.`;

  return {
    title,
    description,
    alternates: {
      canonical: `https://${host}/termos`,
    },
    openGraph: {
      title,
      description,
      type: 'website',
      url: `https://${host}/termos`,
      siteName: tenant.name,
    },
  };
}

export default async function TermsPage() {
  const headersList = await headers();
  const host = headersList.get('x-tenant-host') || headersList.get('host') || 'localhost:3000';
  const tenantContext = await resolveTenantByHost(host);

  if (!tenantContext) {
    notFound();
  }

  const { tenant, settings } = tenantContext;

  return (
    <div className="py-12 sm:py-16 bg-tenant-background min-h-screen">
      <Container size="md" className="space-y-10">
        <div className="text-center space-y-4">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-tenant-secondary/10 text-tenant-secondary text-xs font-semibold uppercase tracking-wider">
            <FileText className="w-4 h-4" />
            Condições Gerais
          </div>
          <h1 className="font-heading text-3xl sm:text-4xl lg:text-5xl font-bold text-tenant-text">
            Termos de Uso
          </h1>
          <p className="text-sm sm:text-base text-tenant-muted max-w-xl mx-auto">
            Orientações gerais sobre a utilização deste canal digital institucional da {tenant.name}.
          </p>
        </div>

        <div className="bg-tenant-surface rounded-2xl p-6 sm:p-10 border border-tenant-border/60 shadow-xs space-y-8 text-sm leading-relaxed text-tenant-text/90">
          <section className="space-y-3">
            <h2 className="font-heading text-xl font-bold text-tenant-text">
              1. Apresentação e Objeto
            </h2>
            <p>
              Estes Termos de Uso regulam o acesso e a utilização das páginas da <strong>{tenant.name}</strong>. Nosso objetivo é apresentar nosso cardápio, propostas gastronômicas e canais de contato com transparência e clareza.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-heading text-xl font-bold text-tenant-text">
              2. Informações de Cardápio e Disponibilidade
            </h2>
            <p>
              As descrições de pratos, porções e fichas técnicas apresentadas no site refletem os padrões de preparo da {tenant.name}. Durante o período de pré-lançamento ou homologação, fotos identificadas como ilustrativas servem exclusivamente para visualização de layout. A disponibilidade de produtos e prazos de entrega estão sujeitos a confirmação direta nos canais oficiais de atendimento.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-heading text-xl font-bold text-tenant-text">
              3. Propriedade Intelectual
            </h2>
            <p>
              Todos os direitos relativos à marca {tenant.name}, fotografias de produtos, textos editoriais e elementos visuais são reservados aos seus titulares de direitos. A reprodução não autorizada é vedada pela legislação de direitos autorais.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-heading text-xl font-bold text-tenant-text">
              4. Contato e Esclarecimentos
            </h2>
            <p>
              Em caso de dúvidas sobre estes termos ou sobre nossas operações, entre em contato pelo e-mail{' '}
              <a href={`mailto:${settings.contact_email || 'contato@benza.com.br'}`} className="text-tenant-primary font-semibold underline">
                {settings.contact_email || 'contato@benza.com.br'}
              </a>
              .
            </p>
          </section>

          <section className="space-y-3 pt-4 border-t border-tenant-border/40 text-xs text-tenant-muted">
            <p>Vigência a partir de Outubro de 2026. Ao navegar no site, o usuário declara concordar com as disposições aqui estabelecidas.</p>
          </section>
        </div>
      </Container>
    </div>
  );
}
