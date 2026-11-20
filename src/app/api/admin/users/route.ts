import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminAuthSession } from '@/lib/tenancy/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { sanitizePlainText } from '@/lib/security/sanitize';
import { logger } from '@/lib/observability/logger';

export const dynamic = 'force-dynamic';

const CreateTenantUserSchema = z.object({
  name: z.string().trim().min(2, 'Nome deve ter pelo menos 2 caracteres.').max(120),
  email: z.string().trim().email('E-mail inválido.').toLowerCase(),
  password: z.string().min(8, 'A senha deve ter pelo menos 8 caracteres.').max(128),
  role: z.enum(['tenant_admin', 'tenant_manager']),
});

export async function GET(request: NextRequest) {
  try {
    const session = await getAdminAuthSession(request);
    if (!session) {
      return NextResponse.json({ error: 'Acesso não autorizado.' }, { status: 401 });
    }

    const adminClient = createAdminClient();
    const { data: members, error } = await adminClient
      .from('tenant_members')
      .select('id, user_id, role, is_active, created_at')
      .eq('tenant_id', session.tenant.id)
      .order('created_at', { ascending: true });

    if (error) {
      return NextResponse.json({ error: 'Erro ao listar usuários do estabelecimento.' }, { status: 500 });
    }

    const enriched = await Promise.all(
      (members || []).map(async (m) => {
        try {
          const { data: authData } = await adminClient.auth.admin.getUserById(m.user_id);
          return {
            id: m.id,
            userId: m.user_id,
            role: m.role,
            isActive: m.is_active,
            createdAt: m.created_at,
            email: authData?.user?.email || '—',
            name:
              (authData?.user?.user_metadata?.name as string | undefined) ||
              (authData?.user?.email?.split('@')[0] ?? 'Usuário'),
          };
        } catch {
          return {
            id: m.id,
            userId: m.user_id,
            role: m.role,
            isActive: m.is_active,
            createdAt: m.created_at,
            email: '—',
            name: 'Usuário',
          };
        }
      })
    );

    return NextResponse.json(
      {
        currentUserId: session.user.id,
        currentUserEmail: session.user.email || '',
        currentUserRole: session.role,
        members: enriched,
      },
      { status: 200 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Erro ao carregar usuários.' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAdminAuthSession(request);
    if (!session) {
      return NextResponse.json({ error: 'Acesso não autorizado.' }, { status: 401 });
    }
    if (session.role !== 'tenant_admin') {
      return NextResponse.json(
        { error: 'Apenas administradores do estabelecimento podem criar usuários.' },
        { status: 403 }
      );
    }

    const raw = await request.json();
    const parsed = CreateTenantUserSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Dados inválidos para criar usuário.' },
        { status: 400 }
      );
    }

    const cleanName = sanitizePlainText(parsed.data.name);
    const email = parsed.data.email;
    const adminClient = createAdminClient();

    // Tenta criar usuário no Supabase Auth com e-mail já confirmado
    let userId: string | null = null;
    const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
      email,
      password: parsed.data.password,
      email_confirm: true,
      user_metadata: { name: cleanName },
    });

    if (created?.user?.id) {
      userId = created.user.id;
    } else if (createErr?.message?.toLowerCase().includes('already') || createErr?.status === 422) {
      // Se já existir no Auth global, localiza pelo e-mail para vincular ao tenant
      const { data: listData } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const existing = listData?.users?.find((u) => u.email?.toLowerCase() === email);
      if (!existing) {
        return NextResponse.json(
          { error: 'Já existe um usuário com este e-mail, mas não foi possível localizá-lo.' },
          { status: 409 }
        );
      }
      userId = existing.id;
    } else {
      return NextResponse.json(
        { error: createErr?.message || 'Erro ao criar usuário no sistema de autenticação.' },
        { status: 400 }
      );
    }

    // Verifica se já pertence ao tenant
    const { data: existingMember } = await adminClient
      .from('tenant_members')
      .select('id')
      .eq('tenant_id', session.tenant.id)
      .eq('user_id', userId)
      .maybeSingle();

    if (existingMember) {
      return NextResponse.json(
        { error: 'Este usuário já faz parte deste estabelecimento.' },
        { status: 409 }
      );
    }

    const { data: inserted, error: insErr } = await adminClient
      .from('tenant_members')
      .insert({
        tenant_id: session.tenant.id,
        user_id: userId,
        role: parsed.data.role,
        is_active: true,
      })
      .select('id, user_id, role, is_active, created_at')
      .single();

    if (insErr || !inserted) {
      return NextResponse.json(
        { error: insErr?.message || 'Erro ao vincular usuário ao estabelecimento.' },
        { status: 400 }
      );
    }

    logger.info('Novo usuário administrativo criado/vinculado', {
      tenantId: session.tenant.id,
      createdBy: session.user.id,
      targetUserId: userId,
      role: parsed.data.role,
    });

    return NextResponse.json(
      {
        member: {
          id: inserted.id,
          userId: inserted.user_id,
          role: inserted.role,
          isActive: inserted.is_active,
          createdAt: inserted.created_at,
          email,
          name: cleanName,
        },
      },
      { status: 201 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Erro inesperado ao criar usuário.' },
      { status: 500 }
    );
  }
}

