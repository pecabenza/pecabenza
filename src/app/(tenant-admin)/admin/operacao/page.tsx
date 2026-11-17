'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  ChefHat,
  ShoppingBag,
  Volume2,
  VolumeX,
  RefreshCw,
  Search,
  Clock,
  Truck,
  Store,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Flame,
  Zap,
  CheckCircle2,
  PackageCheck,
  Calendar,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import type { OperationalOrder, OperationalMetrics } from '@/modules/orders/orders.service';
import type { CanonicalOrderStatus } from '@/modules/orders/order-status.machine';
import { OperationalOrderCard } from '@/components/admin/orders/OperationalOrderCard';
import { OrderPrintModal } from '@/components/admin/orders/OrderPrintModal';
import { useSystemDialog } from '@/components/ui/SystemDialogProvider';
import {
  isSoundEnabled,
  setSoundEnabled,
  playNewOrderChime,
  checkAndNotifyNewOrders,
} from '@/lib/audio/order-chime';

type QuickFilter =
  | 'all'
  | 'today'
  | 'asap'
  | 'scheduled'
  | 'delivery'
  | 'pickup'
  | 'paid'
  | 'pending_payment'
  | 'ch_whatsapp'
  | 'ch_phone'
  | 'ch_counter'
  | 'ch_website';

