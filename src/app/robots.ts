import type { MetadataRoute } from 'next';
import { headers } from 'next/headers';

export default async function robots(): Promise<MetadataRoute.Robots> {
  const headersList = await headers();
  const host = headersList.get('x-tenant-host') || headersList.get('host') || 'localhost:3000';

  // Identificação do ambiente de staging / homologação
  const isStaging =
    process.env.APP_ENV === 'staging' ||
    process.env.NEXT_PUBLIC_APP_ENV === 'staging' ||
    host.includes('staging') ||
    host.includes('vercel.app') ||
    host.includes('supabase.co');

  // No staging, bloqueia 100% dos indexadores de busca (Google, Bing, etc.)
  if (isStaging) {
    return {
      rules: [
        {
          userAgent: '*',
          disallow: '/',
        },
      ],
    };
  }

  // Em produção definitiva, permite páginas públicas e protege rotas administrativas/internas
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin/', '/api/', '/login'],
      },
    ],
    sitemap: `https://${host}/sitemap.xml`,
  };
}
