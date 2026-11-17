import React from 'react';
import { headers } from 'next/headers';
import { resolveTenantByHost } from '@/lib/tenancy/context';
import { AdminLoginForm } from '@/components/admin/AdminLoginForm';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  const headersList = await headers();
  const host = headersList.get('x-tenant-host') || headersList.get('host') || 'localhost:3000';
  const tenantContext = await resolveTenantByHost(host);

  const tenantName = tenantContext?.tenant.name || 'BENZA';
  const rawLogoUrl = tenantContext?.branding.logo_url || null;
  const logoUrl =
    rawLogoUrl ||
    (tenantContext?.tenant.slug === 'benza' || !tenantContext
      ? '/assets/brands/benza/logo-primary.svg'
      : null);

  return <AdminLoginForm tenantName={tenantName} logoUrl={logoUrl} />;
}

