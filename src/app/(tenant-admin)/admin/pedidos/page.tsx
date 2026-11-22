'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  ShoppingBag,
  Clock,
  CheckCircle2,
  ChefHat,
  Truck,
  Store,
  Utensils,
  Zap,
  XCircle,
  PackageCheck,
  Search,
  Filter,
  RefreshCw,
  Eye,
  Calendar,
  Printer,
  Volume2,
  VolumeX,
  Trash2,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { useSystemDialog } from '@/components/ui/SystemDialogProvider';
import {
  CanonicalOrderStatus,
  CanonicalPaymentStatus,
  ORDER_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  ORDER_CHANNEL_LABELS,
  PAYMENT_METHOD_LABELS,
} from '@/modules/orders/order-status.machine';
import { formatBrl } from '@/modules/cart/cart.utils';
import type { FulfillmentType, OrderChannel, OrderPaymentMethod } from '@/types/database.types';
import type { OperationalOrder } from '@/modules/orders/orders.service';
import { OrderPrintModal } from '@/components/admin/orders/OrderPrintModal';
import { mapOrderDetailToOperationalOrder } from '@/components/admin/orders/order-print-adapter';
import {
  isSoundEnabled,
  setSoundEnabled,
  playNewOrderChime,
  checkAndNotifyNewOrders,
} from '@/lib/audio/order-chime';

interface AdminOrderSummary {
  id: string;
  order_number: string;
  public_tracking_token: string;
  order_channel?: OrderChannel;
  customer_name: string;
  customer_phone: string;
  fulfillment_type: FulfillmentType;
  schedule_type: 'asap' | 'scheduled';
  scheduled_for?: string | null;
  status: CanonicalOrderStatus;
  payment_method?: OrderPaymentMethod;
  payment_status: CanonicalPaymentStatus;
  subtotal_cents: number;
  delivery_fee_cents: number;
  discount_cents?: number;
  total_cents: number;
  created_at: string;
}

