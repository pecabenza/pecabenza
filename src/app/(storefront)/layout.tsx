import React from 'react';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { resolveTenantByHost } from '@/lib/tenancy/context';
import { PrelaunchBanner } from '@/components/storefront/PrelaunchBanner';
import { StorefrontHeader } from '@/components/storefront/StorefrontHeader';
import { StorefrontFooter } from '@/components/storefront/StorefrontFooter';
import { CookieConsentBanner } from '@/components/common/CookieConsentBanner';
import { GoogleAnalytics } from '@/components/common/GoogleAnalytics';
import { CartProvider } from '@/modules/cart/CartContext';
import { CartDrawer } from '@/components/cart/CartDrawer';
import { FloatingCartBar } from '@/components/cart/FloatingCartBar';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const headersList = await headers();
  const host = headersList.get('x-tenant-host') || headersList.get('host') || 'localhost:3000';
  const tenantContext = await resolveTenantByHost(host);

  const isStaging =
    process.env.APP_ENV === 'staging' ||
    process.env.NEXT_PUBLIC_APP_ENV === 'staging' ||
    host.includes('staging') ||
    host.includes('vercel.app');

  return {
    ...(tenantContext?.settings.gsc_verification_tag
      ? { verification: { google: tenantContext.settings.gsc_verification_tag } }
      : {}),
    ...(isStaging ? { robots: { index: false, follow: false } } : {}),
  };
}

export default async function StorefrontLayout({
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

  // Injeção de CSS Variables no SSR para evitar Flash of Unstyled Content (FOUC)
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

  return (
    <div
      style={cssVariables}
      className="min-h-screen flex flex-col bg-tenant-background text-tenant-text antialiased selection:bg-tenant-primary selection:text-white"
    >
      <GoogleAnalytics measurementId={settings.ga4_measurement_id} />
      <CartProvider tenantId={tenant.id} tenantSlug={tenant.slug}>
        {tenant.site_mode === 'prelaunch' && (
          <PrelaunchBanner bannerText={settings.prelaunch_banner_text} />
        )}
        <StorefrontHeader tenant={tenant} branding={branding} settings={settings} />
        <main className="flex-1">{children}</main>
        <StorefrontFooter tenant={tenant} settings={settings} />
        <CartDrawer />
        <FloatingCartBar />
        <CookieConsentBanner />
      </CartProvider>
    </div>
  );
}
