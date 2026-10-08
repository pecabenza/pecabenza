import React from 'react';
import { headers } from 'next/headers';
import { resolveTenantByHost } from '@/lib/tenancy/context';
import { PrelaunchBanner } from '@/components/storefront/PrelaunchBanner';
import { StorefrontHeader } from '@/components/storefront/StorefrontHeader';
import { StorefrontFooter } from '@/components/storefront/StorefrontFooter';
import { CookieConsentBanner } from '@/components/common/CookieConsentBanner';
import { GoogleAnalytics } from '@/components/common/GoogleAnalytics';
import '@/app/globals.css';

export const dynamic = 'force-dynamic';

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
      <html lang="pt-BR">
        <body className="min-h-screen flex items-center justify-center bg-stone-50 text-stone-800 p-6">
          <div className="text-center max-w-md space-y-3">
            <h1 className="text-2xl font-bold">Estabelecimento não encontrado</h1>
            <p className="text-sm text-stone-500">
              O domínio acessado ({host}) não está associado a nenhuma loja ativa na plataforma.
            </p>
          </div>
        </body>
      </html>
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
    '--border-radius': branding.border_radius,
  } as React.CSSProperties;

  return (
    <html lang="pt-BR" style={cssVariables}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400..900;1,400..900&family=Plus+Jakarta+Sans:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
        {settings.gsc_verification_tag && (
          <meta name="google-site-verification" content={settings.gsc_verification_tag} />
        )}
        {(process.env.APP_ENV === 'staging' ||
          process.env.NEXT_PUBLIC_APP_ENV === 'staging' ||
          host.includes('staging') ||
          host.includes('vercel.app')) && (
          <meta name="robots" content="noindex, nofollow" />
        )}
      </head>
      <body className="min-h-screen flex flex-col bg-tenant-background text-tenant-text antialiased selection:bg-tenant-primary selection:text-white">
        <GoogleAnalytics measurementId={settings.ga4_measurement_id} />
        {tenant.site_mode === 'prelaunch' && (
          <PrelaunchBanner bannerText={settings.prelaunch_banner_text} />
        )}
        <StorefrontHeader tenant={tenant} branding={branding} settings={settings} />
        <main className="flex-1">{children}</main>
        <StorefrontFooter tenant={tenant} settings={settings} />
        <CookieConsentBanner />
      </body>
    </html>
  );
}