export default function AdminOrdersPage() {
  const { showAlert, showConfirm, showPrompt } = useSystemDialog();
  const [orders, setOrders] = useState<AdminOrderSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [channelFilter, setChannelFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [soundActive, setSoundActive] = useState(true);
  const [printOrder, setPrintOrder] = useState<OperationalOrder | null>(null);
  const [printingOrderId, setPrintingOrderId] = useState<string | null>(null);
  const [confirmingPaymentId, setConfirmingPaymentId] = useState<string | null>(null);
  const [deletingOrderId, setDeletingOrderId] = useState<string | null>(null);
  const hasLoadedOnceRef = useRef(false);

  useEffect(() => {
    setSoundActive(isSoundEnabled());
  }, []);

  const handleToggleSound = () => {
    const nextState = !soundActive;
    setSoundActive(nextState);
    setSoundEnabled(nextState);
    if (nextState) {
      playNewOrderChime();
    }
  };

  const handleConfirmPayment = async (order: AdminOrderSummary) => {
    const methodLabel = PAYMENT_METHOD_LABELS[order.payment_method || 'pix'] || 'Pix';
    const confirmed = await showConfirm({
      title: 'Confirmar pagamento',
      message: `Confirmar recebimento do pagamento (${methodLabel}) do pedido ${order.order_number} no valor de ${formatBrl(order.total_cents)}?`,
      confirmLabel: 'Confirmar pagamento',
      cancelLabel: 'Cancelar',
    });
    if (!confirmed) return;

    setConfirmingPaymentId(order.id);
    try {
      const res = await fetch(`/api/admin/orders/${order.id}/payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'confirm_manual',
          paymentMethod: order.payment_method || 'pix',
          notes: `Confirmado manualmente na lista de pedidos (${methodLabel})`,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        await showAlert({
          title: 'Erro ao confirmar pagamento',
          message: data?.error || 'Não foi possível confirmar o pagamento.',
          variant: 'error',
        });
        return;
      }
      await fetchOrders();
    } catch {
      await showAlert({
        title: 'Erro de comunicação',
        message: 'Erro de comunicação ao confirmar pagamento.',
        variant: 'error',
      });
    } finally {
      setConfirmingPaymentId(null);
    }
  };

  const handleDeleteOrder = async (order: AdminOrderSummary) => {
    const reason = await showPrompt({
      title: `Excluir pedido ${order.order_number}`,
      message: `Informe o motivo da exclusão do pedido ${order.order_number} (${order.customer_name}). Caso já esteja lançado no financeiro, o lançamento também será removido e este motivo ficará registrado na auditoria.`,
      placeholder: 'Ex: Pedido de teste / Lançamento duplicado / Cancelado pelo cliente',
      required: true,
      confirmLabel: 'Excluir pedido',
      cancelLabel: 'Cancelar',
    });
    if (!reason || reason.trim().length < 3) {
      if (reason !== null) {
        await showAlert({
          title: 'Motivo obrigatório',
          message: 'Informe um motivo com pelo menos 3 caracteres para excluir o pedido.',
          variant: 'warning',
        });
      }
      return;
    }

    setDeletingOrderId(order.id);
    try {
      const res = await fetch(`/api/admin/orders/${order.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        await showAlert({
          title: 'Erro ao excluir pedido',
          message: data?.error || 'Não foi possível excluir o pedido.',
          variant: 'error',
        });
        return;
      }
      setOrders((prev) => prev.filter((o) => o.id !== order.id));
    } catch {
      await showAlert({
        title: 'Erro de comunicação',
        message: 'Erro de comunicação ao excluir pedido.',
        variant: 'error',
      });
    } finally {
      setDeletingOrderId(null);
    }
  };

  const handleQuickPrint = async (orderId: string) => {
    setPrintingOrderId(orderId);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}`);
      if (res.ok) {
        const detail = await res.json();
        setPrintOrder(mapOrderDetailToOperationalOrder(detail));
      }
    } catch {
      // Silencioso em falha momentânea
    } finally {
      setPrintingOrderId(null);
    }
  };

  const fetchOrders = useCallback(async (isSilent = false) => {
    if (!isSilent) setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (channelFilter !== 'all') params.set('channel', channelFilter);
      const qs = params.toString();
      const url = qs ? `/api/admin/orders?${qs}` : '/api/admin/orders';
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const nextOrders: AdminOrderSummary[] = data.orders || [];
        if (statusFilter === 'all' && channelFilter === 'all') {
          checkAndNotifyNewOrders(
            nextOrders.map((o) => o.id),
            !hasLoadedOnceRef.current
          );
          hasLoadedOnceRef.current = true;
        }
        setOrders(nextOrders);
      }
    } catch {
      // Ignora erro de rede momentâneo
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter, channelFilter]);

  useEffect(() => {
    fetchOrders();
    const interval = setInterval(() => {
      fetchOrders(true);
    }, 8000);
    return () => clearInterval(interval);
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

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={handleToggleSound}
            title={soundActive ? 'Desativar alerta sonoro de novos pedidos' : 'Ativar alerta sonoro'}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition-all shadow-sm ${
              soundActive
                ? 'bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100'
                : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
            }`}
          >
            {soundActive ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
            <span>{soundActive ? 'Alerta Ativo' : 'Alerta Mudo'}</span>
          </button>
          <Link
            href="/admin/pedido-rapido"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition-all shadow-sm"
          >
            <Zap className="w-3.5 h-3.5" />
            <span>+ Pedido Rápido</span>
          </Link>
          <button
            onClick={() => fetchOrders()}
            disabled={isLoading}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-all shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Atualizar</span>
          </button>
        </div>
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

        {/* Filtro por Canal de Atendimento */}
        <div className="flex items-center gap-1.5 overflow-x-auto pt-2 border-t border-slate-100 text-xs">
          <span className="text-[11px] font-bold text-slate-400 uppercase mr-1">Canal:</span>
          {[
            { id: 'all', label: 'Todos Canais' },
            { id: 'website', label: '🌐 Site' },
            { id: 'whatsapp', label: '💬 WhatsApp' },
            { id: 'phone', label: '📞 Telefone' },
            { id: 'counter', label: '🏪 Balcão' },
          ].map((ch) => (
            <button
              key={ch.id}
              onClick={() => setChannelFilter(ch.id)}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                channelFilter === ch.id
                  ? 'bg-emerald-700 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70'
              }`}
            >
              {ch.label}
            </button>
          ))}
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
                        <div>{order.order_number}</div>
                        <span className="inline-block mt-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                          {ORDER_CHANNEL_LABELS[order.order_channel || 'website'] || 'Site'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-slate-500 whitespace-nowrap">
                        {new Date(order.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        <span className="block text-[10px] text-slate-400">
                          {new Date(order.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="font-semibold text-slate-800 block">{order.customer_name}</span>
                        <span className="text-[11px] text-slate-400 block">{order.customer_phone || 'Balcão'}</span>
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 font-medium text-slate-700">
                          {order.fulfillment_type === 'delivery' ? (
                            <>
                              <Truck className="w-3.5 h-3.5 text-blue-600" />
                              <span>Entrega</span>
                            </>
                          ) : order.fulfillment_type === 'dine_in' ? (
                            <>
                              <Utensils className="w-3.5 h-3.5 text-purple-600" />
                              <span>No Local</span>
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
                        <div>{getPaymentBadge(order.payment_status)}</div>
                        <span className="block text-[10px] text-slate-400">
                          {PAYMENT_METHOD_LABELS[order.payment_method || 'pix'] || 'Pix'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {getStatusBadge(order.status)}
                      </td>
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          {order.payment_status === 'pending' && order.status !== 'cancelled' && (
                            <button
                              type="button"
                              onClick={() => handleConfirmPayment(order)}
                              disabled={confirmingPaymentId === order.id}
                              title="Confirmar pagamento recebido (PIX / Dinheiro / Cartão)"
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 transition-all disabled:opacity-50"
                            >
                              <CheckCircle2 className="w-3 h-3" />
                              <span>{confirmingPaymentId === order.id ? '...' : 'Confirmar Pgto'}</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleQuickPrint(order.id)}
                            disabled={printingOrderId === order.id}
                            title="Imprimir comanda térmica (58mm/80mm)"
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-stone-100 text-stone-700 text-xs font-semibold hover:bg-stone-200 transition-all disabled:opacity-50"
                          >
                            <Printer className="w-3 h-3" />
                            <span>{printingOrderId === order.id ? '...' : 'Imprimir'}</span>
                          </button>
                          <Link
                            href={`/admin/pedidos/${order.id}`}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 transition-all shadow-sm"
                          >
                            <Eye className="w-3 h-3" />
                            <span>Ver</span>
                          </Link>
                          <button
                            type="button"
                            onClick={() => handleDeleteOrder(order)}
                            disabled={deletingOrderId === order.id}
                            title="Excluir pedido (apenas administrador)"
                            className="inline-flex items-center gap-1 p-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-all disabled:opacity-50"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {printOrder && (
        <OrderPrintModal
          order={printOrder}
          tenantName="BENZA"
          onClose={() => setPrintOrder(null)}
        />
      )}
    </div>
  );
}

