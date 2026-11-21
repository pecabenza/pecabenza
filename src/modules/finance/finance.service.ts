import { createAdminClient } from '@/lib/supabase/admin';

export type FinanceAccountType = 'cash' | 'checking' | 'digital' | 'other';
export type FinanceEntryType = 'income' | 'expense';
export type FinanceEntryStatus = 'paid' | 'pending';

export interface FinanceAccountRecord {
  id: string;
  tenant_id: string;
  name: string;
  account_type: FinanceAccountType;
  initial_balance_cents: number;
  is_default_cash: boolean;
  is_default_bank: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  current_balance_cents?: number;
}

export interface FinanceEntryRecord {
  id: string;
  tenant_id: string;
  account_id: string;
  account_name?: string;
  account_type?: FinanceAccountType;
  entry_type: FinanceEntryType;
  category: string;
  description: string;
  amount_cents: number;
  payment_method: string | null;
  status: FinanceEntryStatus;
  occurred_on: string;
  order_id: string | null;
  order_number?: string | null;
  created_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface FinanceDashboardFilters {
  startDate?: string;
  endDate?: string;
  accountId?: string;
  entryType?: FinanceEntryType | 'all';
  status?: FinanceEntryStatus | 'all';
}

/**
 * Garante que o tenant possua ao menos as contas padrão (Caixa e Conta Corrente).
 */
export async function ensureDefaultFinanceAccounts(tenantId: string): Promise<FinanceAccountRecord[]> {
  const supabase = createAdminClient();
  const { data: existing, error } = await supabase
    .from('finance_accounts')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`Erro ao carregar contas financeiras: ${error.message}`);
  }

  if (existing && existing.length > 0) {
    return existing as FinanceAccountRecord[];
  }

  const { data: created, error: insertError } = await supabase
    .from('finance_accounts')
    .insert([
      {
        tenant_id: tenantId,
        name: 'Caixa',
        account_type: 'cash',
        initial_balance_cents: 0,
        is_default_cash: true,
        is_default_bank: false,
        is_active: true,
      },
      {
        tenant_id: tenantId,
        name: 'Conta Corrente',
        account_type: 'checking',
        initial_balance_cents: 0,
        is_default_cash: false,
        is_default_bank: true,
        is_active: true,
      },
    ])
    .select('*');

  if (insertError) {
    throw new Error(`Erro ao inicializar contas padrão: ${insertError.message}`);
  }

  return (created || []) as FinanceAccountRecord[];
}

function pickDefaultAccountForMethod(
  accounts: FinanceAccountRecord[],
  paymentMethod?: string | null
): FinanceAccountRecord | undefined {
  const active = accounts.filter((a) => a.is_active);
  const pool = active.length > 0 ? active : accounts;

  if (paymentMethod === 'cash') {
    return (
      pool.find((a) => a.is_default_cash) ||
      pool.find((a) => a.account_type === 'cash') ||
      pool[0]
    );
  }

  return (
    pool.find((a) => a.is_default_bank) ||
    pool.find((a) => a.account_type === 'checking' || a.account_type === 'digital') ||
    pool[0]
  );
}

/**
 * Registra entrada automática no financeiro para um pedido pago (idempotente por order_id).
 */
export async function recordOrderIncomeEntry(
  tenantId: string,
  orderId: string,
  paymentMethod?: string | null,
  actorUserId?: string | null,
  preferredAccountId?: string | null
): Promise<{ created: boolean; entryId?: string }> {
  const supabase = createAdminClient();

  const { data: existingEntry } = await supabase
    .from('finance_entries')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('order_id', orderId)
    .eq('entry_type', 'income')
    .maybeSingle();

  if (existingEntry) {
    return { created: false, entryId: existingEntry.id };
  }

  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .select('id, order_number, customer_name, total_cents, payment_method, paid_at, created_at')
    .eq('tenant_id', tenantId)
    .eq('id', orderId)
    .maybeSingle();

  if (orderErr || !order || !order.total_cents || order.total_cents <= 0) {
    return { created: false };
  }

  const accounts = await ensureDefaultFinanceAccounts(tenantId);
  const resolvedMethod = paymentMethod || order.payment_method || 'pix';
  const targetAccount =
    (preferredAccountId ? accounts.find((a) => a.id === preferredAccountId) : undefined) ||
    pickDefaultAccountForMethod(accounts, resolvedMethod);

  if (!targetAccount) {
    return { created: false };
  }

  const occurredOn = (order.paid_at || order.created_at || new Date().toISOString()).slice(0, 10);

  const { data: inserted, error: insErr } = await supabase
    .from('finance_entries')
    .insert({
      tenant_id: tenantId,
      account_id: targetAccount.id,
      entry_type: 'income',
      category: 'Venda',
      description: `Pedido ${order.order_number} — ${order.customer_name || 'Cliente'}`,
      amount_cents: order.total_cents,
      payment_method: resolvedMethod,
      status: 'paid',
      occurred_on: occurredOn,
      order_id: order.id,
      created_by: actorUserId || null,
    })
    .select('id')
    .single();

  if (insErr) {
    // Em caso de corrida na unique index, ignora duplicidade
    if (insErr.code === '23505') {
      return { created: false };
    }
    throw new Error(`Falha ao lançar entrada do pedido no financeiro: ${insErr.message}`);
  }

  return { created: true, entryId: inserted.id };
}

