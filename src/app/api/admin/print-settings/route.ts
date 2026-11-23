import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuthSession } from '@/lib/tenancy/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  DEFAULT_PRINT_SETTINGS,
  parseStructuredBusinessHours,
} from '@/modules/commerce/store-config.engine';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const session = await getAdminAuthSession(request);
    if (!session) {
      return NextResponse.json({ error: 'Acesso não autorizado.' }, { status: 401 });
    }

    const supabase = createAdminClient();
    const [{ data: settings }, { data: branding }] = await Promise.all([
      supabase
        .from('tenant_settings')
        .select('business_hours')
        .eq('tenant_id', session.tenant.id)
        .maybeSingle(),
      supabase
        .from('tenant_branding')
        .select('logo_url')
        .eq('tenant_id', session.tenant.id)
        .maybeSingle(),
    ]);

    const parsed = parseStructuredBusinessHours(
      (settings?.business_hours as Record<string, any> | null) || null
    );

    const logoUrl =
      branding?.logo_url ||
      (session.tenant.slug === 'benza' ? '/assets/brands/benza/logo-primary.svg' : null);

    return NextResponse.json(
      {
        tenantName: session.tenant.name,
        logoUrl,
        printSettings: parsed.print_settings || DEFAULT_PRINT_SETTINGS,
      },
      { status: 200 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Erro ao carregar configurações de impressão.' },
      { status: 500 }
    );
  }
}

