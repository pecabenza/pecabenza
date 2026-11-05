import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolveTenantByHost } from '@/lib/tenancy/context';
import { logger } from '@/lib/observability/logger';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const host =
      request.headers.get('x-tenant-host') ||
      request.headers.get('host') ||
      'localhost:3000';

    const tenantContext = await resolveTenantByHost(host);
    if (!tenantContext) {
      return NextResponse.json(
        { error: 'Estabelecimento não identificado.' },
        { status: 404 }
      );
    }

    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Não autenticado.' },
        { status: 401 }
      );
    }

    // Verificar se o usuário possui vínculo ativo com este tenant
    const adminClient = createAdminClient();
    const { data: membership, error: memError } = await adminClient
      .from('tenant_members')
      .select('role')
      .eq('tenant_id', tenantContext.tenant.id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (memError || !membership) {
      logger.warn('Tentativa de acesso de usuário autenticado sem vínculo com o tenant', {
        userId: user.id,
        tenantId: tenantContext.tenant.id,
      });

      // Usuário não pertence a este tenant
      return NextResponse.json(
        {
          error: 'Acesso negado: seu usuário não possui permissão de gestão neste estabelecimento.',
          isMember: false,
        },
        { status: 403 }
      );
    }

    if (membership.role !== 'tenant_admin' && membership.role !== 'tenant_manager') {
      return NextResponse.json(
        {
          error: 'Acesso negado: perfil de acesso insuficiente para a área administrativa.',
          isMember: true,
          role: membership.role,
        },
        { status: 403 }
      );
    }

    return NextResponse.json({
      success: true,
      tenant: {
        id: tenantContext.tenant.id,
        name: tenantContext.tenant.name,
        slug: tenantContext.tenant.slug,
      },
      role: membership.role,
      user: {
        id: user.id,
        email: user.email,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Erro ao verificar sessão administrativa.' },
      { status: 500 }
    );
  }
}

