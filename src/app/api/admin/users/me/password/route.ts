import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminAuthSession } from '@/lib/tenancy/admin-auth';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/observability/logger';

export const dynamic = 'force-dynamic';

const ChangeOwnPasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Informe sua senha atual.'),
  newPassword: z.string().min(8, 'A nova senha deve ter pelo menos 8 caracteres.').max(128),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getAdminAuthSession(request);
    if (!session || !session.user.email) {
      return NextResponse.json({ error: 'Acesso não autorizado.' }, { status: 401 });
    }

    const raw = await request.json();
    const parsed = ChangeOwnPasswordSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Dados inválidos.' },
        { status: 400 }
      );
    }

    // Valida a senha atual antes de permitir a troca
    const supabase = await createClient();
    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email: session.user.email,
      password: parsed.data.currentPassword,
    });

    if (signInErr) {
      return NextResponse.json({ error: 'Senha atual incorreta.' }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const { error: updErr } = await adminClient.auth.admin.updateUserById(session.user.id, {
      password: parsed.data.newPassword,
    });

    if (updErr) {
      return NextResponse.json(
        { error: updErr.message || 'Erro ao atualizar senha.' },
        { status: 400 }
      );
    }

    logger.info('Senha própria alterada no painel administrativo', {
      tenantId: session.tenant.id,
      userId: session.user.id,
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Erro ao alterar senha.' },
      { status: 500 }
    );
  }
}

