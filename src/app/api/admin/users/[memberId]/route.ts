import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminAuthSession } from '@/lib/tenancy/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/observability/logger';

export const dynamic = 'force-dynamic';

const UpdateMemberSchema = z.object({
  role: z.enum(['tenant_admin', 'tenant_manager']).optional(),
  isActive: z.boolean().optional(),
  newPassword: z.string().min(8, 'Nova senha deve ter pelo menos 8 caracteres.').max(128).optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ memberId: string }> }
) {
  try {
    const session = await getAdminAuthSession(request);
    if (!session) {
      return NextResponse.json({ error: 'Acesso não autorizado.' }, { status: 401 });
    }
    if (session.role !== 'tenant_admin') {
      return NextResponse.json(
        { error: 'Apenas administradores podem alterar permissões ou usuários.' },
        { status: 403 }
      );
    }

    const { memberId } = await params;
    const raw = await request.json();
    const parsed = UpdateMemberSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Dados inválidos.' },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();
    const { data: target, error: findErr } = await adminClient
      .from('tenant_members')
      .select('id, user_id, role, is_active')
      .eq('tenant_id', session.tenant.id)
      .eq('id', memberId)
      .maybeSingle();

    if (findErr || !target) {
      return NextResponse.json({ error: 'Usuário não localizado neste estabelecimento.' }, { status: 404 });
    }

    const nextRole = parsed.data.role ?? target.role;
    const nextActive = parsed.data.isActive ?? target.is_active;

    // Impedir lock-out: não permitir desativar ou rebaixar o último administrador ativo
    if (target.role === 'tenant_admin' && target.is_active && (nextRole !== 'tenant_admin' || !nextActive)) {
      const { count } = await adminClient
        .from('tenant_members')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', session.tenant.id)
        .eq('role', 'tenant_admin')
        .eq('is_active', true);

      if ((count || 0) <= 1) {
        return NextResponse.json(
          { error: 'Não é possível remover ou desativar o único administrador ativo do estabelecimento.' },
          { status: 400 }
        );
      }
    }

    if (parsed.data.role !== undefined || parsed.data.isActive !== undefined) {
      const { error: updErr } = await adminClient
        .from('tenant_members')
        .update({
          role: nextRole,
          is_active: nextActive,
        })
        .eq('tenant_id', session.tenant.id)
        .eq('id', memberId);

      if (updErr) {
        return NextResponse.json({ error: updErr.message }, { status: 400 });
      }
    }

    if (parsed.data.newPassword) {
      const { error: pwdErr } = await adminClient.auth.admin.updateUserById(target.user_id, {
        password: parsed.data.newPassword,
      });
      if (pwdErr) {
        return NextResponse.json(
          { error: `Permissões atualizadas, mas falha ao redefinir senha: ${pwdErr.message}` },
          { status: 400 }
        );
      }
    }

    logger.info('Usuário administrativo atualizado', {
      tenantId: session.tenant.id,
      updatedBy: session.user.id,
      memberId,
      nextRole,
      nextActive,
      passwordReset: Boolean(parsed.data.newPassword),
    });

    return NextResponse.json(
      {
        id: memberId,
        role: nextRole,
        isActive: nextActive,
      },
      { status: 200 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Erro ao atualizar usuário.' },
      { status: 500 }
    );
  }
}

