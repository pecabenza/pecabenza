import React from 'react';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { resolveTenantByHost } from '@/lib/tenancy/context';
import { Container } from '@/components/ui/Container';
import { ShieldCheck, Lock, Eye, Trash2, Mail } from 'lucide-react';

export async function generateMetadata(): Promise<Metadata> {
  const headersList = await headers();
  const host = headersList.get('x-tenant-host') || headersList.get('host') || 'localhost:3000';
  const tenantContext = await resolveTenantByHost(host);

  if (!tenantContext) {
    return { title: 'Página não encontrada' };
  }

  const { tenant } = tenantContext;
  const title = `Política de Privacidade e Proteção de Dados | ${tenant.name}`;
  const description = `Conheça como a ${tenant.name} coleta, trata e protege seus dados pessoais em total conformidade com a LGPD (Lei nº 13.709/2018).`;

  return {
    title,
    description,
    alternates: {
      canonical: `https://${host}/privacidade`,
    },
    openGraph: {
      title,
      description,
      type: 'website',
      url: `https://${host}/privacidade`,
      siteName: tenant.name,
    },
  };
}

export default async function PrivacyPage() {
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
        {/* Cabeçalho */}
        <div className="text-center space-y-4">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-tenant-primary/10 text-tenant-primary text-xs font-semibold uppercase tracking-wider">
            <ShieldCheck className="w-4 h-4" />
            Privacidade e Segurança
          </div>
          <h1 className="font-heading text-3xl sm:text-4xl lg:text-5xl font-bold text-tenant-text">
            Política de Privacidade
          </h1>
          <p className="text-sm sm:text-base text-tenant-muted max-w-xl mx-auto">
            Compromisso de transparência e respeito à sua privacidade na {tenant.name}, em conformidade com a LGPD (Lei nº 13.709/2018).
          </p>
        </div>

        {/* Conteúdo Institucional da Política */}
        <div className="bg-tenant-surface rounded-2xl p-6 sm:p-10 border border-tenant-border/60 shadow-xs space-y-8 text-sm leading-relaxed text-tenant-text/90">
          <section className="space-y-3">
            <h2 className="font-heading text-xl font-bold text-tenant-text flex items-center gap-2">
              <Lock className="w-5 h-5 text-tenant-primary" />
              1. Controlador e Princípios de Coleta
            </h2>
            <p>
              A <strong>{tenant.name}</strong> atua como controladora dos dados pessoais tratados no âmbito desta plataforma digital. Adotamos o princípio da <em>minimização de dados</em>: coletamos exclusivamente as informações estritamente necessárias para viabilizar o atendimento comercial, o fornecimento de refeições e a comunicação com clientes.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-heading text-xl font-bold text-tenant-text flex items-center gap-2">
              <Eye className="w-5 h-5 text-tenant-primary" />
              2. Dados Coletados e Finalidades Lícitas
            </h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <strong>Identificação e Contato:</strong> Nome, e-mail e telefone fornecidos voluntariamente através de formulários de contato ou pré-lançamento, destinados unicamente a esclarecer dúvidas e informar sobre a disponibilidade de pedidos.
              </li>
              <li>
                <strong>Navegação Técnica e Logs:</strong> Endereço IP pseudonimizado (hash criptográfico), data e hora de acesso, mantidos para cumprimento do Marco Civil da Internet (Lei nº 12.965/2014) e segurança da aplicação.
              </li>
              <li>
                <strong>Não Coleta de Dados Sensíveis:</strong> Não coletamos dados de origem racial, religiosa, biométrica ou de saúde.
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="font-heading text-xl font-bold text-tenant-text flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-tenant-primary" />
              3. Compartilhamento e Armazenamento Seguro
            </h2>
            <p>
              Seus dados nunca são comercializados ou compartilhados com terceiros para fins de publicidade não solicitada. O armazenamento é realizado em infraestrutura de computação em nuvem segura com criptografia em trânsito (HTTPS/TLS) e em repouso (AES-256).
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-heading text-xl font-bold text-tenant-text flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-tenant-primary" />
              4. Direitos do Titular (Art. 18 da LGPD)
            </h2>
            <p>
              Você possui o direito de confirmar a existência de tratamento, acessar seus dados, solicitar a correção de dados incompletos ou requerer a eliminação dos seus dados pessoais tratados mediante consentimento.
            </p>
            <p>
              Para exercer seus direitos de titular, utilize o canal de atendimento oficial pelo e-mail{' '}
              <a href={`mailto:${settings.contact_email || 'contato@benza.com.br'}`} className="text-tenant-primary font-semibold underline">
                {settings.contact_email || 'contato@benza.com.br'}
              </a>
              . O atendimento será respondido dentro do prazo legal de até 15 dias úteis.
            </p>
          </section>

          <section className="space-y-3 pt-4 border-t border-tenant-border/40 text-xs text-tenant-muted">
            <p>Última atualização: Outubro de 2026. Esta política poderá ser revisada periodicamente para refletir melhorias contínuas em nossas práticas de segurança.</p>
          </section>
        </div>
      </Container>
    </div>
  );
}
