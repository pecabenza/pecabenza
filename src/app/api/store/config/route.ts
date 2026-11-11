import { NextRequest, NextResponse } from 'next/server';
import { resolveTenantByHost } from '@/lib/tenancy/context';
import { getPublicStorefrontConfig } from '@/modules/commerce/store-config.service';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const host =
      request.headers.get('x-tenant-host') ||
      request.headers.get('host') ||
      'localhost:3000';

    const tenantContext = await resolveTenantByHost(host);
    if (!tenantContext) {
      return NextResponse.json({ error: 'Estabelecimento não encontrado.' }, { status: 404 });
    }

    const config = await getPublicStorefrontConfig(
      tenantContext.tenant.id,
      tenantContext.tenant.site_mode
    );

    return NextResponse.json(config, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Erro ao carregar configurações da loja.' },
      { status: 500 }
    );
  }
}

