import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolveTenantByHost } from './context';
import type { Tenant, TenantRole } from '@/types/database.types';

export interface AdminAuthSession {
  tenant: Tenant;
  user: {
    id: string;
    email?: string;
  };
  role: TenantRole;
}

/**
 * Autentica e autoriza o usuário no contexto administrativo do tenant associado ao host da requisição.
 * 
 * Regras:
 * 1. O host é resolvido de forma autoritativa pelo servidor.
 * 2. A sessão deve ser válida no Supabase Auth via cookies SSR.
 * 3. O usuário deve obrigatoriamente possuir vínculo ativo em `tenant_members`
 *    com papel 'tenant_admin' ou 'tenant_manager' para o tenant resolvido.
 */
export async function getAdminAuthSession(req?: Request): Promise<AdminAuthSession | null> {
  let host = 'localhost:3000';
  if (req) {
    host = req.headers.get('x-tenant-host') || req.headers.get('host') || 'localhost:3000';
  } else {
    try {
      const headersList = await headers();
      host = headersList.get('x-tenant-host') || headersList.get('host') || 'localhost:3000';
    } catch {
      host = 'localhost:3000';
    }
  }

  const tenantContext = await resolveTenantByHost(host);
  if (!tenantContext) {
    return null;
  }

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    // Suporte a ambiente de desenvolvimento loopback com credenciais locais simuladas
    const isDev = process.env.NODE_ENV !== 'production' && process.env.APP_ENV !== 'staging';
    const isLoopback = host.includes('localhost') || host.includes('127.0.0.1');

    if (isDev && isLoopback && process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('placeholder')) {
      return {
        tenant: tenantContext.tenant,
        user: { id: '00000000-0000-0000-0000-000000000099', email: 'admin@dev.local' },
        role: 'tenant_admin',
      };
    }
    return null;
  }

  // Verificar associação na tabela tenant_members com privilégio de admin ativo
  const adminClient = createAdminClient();
  const { data: member, error: memberError } = await adminClient
    .from('tenant_members')
    .select('role, is_active')
    .eq('tenant_id', tenantContext.tenant.id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (memberError || !member || member.is_active === false) {
    return null;
  }

  if (member.role !== 'tenant_admin' && member.role !== 'tenant_manager') {
    return null;
  }

  return {
    tenant: tenantContext.tenant,
    user: {
      id: user.id,
      email: user.email,
    },
    role: member.role as TenantRole,
  };
}

