'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  ShoppingBag,
  Clock,
  CheckCircle2,
  ChefHat,
  Truck,
  Store,
  XCircle,
  PackageCheck,
  Search,
  Filter,
  RefreshCw,
  Eye,
  Calendar,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import {
  CanonicalOrderStatus,
  CanonicalPaymentStatus,
  ORDER_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
} from '@/modules/orders/order-status.machine';
import { formatBrl } from '@/modules/cart/cart.utils';

interface AdminOrderSummary {
  id: string;
  order_number: string;
  public_tracking_token: string;
  customer_name: string;
  customer_phone: string;
  fulfillment_type: 'delivery' | 'pickup';
  schedule_type: 'asap' | 'scheduled';
  scheduled_for?: string | null;
  status: CanonicalOrderStatus;
  payment_status: CanonicalPaymentStatus;
  subtotal_cents: number;
  delivery_fee_cents: number;
  total_cents: number;
  created_at: string;
}

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<AdminOrderSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const fetchOrders = useCallback(async () => {
    setIsLoading(true);
    try {
      const url = statusFilter !== 'all'
        ? `/api/admin/orders?status=${statusFilter}`
        : '/api/admin/orders';
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setOrders(data.orders || []);
      }
    } catch {
      // Ignora erro de rede momentâneo
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const filteredOrders = orders.filter((o) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      o.order_number.toLowerCase().includes(term) ||
      o.customer_name.toLowerCase().includes(term) ||
      o.customer_phone.includes(term)
    );
  });

  const getStatusBadge = (status: CanonicalOrderStatus) => {
    switch (status) {
      case 'pending':
        return <Badge variant="secondary" className="bg-amber-500/10 text-amber-700 border-amber-500/20">Aguardando</Badge>;
      case 'confirmed':
        return <Badge variant="primary" className="bg-blue-500/10 text-blue-700 border-blue-500/20">Confirmado</Badge>;
      case 'preparing':
        return <Badge variant="accent" className="bg-purple-500/10 text-purple-700 border-purple-500/20">Em Preparo</Badge>;
      case 'ready':
        return <Badge variant="accent" className="bg-indigo-500/10 text-indigo-700 border-indigo-500/20">Pronto</Badge>;
      case 'out_for_delivery':
        return <Badge variant="primary" className="bg-amber-500/10 text-amber-800 border-amber-500/20">A Caminho</Badge>;
      case 'delivered':
        return <Badge variant="primary" className="bg-emerald-500/10 text-emerald-800 border-emerald-500/20">Entregue</Badge>;
      case 'cancelled':
        return <Badge variant="secondary" className="bg-red-500/10 text-red-700 border-red-500/20">Cancelado</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getPaymentBadge = (status: CanonicalPaymentStatus) => {
    if (status === 'paid') {
      return <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600"><CheckCircle2 className="w-3.5 h-3.5" /> Pago</span>;
    }
    return <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600"><Clock className="w-3.5 h-3.5" /> Pendente</span>;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Gestão de Pedidos
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Acompanhe o fluxo comercial e operacional em tempo real.
          </p>
        </div>

        <button
          onClick={fetchOrders}
          disabled={isLoading}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-all shadow-sm self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span>Atualizar</span>
        </button>
      </div>

      {/* Barra de Filtros e Busca */}
      <Card className="p-4 bg-white border border-slate-200 shadow-sm space-y-3">
        <div className="flex flex-col md:flex-row gap-3">
          {/* Campo de Busca */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Buscar por nº do pedido, cliente ou telefone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400"
            />
          </div>

          {/* Filtros de Status */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
            <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0 hidden sm:block" />
            {[
              { id: 'all', label: 'Todos' },
              { id: 'pending', label: 'Aguardando' },
              { id: 'confirmed', label: 'Confirmados' },
              { id: 'preparing', label: 'Em Preparo' },
              { id: 'ready', label: 'Prontos' },
              { id: 'out_for_delivery', label: 'A Caminho' },
              { id: 'delivered', label: 'Entregues' },
              { id: 'cancelled', label: 'Cancelados' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setStatusFilter(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                  statusFilter === tab.id
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Listagem em Tabela */}
      <Card className="bg-white border border-slate-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="py-16 text-center text-xs text-slate-500 flex flex-col items-center justify-center gap-2">
            <RefreshCw className="w-6 h-6 animate-spin text-slate-400" />
            <span>Carregando pedidos...</span>
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="py-16 text-center text-xs text-slate-500 space-y-2">
            <ShoppingBag className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="font-semibold text-slate-700">Nenhum pedido encontrado</p>
            <p className="text-slate-400">Não há registros correspondentes aos filtros selecionados.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/75 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-4">Pedido</th>
                  <th className="py-3 px-4">Horário</th>
                  <th className="py-3 px-4">Cliente</th>
                  <th className="py-3 px-4">Modalidade</th>
                  <th className="py-3 px-4">Valor Total</th>
                  <th className="py-3 px-4">Pagamento</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredOrders.map((order) => {
                  const isScheduled = order.schedule_type === 'scheduled' && order.scheduled_for;
                  return (
                    <tr key={order.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4 font-bold text-slate-900">
                        {order.order_number}
                      </td>
                      <td className="py-3.5 px-4 text-slate-500 whitespace-nowrap">
                        {new Date(order.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        <span className="block text-[10px] text-slate-400">
                          {new Date(order.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="font-semibold text-slate-800 block">{order.customer_name}</span>
                        <span className="text-[11px] text-slate-400 block">{order.customer_phone}</span>
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 font-medium text-slate-700">
                          {order.fulfillment_type === 'delivery' ? (
                            <>
                              <Truck className="w-3.5 h-3.5 text-blue-600" />
                              <span>Entrega</span>
                            </>
                          ) : (
                            <>
                              <Store className="w-3.5 h-3.5 text-amber-600" />
                              <span>Retirada</span>
                            </>
                          )}
                        </div>
                        {isScheduled && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-purple-700 mt-0.5">
                            <Calendar className="w-3 h-3" />
                            <span>Agendado</span>
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 font-bold text-slate-900 font-mono">
                        {formatBrl(order.total_cents)}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {getPaymentBadge(order.payment_status)}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {getStatusBadge(order.status)}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <Link
                          href={`/admin/pedidos/${order.id}`}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 transition-all shadow-sm"
                        >
                          <Eye className="w-3 h-3" />
                          <span>Ver</span>
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

