'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  Wallet,
  Landmark,
  Banknote,
  ArrowDownCircle,
  ArrowUpCircle,
  Plus,
  RefreshCw,
  CheckCircle2,
  Clock,
  Trash2,
  AlertTriangle,
  Sparkles,
} from 'lucide-react';
import { formatBrl } from '@/modules/cart/cart.utils';
import { PAYMENT_METHOD_LABELS } from '@/modules/orders/order-status.machine';

type AccountType = 'cash' | 'checking' | 'digital' | 'other';
type EntryType = 'income' | 'expense';
type EntryStatus = 'paid' | 'pending';

interface FinanceAccount {
  id: string;
  name: string;
  account_type: AccountType;
  initial_balance_cents: number;
  current_balance_cents: number;
  is_active: boolean;
}

interface FinanceEntry {
  id: string;
  account_id: string;
  account_name: string;
  entry_type: EntryType;
  category: string;
  description: string;
  amount_cents: number;
  payment_method: string | null;
  status: EntryStatus;
  occurred_on: string;
  order_id: string | null;
  notes: string | null;
}

interface PendingOrder {
  id: string;
  order_number: string;
  customer_name: string;
  total_cents: number;
  payment_method: string | null;
  created_at: string;
}

interface DashboardData {
  accounts: FinanceAccount[];
  entries: FinanceEntry[];
  pendingPaymentOrders: PendingOrder[];
  unsyncedPaidOrdersCount: number;
  summary: {
    totalIncomePaidCents: number;
    totalExpensePaidCents: number;
    pendingExpenseCents: number;
    pendingIncomeCents: number;
    netPeriodCents: number;
    totalCashBalanceCents: number;
    totalBankBalanceCents: number;
    totalBalanceCents: number;
  };
}

const EXPENSE_CATEGORIES = [
  'Insumos & Ingredientes',
  'Embalagens',
  'Entregador / Frete',
  'Energia / Água / Gás',
  'Aluguel',
  'Impostos & Taxas',
  'Equipe / Pró-labore',
  'Marketing',
  'Manutenção',
  'Outros',
];

const INCOME_CATEGORIES = ['Venda', 'Aporte / Capital', 'Reembolso', 'Outras Receitas'];

function parseReaisToCents(raw: string): number {
  const cleaned = raw.replace(/[^\d.,]/g, '').replace(',', '.');
  const val = Number(cleaned);
  if (!Number.isFinite(val) || val <= 0) return 0;
  return Math.round(val * 100);
}

function getTodayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getMonthStartIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
}

