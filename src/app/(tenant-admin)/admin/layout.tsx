import React from 'react';
import { redirect } from 'next/navigation';
import { getAdminAuthSession } from '@/lib/tenancy/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { AdminLayoutShell } from '@/components/admin/AdminLayoutShell';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getAdminAuthSession();

  if (!session) {
    redirect('/login?error=unauthorized');
  }

  let logoUrl: string | null = null;
  let sidebarColor: string | null = null;
  let buttonColor: string | null = null;
  let buttonHoverColor: string | null = null;
  try {
    const adminClient = createAdminClient();
    const { data: branding } = await adminClient
      .from('tenant_branding')
      .select('logo_url, color_admin_sidebar, color_button, color_button_hover')
      .eq('tenant_id', session.tenant.id)
      .maybeSingle();

    const b = branding as {
      logo_url?: string | null;
      color_admin_sidebar?: string | null;
      color_button?: string | null;
      color_button_hover?: string | null;
    } | null;
    logoUrl = b?.logo_url || null;
    sidebarColor = b?.color_admin_sidebar || null;
    buttonColor = b?.color_button || null;
    buttonHoverColor = b?.color_button_hover || null;
  } catch {
    // Fallback resiliente caso coluna opcional ainda não exista
  }

  if (!logoUrl && session.tenant.slug === 'benza') {
    logoUrl = '/assets/brands/benza/logo-white.svg';
  }

  const buttonThemeStyle = {
    '--color-button': buttonColor || '#A84B2C',
    '--color-button-hover': buttonHoverColor || '#8E3D22',
  } as React.CSSProperties;

  return (
    <div style={buttonThemeStyle}>
      <AdminLayoutShell
        tenantName={session.tenant.name}
        tenantSlug={session.tenant.slug}
        role={session.role}
        logoUrl={logoUrl}
        sidebarColor={sidebarColor}
      >
        {children}
      </AdminLayoutShell>
    </div>
  );
}
