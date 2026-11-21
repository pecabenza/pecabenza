import React from 'react';
import { redirect } from 'next/navigation';
import { getAdminAuthSession } from '@/lib/tenancy/admin-auth';
import { FinanceDashboardClient } from '@/components/admin/finance/FinanceDashboardClient';

export const dynamic = 'force-dynamic';

export default async function AdminFinancePage() {
  const session = await getAdminAuthSession();

  if (!session) {
    redirect('/login?error=unauthorized');
  }

  if (session.role !== 'tenant_admin') {
    redirect('/admin');
  }

  return <FinanceDashboardClient />;
}