export function FinanceDashboardClient() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Filtros
  const [startDate, setStartDate] = useState(getMonthStartIso);
  const [endDate, setEndDate] = useState(getTodayIso);
  const [accountFilter, setAccountFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState<'all' | EntryType>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | EntryStatus>('all');

  // Formulário de lançamento (entrada/despesa)
  const [showEntryForm, setShowEntryForm] = useState(false);
  const [entryType, setEntryType] = useState<EntryType>('expense');
  const [entryAccountId, setEntryAccountId] = useState('');
  const [entryCategory, setEntryCategory] = useState(EXPENSE_CATEGORIES[0]);
  const [entryDescription, setEntryDescription] = useState('');
  const [entryAmount, setEntryAmount] = useState('');
  const [entryMethod, setEntryMethod] = useState('pix');
  const [entryStatus, setEntryStatus] = useState<EntryStatus>('paid');
  const [entryDate, setEntryDate] = useState(getTodayIso);
  const [savingEntry, setSavingEntry] = useState(false);

  // Formulário de nova conta
  const [showAccountForm, setShowAccountForm] = useState(false);
  const [newAccountName, setNewAccountName] = useState('');
  const [newAccountType, setNewAccountType] = useState<AccountType>('checking');
  const [newAccountInitial, setNewAccountInitial] = useState('0,00');
  const [savingAccount, setSavingAccount] = useState(false);

  // Confirmação rápida de pedido pendente
  const [confirmingOrderId, setConfirmingOrderId] = useState<string | null>(null);
  const [orderTargetAccounts, setOrderTargetAccounts] = useState<Record<string, string>>({});
  const [syncingOrders, setSyncingOrders] = useState(false);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (startDate) qs.set('startDate', startDate);
      if (endDate) qs.set('endDate', endDate);
      if (accountFilter !== 'all') qs.set('accountId', accountFilter);
      if (typeFilter !== 'all') qs.set('entryType', typeFilter);
      if (statusFilter !== 'all') qs.set('status', statusFilter);

      const res = await fetch(`/api/admin/finance?${qs.toString()}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error || 'Erro ao carregar módulo financeiro.');
      }
      setData(json);
      if (!entryAccountId && Array.isArray(json.accounts) && json.accounts.length > 0) {
        setEntryAccountId(json.accounts[0].id);
      }
    } catch (err: any) {
      setError(err?.message || 'Erro ao carregar dados financeiros.');
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, accountFilter, typeFilter, statusFilter, entryAccountId]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const handleOpenEntryForm = (type: EntryType) => {
    setEntryType(type);
    setEntryCategory(type === 'expense' ? EXPENSE_CATEGORIES[0] : INCOME_CATEGORIES[0]);
    setShowEntryForm(true);
    setError(null);
    setFeedback(null);
  };

  const handleCreateEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFeedback(null);

    const amountCents = parseReaisToCents(entryAmount);
    if (amountCents <= 0) {
      setError('Informe um valor válido maior que zero.');
      return;
    }

    setSavingEntry(true);
    try {
      const res = await fetch('/api/admin/finance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_entry',
          account_id: entryAccountId,
          entry_type: entryType,
          category: entryCategory,
          description: entryDescription,
          amount_cents: amountCents,
          payment_method: entryMethod,
          status: entryStatus,
          occurred_on: entryDate,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error || 'Erro ao registrar lançamento.');
        return;
      }
      setEntryDescription('');
      setEntryAmount('');
      setShowEntryForm(false);
      setFeedback(
        entryType === 'expense' ? 'Despesa lançada com sucesso.' : 'Entrada lançada com sucesso.'
      );
      await loadDashboard();
    } catch {
      setError('Erro de conexão ao salvar lançamento.');
    } finally {
      setSavingEntry(false);
    }
  };

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFeedback(null);
    setSavingAccount(true);
    try {
      const cleaned = newAccountInitial.replace(/[^\d.,-]/g, '').replace(',', '.');
      const val = Number(cleaned);
      const initialCents = Number.isFinite(val) ? Math.round(val * 100) : 0;

      const res = await fetch('/api/admin/finance/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newAccountName,
          account_type: newAccountType,
          initial_balance_cents: initialCents,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error || 'Erro ao criar conta.');
        return;
      }
      setNewAccountName('');
      setNewAccountInitial('0,00');
      setShowAccountForm(false);
      setFeedback(`Conta "${json.account?.name}" criada com sucesso.`);
      await loadDashboard();
    } catch {
      setError('Erro de conexão ao criar conta.');
    } finally {
      setSavingAccount(false);
    }
  };

  const handleConfirmPendingOrder = async (order: PendingOrder) => {
    setError(null);
    setFeedback(null);
    setConfirmingOrderId(order.id);
    try {
      const selectedAcc = orderTargetAccounts[order.id];
      const res = await fetch(`/api/admin/orders/${order.id}/payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'confirm_manual',
          paymentMethod: order.payment_method || 'pix',
          accountId: selectedAcc || undefined,
          notes: 'Confirmado e lançado pelo módulo Financeiro',
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error || 'Não foi possível confirmar o pagamento.');
        return;
      }
      setFeedback(`Pagamento do pedido ${order.order_number} confirmado e lançado no financeiro.`);
      await loadDashboard();
    } catch {
      setError('Erro de comunicação ao confirmar pagamento.');
    } finally {
      setConfirmingOrderId(null);
    }
  };

  const handleSyncOrders = async () => {
    setError(null);
    setFeedback(null);
    setSyncingOrders(true);
    try {
      const res = await fetch('/api/admin/finance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sync_orders' }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error || 'Erro ao sincronizar pedidos pagos.');
        return;
      }
      setFeedback(`${json.syncedCount || 0} venda(s) paga(s) importada(s) para o financeiro.`);
      await loadDashboard();
    } catch {
      setError('Erro de comunicação ao sincronizar vendas.');
    } finally {
      setSyncingOrders(false);
    }
  };

  const handleToggleEntryStatus = async (entry: FinanceEntry) => {
    const nextStatus: EntryStatus = entry.status === 'paid' ? 'pending' : 'paid';
    try {
      const res = await fetch(`/api/admin/finance/${entry.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        setError(json?.error || 'Erro ao atualizar status do lançamento.');
        return;
      }
      await loadDashboard();
    } catch {
      setError('Erro de comunicação.');
    }
  };

  const handleDeleteEntry = async (entry: FinanceEntry) => {
    if (!window.confirm(`Deseja excluir o lançamento "${entry.description}"?`)) return;
    try {
      const res = await fetch(`/api/admin/finance/${entry.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        setError(json?.error || 'Erro ao excluir lançamento.');
        return;
      }
      setFeedback('Lançamento excluído.');
      await loadDashboard();
    } catch {
      setError('Erro de comunicação ao excluir.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-bold text-stone-900 flex items-center gap-2">
            <Wallet className="w-6 h-6 text-amber-600" />
            Financeiro, Caixa & Despesas
          </h1>
          <p className="text-sm text-stone-500">
            Controle exclusivo do administrador: saldos de Caixa e Conta Corrente, baixas de PIX e despesas.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => handleOpenEntryForm('income')}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700"
          >
            <ArrowUpCircle className="w-4 h-4" />
            Nova Entrada
          </button>
          <button
            type="button"
            onClick={() => handleOpenEntryForm('expense')}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700"
          >
            <ArrowDownCircle className="w-4 h-4" />
            Nova Despesa
          </button>
          <button
            type="button"
            onClick={() => setShowAccountForm((prev) => !prev)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-stone-300 bg-white text-stone-700 text-xs font-semibold hover:bg-stone-50"
          >
            <Plus className="w-4 h-4" />
            Nova Conta
          </button>
          <button
            type="button"
            onClick={() => void loadDashboard()}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-stone-300 bg-white text-stone-700 text-xs font-semibold hover:bg-stone-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {feedback && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{feedback}</span>
        </div>
      )}

      {/* Aviso de vendas pagas ainda não sincronizadas */}
      {data && data.unsyncedPaidOrdersCount > 0 && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-amber-900">
            <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              Existem <strong>{data.unsyncedPaidOrdersCount}</strong> venda(s) paga(s) ainda não lançada(s) no extrato do Caixa/Conta Corrente.
            </span>
          </div>
          <button
            type="button"
            onClick={handleSyncOrders}
            disabled={syncingOrders}
            className="px-3 py-1.5 rounded-lg bg-amber-600 text-white text-xs font-semibold hover:bg-amber-700 disabled:opacity-50 self-start sm:self-auto"
          >
            {syncingOrders ? 'Importando...' : 'Importar Vendas Pagas'}
          </button>
        </div>
      )}

      {/* Cards de Contas & Resumo */}
      {data && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {data.accounts.map((acc) => (
              <div
                key={acc.id}
                className="bg-white rounded-xl border border-stone-200 p-4 shadow-sm flex flex-col justify-between gap-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase text-stone-500">{acc.name}</span>
                  {acc.account_type === 'cash' ? (
                    <Banknote className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <Landmark className="w-4 h-4 text-blue-600" />
                  )}
                </div>
                <p
                  className={`text-xl font-bold font-mono ${
                    acc.current_balance_cents >= 0 ? 'text-stone-900' : 'text-red-600'
                  }`}
                >
                  {formatBrl(acc.current_balance_cents)}
                </p>
                <span className="text-[11px] text-stone-400">
                  {acc.account_type === 'cash'
                    ? 'Dinheiro em caixa'
                    : acc.account_type === 'checking'
                    ? 'Conta Corrente / PIX / Cartão'
                    : 'Carteira / Outra'}
                </span>
              </div>
            ))}

            <div className="bg-stone-900 text-white rounded-xl p-4 shadow-sm flex flex-col justify-between gap-2">
              <span className="text-xs font-bold uppercase text-stone-400">Saldo Consolidado</span>
              <p className="text-xl font-bold font-mono text-amber-400">
                {formatBrl(data.summary.totalBalanceCents)}
              </p>
              <div className="text-[11px] text-stone-300 flex items-center justify-between">
                <span>Entradas: {formatBrl(data.summary.totalIncomePaidCents)}</span>
                <span>Saídas: {formatBrl(data.summary.totalExpensePaidCents)}</span>
              </div>
            </div>
          </div>

          {/* Resumo do período */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white rounded-xl border border-stone-200 p-3.5">
              <span className="text-[11px] text-stone-500 block">Entradas no período</span>
              <strong className="text-base font-mono text-emerald-700">
                {formatBrl(data.summary.totalIncomePaidCents)}
              </strong>
            </div>
            <div className="bg-white rounded-xl border border-stone-200 p-3.5">
              <span className="text-[11px] text-stone-500 block">Despesas pagas</span>
              <strong className="text-base font-mono text-red-600">
                {formatBrl(data.summary.totalExpensePaidCents)}
              </strong>
            </div>
            <div className="bg-white rounded-xl border border-stone-200 p-3.5">
              <span className="text-[11px] text-stone-500 block">Despesas pendentes</span>
              <strong className="text-base font-mono text-amber-700">
                {formatBrl(data.summary.pendingExpenseCents)}
              </strong>
            </div>
            <div className="bg-white rounded-xl border border-stone-200 p-3.5">
              <span className="text-[11px] text-stone-500 block">Resultado líquido</span>
              <strong
                className={`text-base font-mono ${
                  data.summary.netPeriodCents >= 0 ? 'text-stone-900' : 'text-red-600'
                }`}
              >
                {formatBrl(data.summary.netPeriodCents)}
              </strong>
            </div>
          </div>
        </>
      )}

      {/* Formulário: Nova Conta */}
      {showAccountForm && (
        <form
          onSubmit={handleCreateAccount}
          className="bg-white rounded-xl border border-stone-200 p-5 shadow-sm space-y-4"
        >
          <h2 className="text-sm font-bold text-stone-900">Cadastrar Conta Financeira</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-stone-600 mb-1">Nome da conta *</label>
              <input
                type="text"
                required
                value={newAccountName}
                onChange={(e) => setNewAccountName(e.target.value)}
                placeholder="Ex: Conta Banco Inter"
                className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-stone-600 mb-1">Tipo *</label>
              <select
                value={newAccountType}
                onChange={(e) => setNewAccountType(e.target.value as AccountType)}
                className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm bg-white"
              >
                <option value="checking">Conta Corrente</option>
                <option value="cash">Caixa (Dinheiro)</option>
                <option value="digital">Carteira Digital / Maquininha</option>
                <option value="other">Outra</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-stone-600 mb-1">Saldo inicial (R$)</label>
              <input
                type="text"
                value={newAccountInitial}
                onChange={(e) => setNewAccountInitial(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm font-mono"
              />
            </div>
          </div>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowAccountForm(false)}
              className="px-3 py-2 rounded-lg border border-stone-300 text-xs font-semibold text-stone-600"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={savingAccount}
              className="px-4 py-2 rounded-lg bg-stone-900 text-white text-xs font-semibold hover:bg-stone-800 disabled:opacity-50"
            >
              {savingAccount ? 'Salvando...' : 'Salvar Conta'}
            </button>
          </div>
        </form>
      )}

      {/* Formulário: Novo Lançamento (Entrada ou Despesa) */}
      {showEntryForm && data && (
        <form
          onSubmit={handleCreateEntry}
          className="bg-white rounded-xl border border-stone-200 p-5 shadow-sm space-y-4"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-stone-900">
              {entryType === 'expense' ? 'Registrar Nova Despesa' : 'Registrar Nova Entrada'}
            </h2>
            <div className="inline-flex rounded-lg border border-stone-200 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => handleOpenEntryForm('income')}
                className={`px-2.5 py-1 rounded-md font-semibold ${
                  entryType === 'income' ? 'bg-emerald-600 text-white' : 'text-stone-600'
                }`}
              >
                Entrada
              </button>
              <button
                type="button"
                onClick={() => handleOpenEntryForm('expense')}
                className={`px-2.5 py-1 rounded-md font-semibold ${
                  entryType === 'expense' ? 'bg-red-600 text-white' : 'text-stone-600'
                }`}
              >
                Despesa
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-stone-600 mb-1">Conta *</label>
              <select
                required
                value={entryAccountId}
                onChange={(e) => setEntryAccountId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm bg-white"
              >
                {data.accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-stone-600 mb-1">Categoria *</label>
              <select
                value={entryCategory}
                onChange={(e) => setEntryCategory(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm bg-white"
              >
                {(entryType === 'expense' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES).map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-stone-600 mb-1">Valor (R$) *</label>
              <input
                type="text"
                required
                placeholder="0,00"
                value={entryAmount}
                onChange={(e) => setEntryAmount(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm font-mono"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-stone-600 mb-1">Descrição *</label>
              <input
                type="text"
                required
                placeholder={
                  entryType === 'expense'
                    ? 'Ex: Compra de carnes / Pagamento motoboy'
                    : 'Ex: Reforço de caixa / Venda avulsa'
                }
                value={entryDescription}
                onChange={(e) => setEntryDescription(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-stone-600 mb-1">Data *</label>
              <input
                type="date"
                required
                value={entryDate}
                onChange={(e) => setEntryDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-stone-600 mb-1">Forma</label>
              <select
                value={entryMethod}
                onChange={(e) => setEntryMethod(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm bg-white"
              >
                <option value="pix">PIX</option>
                <option value="cash">Dinheiro</option>
                <option value="debit_card">Cartão de Débito</option>
                <option value="credit_card">Cartão de Crédito</option>
                <option value="bank_transfer">Transferência / Boleto</option>
                <option value="other">Outro</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-stone-600 mb-1">Status</label>
              <select
                value={entryStatus}
                onChange={(e) => setEntryStatus(e.target.value as EntryStatus)}
                className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm bg-white"
              >
                <option value="paid">
                  {entryType === 'expense' ? 'Pago (Debitar agora)' : 'Recebido (Creditar agora)'}
                </option>
                <option value="pending">
                  {entryType === 'expense' ? 'Pendente (A pagar)' : 'Pendente (A receber)'}
                </option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowEntryForm(false)}
              className="px-3 py-2 rounded-lg border border-stone-300 text-xs font-semibold text-stone-600"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={savingEntry}
              className="px-4 py-2 rounded-lg bg-stone-900 text-white text-xs font-semibold hover:bg-stone-800 disabled:opacity-50"
            >
              {savingEntry ? 'Salvando...' : 'Salvar Lançamento'}
            </button>
          </div>
        </form>
      )}

      {/* Pedidos aguardando confirmação de pagamento (PIX / Dinheiro / Cartão) */}
      {data && data.pendingPaymentOrders.length > 0 && (
        <div className="bg-white rounded-xl border border-amber-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 bg-amber-50 border-b border-amber-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-700" />
              <h2 className="text-sm font-bold text-amber-950">
                Pedidos Aguardando Confirmação de Pagamento ({data.pendingPaymentOrders.length})
              </h2>
            </div>
            <span className="text-[11px] text-amber-800">
              Confirme o PIX/recebimento para dar entrada automática na conta selecionada
            </span>
          </div>
          <div className="divide-y divide-stone-100">
            {data.pendingPaymentOrders.map((order) => {
              const methodLabel =
                PAYMENT_METHOD_LABELS[(order.payment_method || 'pix') as keyof typeof PAYMENT_METHOD_LABELS] ||
                order.payment_method ||
                'PIX';
              const defaultAccount =
                order.payment_method === 'cash'
                  ? data.accounts.find((a) => a.account_type === 'cash')?.id || data.accounts[0]?.id
                  : data.accounts.find((a) => a.account_type !== 'cash')?.id || data.accounts[0]?.id;

              return (
                <div
                  key={order.id}
                  className="px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                >
                  <div>
                    <span className="font-bold text-stone-900">{order.order_number}</span>
                    <span className="text-stone-500"> · {order.customer_name} · </span>
                    <span className="font-semibold text-amber-800">{methodLabel}</span>
                    <span className="text-stone-400 block text-[11px]">
                      {new Date(order.created_at).toLocaleString('pt-BR')}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono font-bold text-sm text-stone-900 mr-2">
                      {formatBrl(order.total_cents)}
                    </span>
                    <select
                      value={orderTargetAccounts[order.id] || defaultAccount || ''}
                      onChange={(e) =>
                        setOrderTargetAccounts((prev) => ({ ...prev, [order.id]: e.target.value }))
                      }
                      className="px-2.5 py-1.5 rounded-lg border border-stone-300 bg-white text-xs"
                    >
                      {data.accounts.map((acc) => (
                        <option key={acc.id} value={acc.id}>
                          Entrar em: {acc.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => handleConfirmPendingOrder(order)}
                      disabled={confirmingOrderId === order.id}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-700 disabled:opacity-50"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {confirmingOrderId === order.id ? 'Confirmando...' : 'Confirmar & Dar Entrada'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Filtros & Extrato */}
      <div className="bg-white rounded-xl border border-stone-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-stone-200 flex flex-wrap items-end gap-3 bg-stone-50">
          <div>
            <label className="block text-[10px] font-bold uppercase text-stone-500 mb-1">De</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg border border-stone-300 bg-white text-xs"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase text-stone-500 mb-1">Até</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg border border-stone-300 bg-white text-xs"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase text-stone-500 mb-1">Conta</label>
            <select
              value={accountFilter}
              onChange={(e) => setAccountFilter(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg border border-stone-300 bg-white text-xs"
            >
              <option value="all">Todas as contas</option>
              {data?.accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase text-stone-500 mb-1">Tipo</label>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as 'all' | EntryType)}
              className="px-2.5 py-1.5 rounded-lg border border-stone-300 bg-white text-xs"
            >
              <option value="all">Entradas e Despesas</option>
              <option value="income">Somente Entradas</option>
              <option value="expense">Somente Despesas</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase text-stone-500 mb-1">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'all' | EntryStatus)}
              className="px-2.5 py-1.5 rounded-lg border border-stone-300 bg-white text-xs"
            >
              <option value="all">Todos</option>
              <option value="paid">Pago / Recebido</option>
              <option value="pending">Pendente</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-stone-50 border-b border-stone-200 text-stone-500 uppercase text-[10px]">
              <tr>
                <th className="py-3 px-4">Data</th>
                <th className="py-3 px-4">Descrição</th>
                <th className="py-3 px-4">Categoria</th>
                <th className="py-3 px-4">Conta</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Valor</th>
                <th className="py-3 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {!data || data.entries.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-stone-400">
                    Nenhum lançamento encontrado para os filtros selecionados.
                  </td>
                </tr>
              ) : (
                data.entries.map((entry) => (
                  <tr key={entry.id} className="hover:bg-stone-50">
                    <td className="py-3 px-4 whitespace-nowrap font-mono text-stone-600">
                      {entry.occurred_on.split('-').reverse().join('/')}
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-semibold text-stone-900 block">{entry.description}</span>
                      {entry.payment_method && (
                        <span className="text-[10px] text-stone-400 uppercase">{entry.payment_method}</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-stone-600">{entry.category}</td>
                    <td className="py-3 px-4 text-stone-700 font-medium">{entry.account_name}</td>
                    <td className="py-3 px-4">
                      <button
                        type="button"
                        onClick={() => handleToggleEntryStatus(entry)}
                        title="Clique para alternar entre Pago e Pendente"
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                          entry.status === 'paid'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {entry.status === 'paid'
                          ? entry.entry_type === 'income'
                            ? 'Recebido'
                            : 'Pago'
                          : 'Pendente'}
                      </button>
                    </td>
                    <td
                      className={`py-3 px-4 text-right font-mono font-bold whitespace-nowrap ${
                        entry.entry_type === 'income' ? 'text-emerald-700' : 'text-red-600'
                      }`}
                    >
                      {entry.entry_type === 'income' ? '+' : '-'} {formatBrl(entry.amount_cents)}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => handleDeleteEntry(entry)}
                        title="Excluir lançamento"
                        className="p-1.5 rounded text-stone-400 hover:text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