export default function OperationalKitchenPage() {
  const { showAlert } = useSystemDialog();
  const [orders, setOrders] = useState<OperationalOrder[]>([]);
  const [metrics, setMetrics] = useState<OperationalMetrics>({
    totalActive: 0,
    inPrep: 0,
    ready: 0,
    delayed: 0,
    scheduled: 0,
    deliveredToday: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [soundActive, setSoundActive] = useState(true);
  const [activeFilter, setActiveFilter] = useState<QuickFilter>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [showFinalized, setShowFinalized] = useState(false);
  const [printOrder, setPrintOrder] = useState<OperationalOrder | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Inicializa configuração de som
  useEffect(() => {
    setSoundActive(isSoundEnabled());
  }, []);

  const handleToggleSound = () => {
    const nextState = !soundActive;
    setSoundActive(nextState);
    setSoundEnabled(nextState);
    if (nextState) {
      playNewOrderChime(); // Teste sonoro imediato
    }
  };

  const fetchOperationalData = useCallback(async (isSilent = false) => {
    if (!isSilent) setIsRefreshing(true);
    setErrorMessage(null);

    try {
      const res = await fetch('/api/admin/orders/operational');
      if (!res.ok) {
        throw new Error('Falha ao sincronizar pedidos operacionais.');
      }

      const data = await res.json();
      const currentOrders: OperationalOrder[] = data.orders || [];

      // Verifica novos pedidos e toca sino se configurado
      const orderIds = currentOrders.map((o) => o.id);
      checkAndNotifyNewOrders(orderIds, isLoading);

      setOrders(currentOrders);
      if (data.metrics) {
        setMetrics(data.metrics);
      }
      setLastUpdated(new Date());
    } catch (err: any) {
      if (!isSilent) {
        setErrorMessage(err.message || 'Erro de conexão.');
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [isLoading]);

  // Carregamento inicial e Polling de 6 segundos
  useEffect(() => {
    fetchOperationalData();
    const interval = setInterval(() => {
      fetchOperationalData(true);
    }, 6000);

    return () => clearInterval(interval);
  }, [fetchOperationalData]);

  // Atualização atômica de status
  const handleStatusChange = async (orderId: string, nextStatus: CanonicalOrderStatus) => {
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Erro ao alterar status.');
      }

      // Re-sincroniza imediatamente
      await fetchOperationalData(true);
    } catch (err: any) {
      await showAlert({
        title: 'Erro ao avançar pedido',
        message: `Não foi possível avançar o pedido: ${err.message}`,
        variant: 'error',
      });
    }
  };

  // Confirmação manual e auditada de pagamento
  const handleConfirmPayment = async (orderId: string) => {
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'confirm_manual',
          notes: 'Confirmado na tela de Operação',
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Erro ao confirmar pagamento.');
      }

      await fetchOperationalData(true);
    } catch (err: any) {
      await showAlert({
        title: 'Erro ao confirmar pagamento',
        message: `Não foi possível confirmar o pagamento: ${err.message}`,
        variant: 'error',
      });
    }
  };

  // Filtragem dos pedidos
  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      // Filtro de busca textual
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const matchesNumber = order.orderNumber.toLowerCase().includes(term);
        const matchesCustomer = order.customerName.toLowerCase().includes(term);
        const matchesPhone = order.customerPhone.includes(term);
        if (!matchesNumber && !matchesCustomer && !matchesPhone) return false;
      }

      // Filtros rápidos
      switch (activeFilter) {
        case 'today':
          const today = new Date().toISOString().slice(0, 10);
          return order.createdAt.startsWith(today);
        case 'asap':
          return order.scheduleType === 'asap';
        case 'scheduled':
          return order.scheduleType === 'scheduled';
        case 'delivery':
          return order.fulfillmentType === 'delivery';
        case 'pickup':
          return order.fulfillmentType === 'pickup' || order.fulfillmentType === 'dine_in';
        case 'paid':
          return order.paymentStatus === 'paid';
        case 'pending_payment':
          return order.paymentStatus === 'pending' || order.paymentStatus === 'processing';
        case 'ch_whatsapp':
          return order.orderChannel === 'whatsapp';
        case 'ch_phone':
          return order.orderChannel === 'phone';
        case 'ch_counter':
          return order.orderChannel === 'counter';
        case 'ch_website':
          return (order.orderChannel || 'website') === 'website';
        default:
          return true;
      }
    });
  }, [orders, searchTerm, activeFilter]);

  // Agrupamento por colunas operacionais
  const activeColumns = useMemo(() => {
    return {
      pending: filteredOrders.filter((o) => o.status === 'pending'),
      confirmed: filteredOrders.filter((o) => o.status === 'confirmed'),
      preparing: filteredOrders.filter((o) => o.status === 'preparing'),
      ready: filteredOrders.filter((o) => o.status === 'ready'),
      out_for_delivery: filteredOrders.filter((o) => o.status === 'out_for_delivery'),
    };
  }, [filteredOrders]);

  const finalizedOrders = useMemo(() => {
    return filteredOrders.filter((o) => o.status === 'delivered' || o.status === 'cancelled');
  }, [filteredOrders]);

  return (
    <div className="space-y-5 max-w-[1700px] mx-auto pb-16">
      {/* Barra de Topo e Métricas Operacionais */}
      <div className="bg-white rounded-2xl p-5 border border-stone-200 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center">
              <ChefHat className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-black font-heading tracking-tight text-stone-900">
                  Operação do Restaurante
                </h1>
                <span className="flex h-2.5 w-2.5 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                </span>
              </div>
              <p className="text-xs text-stone-500 mt-0.5">
                Visão rápida em tempo real para cozinha e balcão • Polling a cada 6s
              </p>
            </div>
          </div>

          {/* Botões de Ação de Topo */}
          <div className="flex items-center gap-2.5 w-full md:w-auto justify-end flex-wrap">
            <Link
              href="/admin/pedido-rapido"
              className="flex items-center gap-2 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors shadow-xs"
            >
              <Zap className="w-4 h-4" />
              <span>+ Pedido Rápido (WhatsApp / Balcão)</span>
            </Link>

            <Link
              href="/admin/kds"
              className="flex items-center gap-2 px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition-colors shadow-xs"
            >
              <Flame className="w-4 h-4" />
              <span>Abrir KDS Cozinha</span>
            </Link>

            <button
              onClick={handleToggleSound}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all border ${
                soundActive
                  ? 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100'
                  : 'bg-stone-100 text-stone-500 border-stone-200 hover:bg-stone-200'
              }`}
              title={soundActive ? 'Desativar alerta sonoro' : 'Ativar alerta sonoro'}
            >
              {soundActive ? <Volume2 className="w-4 h-4 text-amber-600" /> : <VolumeX className="w-4 h-4" />}
              <span>{soundActive ? 'Alerta Sonoro Ativo' : 'Som Mutado'}</span>
            </button>

            <button
              onClick={() => fetchOperationalData()}
              disabled={isRefreshing}
              className="flex items-center gap-2 px-3.5 py-2 bg-stone-900 text-white rounded-xl text-xs font-bold hover:bg-stone-800 transition-colors disabled:opacity-60"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Atualizar</span>
            </button>
          </div>
        </div>

        {/* Linha de Métricas Rápidas */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-stone-100">
          <div className="bg-stone-50 rounded-xl p-3 border border-stone-100">
            <div className="text-[11px] font-bold uppercase tracking-wider text-stone-500">
              Pedidos Ativos
            </div>
            <div className="text-2xl font-black font-heading text-stone-900 mt-0.5">
              {metrics.totalActive}
            </div>
          </div>

          <div className="bg-amber-50/70 rounded-xl p-3 border border-amber-200/50">
            <div className="text-[11px] font-bold uppercase tracking-wider text-amber-800">
              Em Preparação
            </div>
            <div className="text-2xl font-black font-heading text-amber-900 mt-0.5">
              {metrics.inPrep}
            </div>
          </div>

          <div className="bg-purple-50/70 rounded-xl p-3 border border-purple-200/50">
            <div className="text-[11px] font-bold uppercase tracking-wider text-purple-800">
              Prontos (Aguardando Despacho)
            </div>
            <div className="text-2xl font-black font-heading text-purple-900 mt-0.5">
              {metrics.ready}
            </div>
          </div>

          <div
            className={`rounded-xl p-3 border ${
              metrics.delayed > 0
                ? 'bg-red-50 border-red-200 text-red-900 animate-pulse'
                : 'bg-stone-50 border-stone-100 text-stone-700'
            }`}
          >
            <div className="text-[11px] font-bold uppercase tracking-wider">
              Atrasados / Atenção
            </div>
            <div className="text-2xl font-black font-heading mt-0.5">
              {metrics.delayed}
            </div>
          </div>
        </div>
      </div>

      {/* Barra de Filtros Rápidos & Busca */}
      <div className="bg-white rounded-2xl p-3.5 border border-stone-200 shadow-sm flex flex-col lg:flex-row items-center justify-between gap-3">
        {/* Pílulas de Filtro */}
        <div className="flex items-center gap-1.5 overflow-x-auto w-full lg:w-auto pb-1 lg:pb-0 scrollbar-none text-xs">
          <button
            onClick={() => setActiveFilter('all')}
            className={`px-3 py-1.5 rounded-lg font-bold whitespace-nowrap transition-colors ${
              activeFilter === 'all'
                ? 'bg-stone-900 text-white'
                : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
            }`}
          >
            Todos ({orders.filter((o) => !['delivered', 'cancelled'].includes(o.status)).length})
          </button>
          <button
            onClick={() => setActiveFilter('asap')}
            className={`px-3 py-1.5 rounded-lg font-bold whitespace-nowrap transition-colors ${
              activeFilter === 'asap'
                ? 'bg-stone-900 text-white'
                : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
            }`}
          >
            Agora / Imediatos
          </button>
          <button
            onClick={() => setActiveFilter('scheduled')}
            className={`px-3 py-1.5 rounded-lg font-bold whitespace-nowrap transition-colors ${
              activeFilter === 'scheduled'
                ? 'bg-stone-900 text-white'
                : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
            }`}
          >
            ⏰ Agendados ({metrics.scheduled})
          </button>
          <button
            onClick={() => setActiveFilter('delivery')}
            className={`px-3 py-1.5 rounded-lg font-bold whitespace-nowrap transition-colors ${
              activeFilter === 'delivery'
                ? 'bg-stone-900 text-white'
                : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
            }`}
          >
            🚚 Entrega
          </button>
          <button
            onClick={() => setActiveFilter('pickup')}
            className={`px-3 py-1.5 rounded-lg font-bold whitespace-nowrap transition-colors ${
              activeFilter === 'pickup'
                ? 'bg-stone-900 text-white'
                : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
            }`}
          >
            🛍️ Retirada
          </button>
          <button
            onClick={() => setActiveFilter('paid')}
            className={`px-3 py-1.5 rounded-lg font-bold whitespace-nowrap transition-colors ${
              activeFilter === 'paid'
                ? 'bg-stone-900 text-white'
                : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
            }`}
          >
            Pagos
          </button>
          <button
            onClick={() => setActiveFilter('ch_whatsapp')}
            className={`px-3 py-1.5 rounded-lg font-bold whitespace-nowrap transition-colors ${
              activeFilter === 'ch_whatsapp'
                ? 'bg-emerald-700 text-white'
                : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
            }`}
          >
            💬 WhatsApp
          </button>
          <button
            onClick={() => setActiveFilter('ch_phone')}
            className={`px-3 py-1.5 rounded-lg font-bold whitespace-nowrap transition-colors ${
              activeFilter === 'ch_phone'
                ? 'bg-blue-700 text-white'
                : 'bg-blue-50 text-blue-800 hover:bg-blue-100'
            }`}
          >
            📞 Telefone
          </button>
          <button
            onClick={() => setActiveFilter('ch_counter')}
            className={`px-3 py-1.5 rounded-lg font-bold whitespace-nowrap transition-colors ${
              activeFilter === 'ch_counter'
                ? 'bg-amber-700 text-white'
                : 'bg-amber-50 text-amber-800 hover:bg-amber-100'
            }`}
          >
            🏪 Balcão
          </button>
          <button
            onClick={() => setActiveFilter('ch_website')}
            className={`px-3 py-1.5 rounded-lg font-bold whitespace-nowrap transition-colors ${
              activeFilter === 'ch_website'
                ? 'bg-stone-900 text-white'
                : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
            }`}
          >
            🌐 Site
          </button>
        </div>

        {/* Input de Busca */}
        <div className="relative w-full lg:w-72">
          <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar pedido # ou cliente..."
            className="w-full pl-9 pr-3 py-1.5 bg-stone-100 border-none rounded-lg text-xs text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>
      </div>

      {/* Erro de Comunicação */}
      {errorMessage && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-800 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600" />
            <span>{errorMessage}</span>
          </div>
          <button
            onClick={() => fetchOperationalData()}
            className="font-bold underline hover:no-underline"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {/* Colunas Operacionais / Swimlanes */}
      <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-4 items-start">
        {/* Coluna 1: Novos / Pendentes */}
        <div className="bg-stone-100/80 rounded-2xl p-3 border border-stone-200 space-y-3 min-w-0">
          <div className="flex items-center justify-between pb-2 border-b border-stone-200/80">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
              <h2 className="font-heading font-black text-sm text-stone-800">Novos</h2>
            </div>
            <span className="text-xs font-bold bg-white text-stone-800 px-2 py-0.5 rounded-full shadow-xs">
              {activeColumns.pending.length}
            </span>
          </div>

          <div className="space-y-3 min-h-[300px]">
            {activeColumns.pending.length === 0 ? (
              <div className="text-center py-12 text-stone-400 text-xs italic">
                Nenhum novo pedido pendente
              </div>
            ) : (
              activeColumns.pending.map((order) => (
                <OperationalOrderCard
                  key={order.id}
                  order={order}
                  onStatusChange={handleStatusChange}
                  onPrint={(o) => setPrintOrder(o)}
                  onConfirmPayment={handleConfirmPayment}
                />
              ))
            )}
          </div>
        </div>

        {/* Coluna 2: Confirmados */}
        <div className="bg-stone-100/80 rounded-2xl p-3 border border-stone-200 space-y-3 min-w-0">
          <div className="flex items-center justify-between pb-2 border-b border-stone-200/80">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
              <h2 className="font-heading font-black text-sm text-stone-800">Confirmados</h2>
            </div>
            <span className="text-xs font-bold bg-white text-stone-800 px-2 py-0.5 rounded-full shadow-xs">
              {activeColumns.confirmed.length}
            </span>
          </div>

          <div className="space-y-3 min-h-[300px]">
            {activeColumns.confirmed.length === 0 ? (
              <div className="text-center py-12 text-stone-400 text-xs italic">
                Nenhum pedido aguardando início de preparo
              </div>
            ) : (
              activeColumns.confirmed.map((order) => (
                <OperationalOrderCard
                  key={order.id}
                  order={order}
                  onStatusChange={handleStatusChange}
                  onPrint={(o) => setPrintOrder(o)}
                  onConfirmPayment={handleConfirmPayment}
                />
              ))
            )}
          </div>
        </div>

        {/* Coluna 3: Em Preparação */}
        <div className="bg-stone-100/80 rounded-2xl p-3 border border-stone-200 space-y-3 min-w-0">
          <div className="flex items-center justify-between pb-2 border-b border-stone-200/80">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-purple-500"></span>
              <h2 className="font-heading font-black text-sm text-stone-800">Em Preparo</h2>
            </div>
            <span className="text-xs font-bold bg-white text-stone-800 px-2 py-0.5 rounded-full shadow-xs">
              {activeColumns.preparing.length}
            </span>
          </div>

          <div className="space-y-3 min-h-[300px]">
            {activeColumns.preparing.length === 0 ? (
              <div className="text-center py-12 text-stone-400 text-xs italic">
                Nenhum pedido sendo preparado agora
              </div>
            ) : (
              activeColumns.preparing.map((order) => (
                <OperationalOrderCard
                  key={order.id}
                  order={order}
                  onStatusChange={handleStatusChange}
                  onPrint={(o) => setPrintOrder(o)}
                  onConfirmPayment={handleConfirmPayment}
                />
              ))
            )}
          </div>
        </div>

        {/* Coluna 4: Prontos */}
        <div className="bg-stone-100/80 rounded-2xl p-3 border border-stone-200 space-y-3 min-w-0">
          <div className="flex items-center justify-between pb-2 border-b border-stone-200/80">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-500"></span>
              <h2 className="font-heading font-black text-sm text-stone-800">Prontos</h2>
            </div>
            <span className="text-xs font-bold bg-white text-stone-800 px-2 py-0.5 rounded-full shadow-xs">
              {activeColumns.ready.length}
            </span>
          </div>

          <div className="space-y-3 min-h-[300px]">
            {activeColumns.ready.length === 0 ? (
              <div className="text-center py-12 text-stone-400 text-xs italic">
                Nenhum pedido pronto aguardando
              </div>
            ) : (
              activeColumns.ready.map((order) => (
                <OperationalOrderCard
                  key={order.id}
                  order={order}
                  onStatusChange={handleStatusChange}
                  onPrint={(o) => setPrintOrder(o)}
                  onConfirmPayment={handleConfirmPayment}
                />
              ))
            )}
          </div>
        </div>

        {/* Coluna 5: Saiu para Entrega */}
        <div className="bg-stone-100/80 rounded-2xl p-3 border border-stone-200 space-y-3 min-w-0">
          <div className="flex items-center justify-between pb-2 border-b border-stone-200/80">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
              <h2 className="font-heading font-black text-sm text-stone-800">Em Trânsito</h2>
            </div>
            <span className="text-xs font-bold bg-white text-stone-800 px-2 py-0.5 rounded-full shadow-xs">
              {activeColumns.out_for_delivery.length}
            </span>
          </div>

          <div className="space-y-3 min-h-[300px]">
            {activeColumns.out_for_delivery.length === 0 ? (
              <div className="text-center py-12 text-stone-400 text-xs italic">
                Nenhum pedido em trânsito
              </div>
            ) : (
              activeColumns.out_for_delivery.map((order) => (
                <OperationalOrderCard
                  key={order.id}
                  order={order}
                  onStatusChange={handleStatusChange}
                  onPrint={(o) => setPrintOrder(o)}
                  onConfirmPayment={handleConfirmPayment}
                />
              ))
            )}
          </div>
        </div>
      </div>

      {/* Seção Recolhida de Finalizados (Entregues & Cancelados) */}
      <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden shadow-xs">
        <button
          onClick={() => setShowFinalized(!showFinalized)}
          className="w-full px-5 py-3.5 flex items-center justify-between bg-stone-50 hover:bg-stone-100 transition-colors text-xs font-bold text-stone-700"
        >
          <div className="flex items-center gap-2">
            <PackageCheck className="w-4 h-4 text-stone-500" />
            <span>Pedidos Finalizados Recentemente ({finalizedOrders.length})</span>
          </div>
          {showFinalized ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {showFinalized && (
          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-white border-t border-stone-200">
            {finalizedOrders.length === 0 ? (
              <div className="col-span-full text-center py-6 text-stone-400 text-xs">
                Nenhum pedido finalizado no período.
              </div>
            ) : (
              finalizedOrders.map((order) => (
                <OperationalOrderCard
                  key={order.id}
                  order={order}
                  onStatusChange={handleStatusChange}
                  onPrint={(o) => setPrintOrder(o)}
                  onConfirmPayment={handleConfirmPayment}
                />
              ))
            )}
          </div>
        )}
      </div>

      {/* Modal de Impressão */}
      <OrderPrintModal
        order={printOrder}
        tenantName="BENZA Gastronomia"
        onClose={() => setPrintOrder(null)}
      />
    </div>
  );
}

