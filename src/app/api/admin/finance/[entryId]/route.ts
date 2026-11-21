import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminAuthSession } from '@/lib/tenancy/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { sanitizePlainText } from '@/lib/security/sanitize';

export const dynamic = 'force-dynamic';

const UpdateEntrySchema = z.object({
  account_id: z.string().uuid().optional(),
  entry_type: z.enum(['income', 'expense']).optional(),
  category: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().min(2).max(200).optional(),
  amount_cents: z.number().int().positive().optional(),
  payment_method: z
    .enum(['pix', 'cash', 'credit_card', 'debit_card', 'pos_card', 'bank_transfer', 'other'])
    .nullable()
    .optional(),
  status: z.enum(['paid', 'pending']).optional(),
  occurred_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes: z.string().trim().max(400).nullable().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ entryId: string }> }
) {
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

    const { entryId } = await params;
    const raw = await request.json();
    const parsed = UpdateEntrySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Dados inválidos.' },
        { status: 400 }
      );
    }

    const patch: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };
    if (parsed.data.account_id !== undefined) patch.account_id = parsed.data.account_id;
    if (parsed.data.entry_type !== undefined) patch.entry_type = parsed.data.entry_type;
    if (parsed.data.category !== undefined) patch.category = sanitizePlainText(parsed.data.category);
    if (parsed.data.description !== undefined) {
      patch.description = sanitizePlainText(parsed.data.description);
    }
    if (parsed.data.amount_cents !== undefined) patch.amount_cents = parsed.data.amount_cents;
    if (parsed.data.payment_method !== undefined) patch.payment_method = parsed.data.payment_method;
    if (parsed.data.status !== undefined) patch.status = parsed.data.status;
    if (parsed.data.occurred_on !== undefined) patch.occurred_on = parsed.data.occurred_on;
    if (parsed.data.notes !== undefined) {
      patch.notes = parsed.data.notes ? sanitizePlainText(parsed.data.notes) : null;
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('finance_entries')
      .update(patch)
      .eq('tenant_id', session.tenant.id)
      .eq('id', entryId)
      .select('*')
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json(
        { error: error?.message || 'Lançamento não encontrado.' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, entry: data }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Erro ao atualizar lançamento.' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ entryId: string }> }
) {
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

    const { entryId } = await params;
    const supabase = createAdminClient();
    const { error } = await supabase
      .from('finance_entries')
      .delete()
      .eq('tenant_id', session.tenant.id)
      .eq('id', entryId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Erro ao excluir lançamento.' },
      { status: 500 }
    );
  }
}

