-- ==============================================================================
-- Migration 00023: Módulo Financeiro (Contas Caixa/Banco & Lançamentos)
-- Multi-tenant com isolamento por tenant_id e acesso restrito a tenant_admin.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.finance_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  account_type text NOT NULL CHECK (account_type IN ('cash', 'checking', 'digital', 'other')),
  initial_balance_cents integer NOT NULL DEFAULT 0,
  is_default_cash boolean NOT NULL DEFAULT false,
  is_default_bank boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_finance_accounts_tenant
  ON public.finance_accounts (tenant_id, is_active);

CREATE TABLE IF NOT EXISTS public.finance_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.finance_accounts(id) ON DELETE RESTRICT,
  entry_type text NOT NULL CHECK (entry_type IN ('income', 'expense')),
  category text NOT NULL,
  description text NOT NULL,
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  payment_method text NULL,
  status text NOT NULL DEFAULT 'paid' CHECK (status IN ('paid', 'pending')),
  occurred_on date NOT NULL DEFAULT current_date,
  order_id uuid NULL REFERENCES public.orders(id) ON DELETE SET NULL,
  created_by uuid NULL,
  notes text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_finance_entries_tenant_date
  ON public.finance_entries (tenant_id, occurred_on DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_finance_entries_account
  ON public.finance_entries (tenant_id, account_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS uq_finance_entries_order_income
  ON public.finance_entries (tenant_id, order_id)
  WHERE order_id IS NOT NULL AND entry_type = 'income';

ALTER TABLE public.finance_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "finance_accounts_admin_only" ON public.finance_accounts;
CREATE POLICY "finance_accounts_admin_only"
  ON public.finance_accounts
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.tenant_members tm
      WHERE tm.tenant_id = finance_accounts.tenant_id
        AND tm.user_id = auth.uid()
        AND tm.is_active = true
        AND tm.role = 'tenant_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.tenant_members tm
      WHERE tm.tenant_id = finance_accounts.tenant_id
        AND tm.user_id = auth.uid()
        AND tm.is_active = true
        AND tm.role = 'tenant_admin'
    )
  );

DROP POLICY IF EXISTS "finance_entries_admin_only" ON public.finance_entries;
CREATE POLICY "finance_entries_admin_only"
  ON public.finance_entries
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.tenant_members tm
      WHERE tm.tenant_id = finance_entries.tenant_id
        AND tm.user_id = auth.uid()
        AND tm.is_active = true
        AND tm.role = 'tenant_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.tenant_members tm
      WHERE tm.tenant_id = finance_entries.tenant_id
        AND tm.user_id = auth.uid()
        AND tm.is_active = true
        AND tm.role = 'tenant_admin'
    )
  );

