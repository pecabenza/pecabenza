import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminAuthSession } from '@/lib/tenancy/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { sanitizePlainText } from '@/lib/security/sanitize';
import {
  getFinanceDashboard,
  syncPaidOrdersToFinance,
  type FinanceEntryStatus,
  type FinanceEntryType,
} from '@/modules/finance/finance.service';

export const dynamic = 'force-dynamic';

const CreateEntrySchema = z.object({
  action: z.literal('create_entry').optional(),
  account_id: z.string().uuid('Conta financeira inválida.'),
  entry_type: z.enum(['income', 'expense']),
  category: z.string().trim().min(1, 'Categoria é obrigatória.').max(80),
  description: z.string().trim().min(2, 'Descrição é obrigatória.').max(200),
  amount_cents: z.number().int().positive('O valor deve ser maior que zero.'),
  payment_method: z
    .enum(['pix', 'cash', 'credit_card', 'debit_card', 'pos_card', 'bank_transfer', 'other'])
    .nullable()
    .optional(),
  status: z.enum(['paid', 'pending']).default('paid'),
  occurred_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida (YYYY-MM-DD).'),
  notes: z.string().trim().max(400).nullable().optional(),
});

const SyncOrdersSchema = z.object({
  action: z.literal('sync_orders'),
});

export async function GET(request: NextRequest) {
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

    const sp = request.nextUrl.searchParams;
    const startDate = sp.get('startDate') || undefined;
    const endDate = sp.get('endDate') || undefined;
    const accountId = sp.get('accountId') || undefined;
    const entryType = (sp.get('entryType') as FinanceEntryType | 'all' | null) || 'all';
    const status = (sp.get('status') as FinanceEntryStatus | 'all' | null) || 'all';

    const dashboard = await getFinanceDashboard(session.tenant.id, {
      startDate,
      endDate,
      accountId,
      entryType,
      status,
    });

    return NextResponse.json(dashboard, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Erro ao carregar dados financeiros.' },
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
        { error: 'Módulo financeiro restrito a administradores.' },
        { status: 403 }
      );
    }

    const raw = await request.json();

    if (raw?.action === 'sync_orders') {
      const parsedSync = SyncOrdersSchema.safeParse(raw);
      if (!parsedSync.success) {
        return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 });
      }
      const result = await syncPaidOrdersToFinance(session.tenant.id, session.user.id);
      return NextResponse.json({ success: true, ...result }, { status: 200 });
    }

    const parsed = CreateEntrySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Dados inválidos.' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();
    const { data: account } = await supabase
      .from('finance_accounts')
      .select('id')
      .eq('tenant_id', session.tenant.id)
      .eq('id', parsed.data.account_id)
      .maybeSingle();

    if (!account) {
      return NextResponse.json(
        { error: 'Conta financeira não encontrada para este estabelecimento.' },
        { status: 404 }
      );
    }

    const { data: created, error } = await supabase
      .from('finance_entries')
      .insert({
        tenant_id: session.tenant.id,
        account_id: parsed.data.account_id,
        entry_type: parsed.data.entry_type,
        category: sanitizePlainText(parsed.data.category),
        description: sanitizePlainText(parsed.data.description),
        amount_cents: parsed.data.amount_cents,
        payment_method: parsed.data.payment_method || null,
        status: parsed.data.status,
        occurred_on: parsed.data.occurred_on,
        notes: parsed.data.notes ? sanitizePlainText(parsed.data.notes) : null,
        created_by: session.user.id,
      })
      .select('*')
      .single();

    if (error || !created) {
      return NextResponse.json(
        { error: error?.message || 'Erro ao registrar lançamento financeiro.' },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, entry: created }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Erro inesperado ao salvar lançamento.' },
      { status: 500 }
    );
  }
}

