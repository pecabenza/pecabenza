import type { TenantFullContext } from '@/types/database.types';

/**
 * Resolve a origem pública canônica e confiável do tenant a partir dos domínios
 * verificados cadastrados, evitando confiar diretamente no header HTTP `host`.
 */
export function getTenantPublicOrigin(context: TenantFullContext): string {
  const verifiedPrimary = context.domains.find((d) => d.is_primary && d.is_verified);
  const anyVerified = context.domains.find((d) => d.is_verified);
  const anyDomain = context.domains[0];

  const rawHostname =
    verifiedPrimary?.hostname ||
    anyVerified?.hostname ||
    anyDomain?.hostname ||
    `${context.tenant.slug}.localhost`;

  const cleanHost = rawHostname
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '');

  const isLocal =
    cleanHost === 'localhost' ||
    cleanHost.startsWith('localhost:') ||
    cleanHost.endsWith('.localhost') ||
    cleanHost.includes('.localhost:');

  const protocol = isLocal ? 'http' : 'https';
  return `${protocol}://${cleanHost}`;
}

