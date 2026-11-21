import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminAuthSession } from '@/lib/tenancy/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { sanitizePlainText } from '@/lib/security/sanitize';

export const dynamic = 'force-dynamic';

const CreateAccountSchema = z.object({
  name: z.string().trim().min(2, 'Nome da conta é obrigatório.').max(80),
  account_type: z.enum(['cash', 'checking', 'digital', 'other']),
  initial_balance_cents: z.number().int().default(0),
});

const UpdateAccountSchema = z.object({
  id: z.string().uuid('ID da conta inválido.'),
  name: z.string().trim().min(2).max(80).optional(),
  account_type: z.enum(['cash', 'checking', 'digital', 'other']).optional(),
  initial_balance_cents: z.number().int().optional(),
  is_active: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getAdminAuthSession(request);
    if (!session) {
      return NextResponse.json({ error: 'Acesso não autorizado.' }, { status: 401 });
    }
    if (session.role !== 'tenant_admin') {
      return NextResponse.json(
        { error: 'Módulo financeiro restrito a administradores.' },
        { status: 403 }
      );
    }

    const raw = await request.json();
    const parsed = CreateAccountSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Dados inválidos.' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('finance_accounts')
      .insert({
        tenant_id: session.tenant.id,
        name: sanitizePlainText(parsed.data.name),
        account_type: parsed.data.account_type,
        initial_balance_cents: parsed.data.initial_balance_cents,
        is_default_cash: false,
        is_default_bank: false,
        is_active: true,
      })
      .select('*')
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: error?.message || 'Erro ao criar conta financeira.' },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, account: data }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Erro ao criar conta financeira.' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getAdminAuthSession(request);
    if (!session) {
      return NextResponse.json({ error: 'Acesso não autorizado.' }, { status: 401 });
    }
    if (session.role !== 'tenant_admin') {
      return NextResponse.json(
        { error: 'Módulo financeiro restrito a administradores.' },
        { status: 403 }
      );
    }

    const raw = await request.json();
    const parsed = UpdateAccountSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Dados inválidos.' },
        { status: 400 }
      );
    }

    const patch: Record<string, any> = { updated_at: new Date().toISOString() };
    if (parsed.data.name !== undefined) patch.name = sanitizePlainText(parsed.data.name);
    if (parsed.data.account_type !== undefined) patch.account_type = parsed.data.account_type;
    if (parsed.data.initial_balance_cents !== undefined) {
      patch.initial_balance_cents = parsed.data.initial_balance_cents;
    }
    if (parsed.data.is_active !== undefined) patch.is_active = parsed.data.is_active;

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('finance_accounts')
      .update(patch)
      .eq('tenant_id', session.tenant.id)
      .eq('id', parsed.data.id)
      .select('*')
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json(
        { error: error?.message || 'Conta não encontrada.' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, account: data }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Erro ao atualizar conta financeira.' },
      { status: 500 }
    );
  }
}

