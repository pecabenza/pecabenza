import React from 'react';
import { redirect } from 'next/navigation';
import { getAdminAuthSession } from '@/lib/tenancy/admin-auth';
import { AdminLayoutShell } from '@/components/admin/AdminLayoutShell';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getAdminAuthSession();

  if (!session) {
    redirect('/admin/login?error=unauthorized');
  }

  return (
    <AdminLayoutShell
      tenantName={session.tenant.name}
      tenantSlug={session.tenant.slug}
      role={session.role}
    >
      {children}
    </AdminLayoutShell>
  );
}
