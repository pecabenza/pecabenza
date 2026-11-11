import React from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  Layers,
  UtensilsCrossed,
  Palette,
  Search,
  Clock,
  DollarSign,
  ShoppingBag,
  TrendingUp,
  CheckCircle2,
  AlertCircle,
  Zap,
  ChefHat,
  Truck,
  Store,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { getAdminAuthSession } from '@/lib/tenancy/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantSalesDashboardSummary } from '@/modules/orders/sales-dashboard.service';
import { formatBrl } from '@/modules/cart/cart.utils';
import { ORDER_CHANNEL_LABELS, PAYMENT_METHOD_LABELS } from '@/modules/orders/order-status.machine';

export const dynamic = 'force-dynamic';

export default async function AdminDashboardPage() {
  const session = await getAdminAuthSession();
  if (!session) {
    redirect('/admin/login?error=unauthorized');
  }

  const { tenant } = session;
  const adminClient = createAdminClient();

  // Consultar contagens e resumo gerencial de vendas (C4) em paralelo
  const [productsRes, sectionsRes, sales] = await Promise.all([
    adminClient
      .from('products')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenant.id)
      .eq('status', 'active'),
    adminClient
      .from('tenant_page_sections')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenant.id)
      .eq('is_active', true),
    getTenantSalesDashboardSummary(tenant.id),
  ]);

  const totalProducts = productsRes.count ?? 0;
  const totalSections = sectionsRes.count ?? 0;

  return (
    <div className="space-y-8">
      {/* Top Banner Dinâmico */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-stone-200 shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="font-heading text-2xl font-bold text-stone-900">
              Painel de Controle — {tenant.name}
            </h1>
            <Badge variant="secondary" className="text-[11px] uppercase">
              {tenant.slug}
            </Badge>
          </div>
          <p className="text-sm text-stone-500">
            Resumo diário de pedidos, faturamento, canais de venda e atalhos operacionais.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/admin/configuracoes/loja"
            className="px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 hover:bg-amber-100 flex items-center gap-2 text-xs font-semibold text-amber-800 transition-colors"
          >
            <Clock className="w-3.5 h-3.5 text-amber-600" />
            <span>
              Modo: {tenant.site_mode === 'commerce' ? 'Loja Ativa' : tenant.site_mode === 'institutional' ? 'Institucional' : 'Pré-Lançamento'}
            </span>
          </Link>
          <Link
            href="/admin/pedido-rapido"
            className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-xs transition-colors"
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Novo Pedido Rápido</span>
          </Link>
        </div>
      </div>

      {/* KPIs Financeiros & Operacionais (C4) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-stone-500">
            Resumo Comercial (Últimos 30 dias · exclui cancelados)
          </h2>
          <span className="text-xs text-stone-400">
            7 dias: <strong>{sales.last7DaysCount}</strong> pedidos ({formatBrl(sales.last7DaysRevenueCents)})
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="p-5 bg-white space-y-2 border-stone-200">
            <div className="flex items-center justify-between text-stone-500">
              <span className="text-xs uppercase font-bold tracking-wider">Pedidos Hoje</span>
              <ShoppingBag className="w-4 h-4 text-blue-600" />
            </div>
            <p className="text-2xl font-extrabold text-stone-900">
              {sales.todayCount} {sales.todayCount === 1 ? 'pedido' : 'pedidos'}
            </p>
            <p className="text-xs text-stone-500 font-medium">
              Receita hoje: <strong className="text-stone-800">{formatBrl(sales.todayRevenueCents)}</strong>
            </p>
          </Card>

          <Card className="p-5 bg-white space-y-2 border-stone-200">
            <div className="flex items-center justify-between text-stone-500">
              <span className="text-xs uppercase font-bold tracking-wider">Faturamento Pago</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            </div>
            <p className="text-2xl font-extrabold text-emerald-700">
              {formatBrl(sales.paidRevenueCents)}
            </p>
            <p className="text-xs text-stone-500">
              {sales.paidCount} {sales.paidCount === 1 ? 'pedido confirmado' : 'pedidos confirmados'}
            </p>
          </Card>

          <Card className="p-5 bg-white space-y-2 border-stone-200">
            <div className="flex items-center justify-between text-stone-500">
              <span className="text-xs uppercase font-bold tracking-wider">A Receber / Pendente</span>
              <AlertCircle className="w-4 h-4 text-amber-600" />
            </div>
            <p className="text-2xl font-extrabold text-amber-700">
              {formatBrl(sales.pendingRevenueCents)}
            </p>
            <p className="text-xs text-stone-500">
              {sales.pendingCount} {sales.pendingCount === 1 ? 'pedido em aberto' : 'pedidos em aberto'}
            </p>
          </Card>

          <Card className="p-5 bg-white space-y-2 border-stone-200">
            <div className="flex items-center justify-between text-stone-500">
              <span className="text-xs uppercase font-bold tracking-wider">Ticket Médio (30d)</span>
              <TrendingUp className="w-4 h-4 text-indigo-600" />
            </div>
            <p className="text-2xl font-extrabold text-stone-900">
              {formatBrl(sales.averageTicketCents)}
            </p>
            <p className="text-xs text-stone-500">
              {sales.last30DaysCount} válidos • {sales.cancelledCount} cancelado(s)
            </p>
          </Card>
        </div>
      </div>

      {/* Quebra por Canal, Forma de Pagamento e Top Pratos */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="p-5 bg-white border-stone-200 space-y-3">
          <div className="flex items-center justify-between border-b border-stone-100 pb-2">
            <h3 className="text-sm font-bold text-stone-900">Vendas por Canal (30d)</h3>
            <Store className="w-4 h-4 text-stone-400" />
          </div>
          {sales.byChannel.length === 0 ? (
            <p className="text-xs text-stone-400 py-4 text-center">Sem vendas registradas no período.</p>
          ) : (
            <div className="space-y-2.5 text-xs">
              {sales.byChannel.map((row) => (
                <div key={row.channel} className="flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-stone-800">
                      {ORDER_CHANNEL_LABELS[row.channel as keyof typeof ORDER_CHANNEL_LABELS] || row.channel}
                    </span>
                    <span className="text-stone-400 ml-1.5">({row.count})</span>
                  </div>
                  <span className="font-mono font-bold text-stone-900">{formatBrl(row.revenueCents)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-5 bg-white border-stone-200 space-y-3">
          <div className="flex items-center justify-between border-b border-stone-100 pb-2">
            <h3 className="text-sm font-bold text-stone-900">Formas de Pagamento (30d)</h3>
            <DollarSign className="w-4 h-4 text-stone-400" />
          </div>
          {sales.byPaymentMethod.length === 0 ? (
            <p className="text-xs text-stone-400 py-4 text-center">Sem pagamentos registrados no período.</p>
          ) : (
            <div className="space-y-2.5 text-xs">
              {sales.byPaymentMethod.map((row) => (
                <div key={row.method} className="flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-stone-800">
                      {PAYMENT_METHOD_LABELS[row.method as keyof typeof PAYMENT_METHOD_LABELS] || row.method}
                    </span>
                    <span className="text-stone-400 ml-1.5">({row.count})</span>
                  </div>
                  <span className="font-mono font-bold text-stone-900">{formatBrl(row.revenueCents)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-5 bg-white border-stone-200 space-y-3">
          <div className="flex items-center justify-between border-b border-stone-100 pb-2">
            <h3 className="text-sm font-bold text-stone-900">Pratos Mais Vendidos (30d)</h3>
            <UtensilsCrossed className="w-4 h-4 text-stone-400" />
          </div>
          {sales.topProducts.length === 0 ? (
            <p className="text-xs text-stone-400 py-4 text-center">Sem itens vendidos no período.</p>
          ) : (
            <div className="space-y-2.5 text-xs">
              {sales.topProducts.map((item) => (
                <div key={item.productName} className="flex items-center justify-between gap-2">
                  <div className="truncate">
                    <span className="font-semibold text-stone-800">{item.productName}</span>
                    <span className="text-stone-400 ml-1.5">({item.quantity}x)</span>
                  </div>
                  <span className="font-mono font-bold text-stone-900 shrink-0">{formatBrl(item.revenueCents)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Ações Rápidas Operacionais & Configuração */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-stone-900">Operação & Configuração ({totalProducts} pratos ativos · {totalSections} seções)</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Link
            href="/admin/pedidos"
            className="p-5 bg-white rounded-xl border border-stone-200 hover:border-amber-500 hover:shadow-sm transition-all group"
          >
            <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
              <ShoppingBag className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-stone-900 text-sm mb-1">Pedidos & Impressão</h3>
            <p className="text-xs text-stone-500">Acompanhe recebimento em tempo real e imprima comandas.</p>
          </Link>

          <Link
            href="/admin/kds"
            className="p-5 bg-white rounded-xl border border-stone-200 hover:border-amber-500 hover:shadow-sm transition-all group"
          >
            <div className="w-10 h-10 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
              <ChefHat className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-stone-900 text-sm mb-1">KDS Cozinha</h3>
            <p className="text-xs text-stone-500">Filas de produção por estação e tempo de preparo.</p>
          </Link>

          <Link
            href="/admin/expedicao"
            className="p-5 bg-white rounded-xl border border-stone-200 hover:border-amber-500 hover:shadow-sm transition-all group"
          >
            <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
              <Truck className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-stone-900 text-sm mb-1">Expedição & Entregas</h3>
            <p className="text-xs text-stone-500">Despacho de rotas, entregadores e rastreamento.</p>
          </Link>

          <Link
            href="/admin/produtos"
            className="p-5 bg-white rounded-xl border border-stone-200 hover:border-amber-500 hover:shadow-sm transition-all group"
          >
            <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
              <UtensilsCrossed className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-stone-900 text-sm mb-1">Gerenciar Cardápio</h3>
            <p className="text-xs text-stone-500">Edite pratos, fotos, variações de volume/peso e preços.</p>
          </Link>

          <Link
            href="/admin/configuracoes/loja"
            className="p-5 bg-white rounded-xl border border-stone-200 hover:border-amber-500 hover:shadow-sm transition-all group"
          >
            <div className="w-10 h-10 rounded-lg bg-stone-100 text-stone-700 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
              <Store className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-stone-900 text-sm mb-1">Configurações da Loja</h3>
            <p className="text-xs text-stone-500">Horários, taxas, pagamento presencial/Pix e checklist comercial.</p>
          </Link>

          <Link
            href="/admin/site"
            className="p-5 bg-white rounded-xl border border-stone-200 hover:border-amber-500 hover:shadow-sm transition-all group"
          >
            <div className="w-10 h-10 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
              <Layers className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-stone-900 text-sm mb-1">Editar Seções do Site</h3>
            <p className="text-xs text-stone-500">Altere textos do Hero, Manifesto e blocos da Home.</p>
          </Link>

          <Link
            href="/admin/identidade"
            className="p-5 bg-white rounded-xl border border-stone-200 hover:border-amber-500 hover:shadow-sm transition-all group"
          >
            <div className="w-10 h-10 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
              <Palette className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-stone-900 text-sm mb-1">Identidade Visual</h3>
            <p className="text-xs text-stone-500">Configure as cores da paleta, logotipo e canais de contato.</p>
          </Link>

          <Link
            href="/admin/seo"
            className="p-5 bg-white rounded-xl border border-stone-200 hover:border-amber-500 hover:shadow-sm transition-all group"
          >
            <div className="w-10 h-10 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
              <Search className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-stone-900 text-sm mb-1">SEO & Metadados</h3>
            <p className="text-xs text-stone-500">Ajuste títulos, descrições para o Google e Open Graph.</p>
          </Link>
        </div>
      </div>
    </div>
  );
}