/**
 * Sincroniza pedidos pagos que ainda não possuem lançamento no financeiro.
 */
export async function syncPaidOrdersToFinance(
  tenantId: string,
  actorUserId?: string | null
): Promise<{ syncedCount: number }> {
  const supabase = createAdminClient();
  const accounts = await ensureDefaultFinanceAccounts(tenantId);

  const [{ data: paidOrders, error: ordErr }, { data: existingEntries, error: entErr }] =
    await Promise.all([
      supabase
        .from('orders')
        .select('id, order_number, customer_name, total_cents, payment_method, paid_at, created_at')
        .eq('tenant_id', tenantId)
        .eq('payment_status', 'paid')
        .neq('status', 'cancelled')
        .gt('total_cents', 0)
        .order('created_at', { ascending: false })
        .limit(500),
      supabase
        .from('finance_entries')
        .select('order_id')
        .eq('tenant_id', tenantId)
        .eq('entry_type', 'income')
        .not('order_id', 'is', null),
    ]);

  if (ordErr) {
    throw new Error(`Erro ao consultar pedidos pagos: ${ordErr.message}`);
  }
  if (entErr) {
    throw new Error(`Erro ao consultar lançamentos existentes: ${entErr.message}`);
  }

  const alreadySyncedIds = new Set((existingEntries || []).map((e) => e.order_id));
  const pendingToSync = (paidOrders || []).filter((o) => !alreadySyncedIds.has(o.id));

  if (pendingToSync.length === 0) {
    return { syncedCount: 0 };
  }

  const rowsToInsert = pendingToSync
    .map((order) => {
      const account = pickDefaultAccountForMethod(accounts, order.payment_method);
      if (!account) return null;
      return {
        tenant_id: tenantId,
        account_id: account.id,
        entry_type: 'income' as const,
        category: 'Venda',
        description: `Pedido ${order.order_number} — ${order.customer_name || 'Cliente'}`,
        amount_cents: order.total_cents,
        payment_method: order.payment_method || 'pix',
        status: 'paid' as const,
        occurred_on: (order.paid_at || order.created_at || new Date().toISOString()).slice(0, 10),
        order_id: order.id,
        created_by: actorUserId || null,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  if (rowsToInsert.length === 0) {
    return { syncedCount: 0 };
  }

  const { error: bulkErr } = await supabase
    .from('finance_entries')
    .upsert(rowsToInsert, { onConflict: 'tenant_id,order_id', ignoreDuplicates: true });

  if (bulkErr) {
    // Fallback inserindo individualmente se índice parcial não bater com onConflict
    let count = 0;
    for (const row of rowsToInsert) {
      const { error: singleErr } = await supabase.from('finance_entries').insert(row);
      if (!singleErr) count += 1;
    }
    return { syncedCount: count };
  }

  return { syncedCount: rowsToInsert.length };
}

/**
 * Carrega contas com saldos atualizados, lançamentos filtrados, resumo e pedidos aguardando confirmação/conciliação.
 */
export async function getFinanceDashboard(
  tenantId: string,
  filters: FinanceDashboardFilters = {}
) {
  const supabase = createAdminClient();
  const accounts = await ensureDefaultFinanceAccounts(tenantId);

  // Busca todos os lançamentos pagos para calcular saldo real acumulado de cada conta
  const { data: allPaidRows, error: balErr } = await supabase
    .from('finance_entries')
    .select('account_id, entry_type, amount_cents')
    .eq('tenant_id', tenantId)
    .eq('status', 'paid');

  if (balErr) {
    throw new Error(`Erro ao calcular saldos: ${balErr.message}`);
  }

  const deltaByAccount = new Map<string, number>();
  for (const row of allPaidRows || []) {
    const prev = deltaByAccount.get(row.account_id) || 0;
    const signed = row.entry_type === 'income' ? row.amount_cents : -row.amount_cents;
    deltaByAccount.set(row.account_id, prev + signed);
  }

  const accountsWithBalance: FinanceAccountRecord[] = accounts.map((acc) => ({
    ...acc,
    current_balance_cents: acc.initial_balance_cents + (deltaByAccount.get(acc.id) || 0),
  }));

  // Consulta lançamentos do período/filtros
  let entriesQuery = supabase
    .from('finance_entries')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('occurred_on', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(300);

  if (filters.startDate) {
    entriesQuery = entriesQuery.gte('occurred_on', filters.startDate);
  }
  if (filters.endDate) {
    entriesQuery = entriesQuery.lte('occurred_on', filters.endDate);
  }
  if (filters.accountId && filters.accountId !== 'all') {
    entriesQuery = entriesQuery.eq('account_id', filters.accountId);
  }
  if (filters.entryType && filters.entryType !== 'all') {
    entriesQuery = entriesQuery.eq('entry_type', filters.entryType);
  }
  if (filters.status && filters.status !== 'all') {
    entriesQuery = entriesQuery.eq('status', filters.status);
  }

  const [
    { data: entriesData, error: entriesErr },
    { data: pendingOrdersData },
    { data: paidOrdersData },
    { data: syncedOrderIdsData },
  ] = await Promise.all([
    entriesQuery,
    supabase
      .from('orders')
      .select('id, order_number, customer_name, total_cents, payment_method, payment_status, status, created_at')
      .eq('tenant_id', tenantId)
      .eq('payment_status', 'pending')
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('orders')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('payment_status', 'paid')
      .neq('status', 'cancelled')
      .gt('total_cents', 0)
      .limit(500),
    supabase
      .from('finance_entries')
      .select('order_id')
      .eq('tenant_id', tenantId)
      .eq('entry_type', 'income')
      .not('order_id', 'is', null),
  ]);

  if (entriesErr) {
    throw new Error(`Erro ao carregar lançamentos financeiros: ${entriesErr.message}`);
  }

  const accountMap = new Map(accountsWithBalance.map((a) => [a.id, a]));
  const entries: FinanceEntryRecord[] = (entriesData || []).map((row) => {
    const acc = accountMap.get(row.account_id);
    return {
      ...(row as FinanceEntryRecord),
      account_name: acc?.name || 'Conta',
      account_type: acc?.account_type || 'other',
    };
  });

  let totalIncomePaidCents = 0;
  let totalExpensePaidCents = 0;
  let pendingExpenseCents = 0;
  let pendingIncomeCents = 0;

  for (const e of entries) {
    if (e.entry_type === 'income') {
      if (e.status === 'paid') totalIncomePaidCents += e.amount_cents;
      else pendingIncomeCents += e.amount_cents;
    } else {
      if (e.status === 'paid') totalExpensePaidCents += e.amount_cents;
      else pendingExpenseCents += e.amount_cents;
    }
  }

  const totalCashBalanceCents = accountsWithBalance
    .filter((a) => a.is_active && a.account_type === 'cash')
    .reduce((sum, a) => sum + (a.current_balance_cents || 0), 0);

  const totalBankBalanceCents = accountsWithBalance
    .filter((a) => a.is_active && a.account_type !== 'cash')
    .reduce((sum, a) => sum + (a.current_balance_cents || 0), 0);

  const syncedSet = new Set((syncedOrderIdsData || []).map((x) => x.order_id));
  const unsyncedPaidOrdersCount = (paidOrdersData || []).filter((o) => !syncedSet.has(o.id)).length;

  return {
    accounts: accountsWithBalance,
    entries,
    pendingPaymentOrders: pendingOrdersData || [],
    unsyncedPaidOrdersCount,
    summary: {
      totalIncomePaidCents,
      totalExpensePaidCents,
      pendingExpenseCents,
      pendingIncomeCents,
      netPeriodCents: totalIncomePaidCents - totalExpensePaidCents,
      totalCashBalanceCents,
      totalBankBalanceCents,
      totalBalanceCents: totalCashBalanceCents + totalBankBalanceCents,
    },
  };
}

