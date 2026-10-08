import type { MetadataRoute } from 'next';
import { headers } from 'next/headers';
import { resolveTenantByHost } from '@/lib/tenancy/context';

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const headersList = await headers();
  const host = headersList.get('x-tenant-host') || headersList.get('host') || 'localhost:3000';
  const tenantContext = await resolveTenantByHost(host);

  const name = tenantContext?.tenant.name || 'Loja Virtual';
  const themeColor = tenantContext?.branding.color_primary || '#A84B2C';
  const bgColor = tenantContext?.branding.color_background || '#FDFBF7';

  return {
    name,
    short_name: name,
    description: `Cardápio digital e site institucional de ${name}`,
    start_url: '/',
    display: 'standalone',
    background_color: bgColor,
    theme_color: themeColor,
    icons: [
      {
        src: '/favicon.ico',
        sizes: 'any',
        type: 'image/x-icon',
      },
    ],
  };
}
