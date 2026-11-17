import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { headers } from 'next/headers';
import { MessageCircle, ShieldCheck } from 'lucide-react';
import { resolveTenantByHost } from '@/lib/tenancy/context';
import { Container } from '@/components/ui/Container';

export const dynamic = 'force-dynamic';

function buildSupportWhatsAppHref(rawPhone?: string | null, tenantName?: string): string | null {
  if (!rawPhone) return null;
  const digits = rawPhone.replace(/\D/g, '');
  if (digits.length < 10) return null;
  const fullNumber = digits.startsWith('55') ? digits : `55${digits}`;
  const text = encodeURIComponent(
    `Olá! Preciso de ajuda com o acompanhamento do meu pedido na ${tenantName || 'loja'}.`
  );
  return `https://wa.me/${fullNumber}?text=${text}`;
}

export async function generateMetadata(): Promise<Metadata> {
  const headersList = await headers();
  const host = headersList.get('x-tenant-host') || headersList.get('host') || 'localhost:3000';
  const tenantContext = await resolveTenantByHost(host);

  return {
    title: tenantContext
      ? `Acompanhe seu pedido | ${tenantContext.tenant.name}`
      : 'Acompanhe seu pedido',
    robots: { index: false, follow: false },
  };
}

export default async function OrderTrackingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const headersList = await headers();
  const host = headersList.get('x-tenant-host') || headersList.get('host') || 'localhost:3000';
  const tenantContext = await resolveTenantByHost(host);

  if (!tenantContext) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50 text-stone-800 p-6">
        <div className="text-center max-w-md space-y-3">
          <h1 className="text-2xl font-bold">Estabelecimento não encontrado</h1>
          <p className="text-sm text-stone-500">
            O domínio acessado ({host}) não está associado a nenhuma loja ativa na plataforma.
          </p>
        </div>
      </div>
    );
  }

  const { tenant, settings, branding } = tenantContext;

  const cssVariables = {
    '--color-primary': branding.color_primary,
    '--color-secondary': branding.color_secondary,
    '--color-accent': branding.color_accent,
    '--color-background': branding.color_background,
    '--color-surface': branding.color_surface,
    '--color-text': branding.color_text,
    '--color-button': branding.color_button || branding.color_primary,
    '--color-button-hover': branding.color_button_hover || '#8E3D22',
    '--border-radius': branding.border_radius,
  } as React.CSSProperties;

  const whatsappHref = buildSupportWhatsAppHref(
    settings.contact_whatsapp || settings.contact_phone,
    tenant.name
  );

  return (
    <div
      style={cssVariables}
      className="min-h-screen flex flex-col bg-tenant-background text-tenant-text antialiased selection:bg-tenant-primary selection:text-white"
    >
      {/* Cabeçalho simplificado exclusivo de rastreamento (sem menu comercial, carrinho ou login) */}
      <header className="sticky top-0 z-30 bg-tenant-background/95 backdrop-blur-md border-b border-tenant-border/60">
        <Container size="md">
          <div className="flex items-center justify-between h-20 gap-4">
            <Link
              href="/produtos"
              className="flex items-center gap-3 group focus:outline-none"
              aria-label={`${tenant.name} — Ir para o cardápio`}
            >
              {branding.logo_url ? (
                <Image
                  src={branding.logo_url}
                  alt={tenant.name}
                  width={180}
                  height={60}
                  className="h-12 sm:h-14 w-auto object-contain"
                  priority
                />
              ) : (
                <div className="flex flex-col">
                  <span className="font-heading text-2xl sm:text-3xl font-bold tracking-tight text-tenant-primary">
                    {tenant.name}
                  </span>
                  <span className="text-[10px] uppercase tracking-widest text-tenant-muted font-semibold">
                    Cozinha de verdade.
                  </span>
                </div>
              )}
            </Link>

            {whatsappHref ? (
              <a
                href={whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-tenant-surface border border-tenant-border text-xs font-semibold text-tenant-text hover:border-tenant-primary hover:text-tenant-primary transition-colors motion-reduce:transition-none shadow-2xs"
              >
                <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                <span>Precisa de ajuda?</span>
              </a>
            ) : (
              <Link
                href="/contato"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-tenant-surface border border-tenant-border text-xs font-semibold text-tenant-text hover:border-tenant-primary hover:text-tenant-primary transition-colors motion-reduce:transition-none"
              >
                <span>Precisa de ajuda?</span>
              </Link>
            )}
          </div>
        </Container>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="py-6 border-t border-tenant-border/50 bg-tenant-background">
        <Container size="md">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-tenant-muted">
            <span className="font-medium">{tenant.name} • Acompanhamento de Pedido</span>
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>Ambiente seguro • Dados protegidos</span>
            </span>
          </div>
        </Container>
      </footer>
    </div>
  );
}

