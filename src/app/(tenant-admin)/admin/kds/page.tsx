'use client';

import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  Suspense,
} from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Flame,
  Volume2,
  VolumeX,
  RefreshCw,
  Monitor,
  Minimize2,
  AlertOctagon,
  Clock,
  Wifi,
  WifiOff,
  BarChart3,
  CheckCircle2,
  ChefHat,
  PackageCheck,
  Settings,
  ExternalLink,
  AlertTriangle,
} from 'lucide-react';
import type {
  KdsOrderCardData,
  KdsDashboardMetrics,
  TenantSlaConfig,
} from '@/modules/orders/kds.engine';
import { DEFAULT_TENANT_SLA_CONFIG } from '@/modules/orders/kds.engine';
import type { ItemPreparationStatus } from '@/types/database.types';
import type { CanonicalOrderStatus } from '@/modules/orders/order-status.machine';
import { KdsOrderCard } from '@/components/admin/kds/KdsOrderCard';
import {
  isSoundEnabled,
  setSoundEnabled,
  playNewOrderChime,
  checkAndNotifyNewOrders,
} from '@/lib/audio/order-chime';

function KdsBoardContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const isTvMode = searchParams.get('mode') === 'tv';

  const [orders, setOrders] = useState<KdsOrderCardData[]>([]);
  const [metrics, setMetrics] = useState<KdsDashboardMetrics>({
    activeOrdersCount: 0,
    confirmedCount: 0,
    preparingCount: 0,
    readyCount: 0,
    delayedCount: 0,
    avgPrepTimeTodayMin: null,
    bottlenecks: {
      hasSufficientData: false,
      message: 'Dados insuficientes',
      minSampleRequired: 2,
      items: [],
    },
  });
  const [slaConfig, setSlaConfig] = useState<TenantSlaConfig>(
    DEFAULT_TENANT_SLA_CONFIG
  );
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [connectionState, setConnectionState] = useState<'online' | 'reconnecting'>(
    'online'
  );
  const [soundActive, setSoundActive] = useState(true);
  const [showBottlenecks, setShowBottlenecks] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

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

  const toggleTvMode = () => {
    if (isTvMode) {
      router.push('/admin/kds');
    } else {
      router.push('/admin/kds?mode=tv');
    }
  };

  const fetchKdsQueue = useCallback(
    async (silent = false) => {
      if (!silent) setIsRefreshing(true);

      try {
        const res = await fetch('/api/admin/kds', { cache: 'no-store' });
        if (!res.ok) {
          throw new Error('Falha ao atualizar KDS.');
        }

        const data = await res.json();
        const incomingOrders: KdsOrderCardData[] = data.orders || [];

        // Notifica apenas novos pedidos que entraram no KDS (uma única vez por pedido)
        const orderIds = incomingOrders.map((o) => o.id);
        checkAndNotifyNewOrders(orderIds, isInitialLoading);

        setOrders(incomingOrders);
        if (data.metrics) setMetrics(data.metrics);
        if (data.slaConfig) setSlaConfig(data.slaConfig);
        setConnectionState('online');
      } catch {
        // Recuperação de falhas: mantém último estado visível na tela e sinaliza reconexão
        setConnectionState('reconnecting');
      } finally {
        setIsInitialLoading(false);
        setIsRefreshing(false);
      }
    },
    [isInitialLoading]
  );

  // Polling resiliente a cada 5 segundos
  useEffect(() => {
    fetchKdsQueue();
    const timer = setInterval(() => {
      fetchKdsQueue(true);
    }, 5000);
    return () => clearInterval(timer);
  }, [fetchKdsQueue]);

  // Ação 1: Iniciar preparo do pedido e itens
  const handleStartPreparation = async (orderId: string) => {
    setActionFeedback(null);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/kds`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start_preparation' }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Falha ao iniciar preparo.');
      }
      await fetchKdsQueue(true);
    } catch (e: any) {
      setActionFeedback(e.message || 'Erro ao iniciar preparo.');
    }
  };

  // Ação 2: Marcar/desmarcar item do checklist
  const handleToggleItemStatus = async (
    orderId: string,
    orderItemId: string,
    nextStatus: ItemPreparationStatus
  ) => {
    setActionFeedback(null);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/kds`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_item_status',
          orderItemId,
          status: nextStatus,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Falha ao atualizar item.');
      }
      await fetchKdsQueue(true);
    } catch (e: any) {
      setActionFeedback(e.message || 'Erro ao atualizar item.');
    }
  };

  // Ação 3: Confirmar conclusão de preparo do pedido (preparing -> ready)
  const handleCompletePreparation = async (orderId: string) => {
    setActionFeedback(null);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/kds`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'complete_preparation' }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Falha ao concluir preparo.');
      }
      await fetchKdsQueue(true);
    } catch (e: any) {
      setActionFeedback(e.message || 'Erro ao concluir pedido.');
    }
  };

  // Ação 4: Expedir pedido pronto (sai do KDS após ready)
  const handleExitFromReady = async (
    orderId: string,
    nextStatus: CanonicalOrderStatus
  ) => {
    setActionFeedback(null);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Falha ao expedir pedido.');
      }
      await fetchKdsQueue(true);
    } catch (e: any) {
      setActionFeedback(e.message || 'Erro ao expedir pedido.');
    }
  };

  const columns = useMemo(() => {
    return {
      confirmed: orders.filter((o) => o.status === 'confirmed'),
      preparing: orders.filter((o) => o.status === 'preparing'),
      ready: orders.filter((o) => o.status === 'ready'),
    };
  }, [orders]);

  const wrapperClass = isTvMode
    ? 'fixed inset-0 z-50 bg-stone-950 text-stone-100 overflow-y-auto p-4 md:p-6 space-y-5'
    : 'space-y-5 pb-12';

  return (
    <div className={wrapperClass}>
      {/* Barra Superior do KDS */}
      <div
        className={`rounded-2xl p-4 border shadow-xs flex flex-col xl:flex-row items-start xl:items-center justify-between gap-4 ${
          isTvMode
            ? 'bg-stone-900 border-stone-800 text-white'
            : 'bg-white border-stone-200 text-stone-900'
        }`}
      >
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-amber-500/15 text-amber-500 flex items-center justify-center shrink-0">
            <Flame className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1
                className={`font-heading font-black tracking-tight ${
                  isTvMode ? 'text-2xl text-white' : 'text-xl text-stone-950'
                }`}
              >
                KDS • Operação de Cozinha
              </h1>

              {/* Indicador de Conexão Resiliente */}
              {connectionState === 'online' ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-600 border border-emerald-500/30">
                  <Wifi className="w-3.5 h-3.5" />
                  <span>Ao Vivo</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-500 border border-amber-500/40">
                  <WifiOff className="w-3.5 h-3.5" />
                  <span>Reconectando (mantendo último estado)</span>
                </span>
              )}
            </div>
            <p
              className={`text-xs mt-0.5 ${
                isTvMode ? 'text-stone-400' : 'text-stone-500'
              }`}
            >
              SLA alvo de preparo: {slaConfig.targetPreparationTimeMin} min • Alerta:{' '}
              {slaConfig.targetPreparationTimeMin - slaConfig.slaWarningBufferMin} min
            </p>
          </div>
        </div>

        {/* Métricas Rápidas do KDS */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 w-full xl:w-auto">
          <div
            className={`px-3.5 py-2 rounded-xl border ${
              isTvMode
                ? 'bg-stone-800/80 border-stone-700'
                : 'bg-stone-50 border-stone-200'
            }`}
          >
            <span className="text-[10px] font-bold uppercase tracking-wider opacity-70 block">
              Ativos no KDS
            </span>
            <span className="text-xl font-black font-heading">
              {metrics.activeOrdersCount}
            </span>
          </div>

          <div
            className={`px-3.5 py-2 rounded-xl border ${
              isTvMode
                ? 'bg-amber-950/50 border-amber-700/60 text-amber-300'
                : 'bg-amber-50 border-amber-200 text-amber-950'
            }`}
          >
            <span className="text-[10px] font-bold uppercase tracking-wider opacity-80 block">
              Em Preparo
            </span>
            <span className="text-xl font-black font-heading">
              {metrics.preparingCount}
            </span>
          </div>

          <div
            className={`px-3.5 py-2 rounded-xl border ${
              metrics.delayedCount > 0
                ? 'bg-red-600 text-white border-red-700'
                : isTvMode
                ? 'bg-stone-800/80 border-stone-700'
                : 'bg-stone-50 border-stone-200'
            }`}
          >
            <span className="text-[10px] font-bold uppercase tracking-wider opacity-90 block">
              Atrasados
            </span>
            <span className="text-xl font-black font-heading">
              {metrics.delayedCount}
            </span>
          </div>

          <div
            className={`px-3.5 py-2 rounded-xl border ${
              isTvMode
                ? 'bg-stone-800/80 border-stone-700'
                : 'bg-stone-50 border-stone-200'
            }`}
          >
            <span className="text-[10px] font-bold uppercase tracking-wider opacity-70 block">
              Preparo Médio Hoje
            </span>
            <span className="text-xl font-black font-heading">
              {metrics.avgPrepTimeTodayMin !== null
                ? `${metrics.avgPrepTimeTodayMin}m`
                : '--'}
            </span>
          </div>
        </div>

        {/* Controles do Operador (Touch-Friendly) */}
        <div className="flex items-center gap-2 flex-wrap w-full xl:w-auto justify-end">
          {!isTvMode && (
            <Link
              href="/admin/configuracoes/operacao"
              className="min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 border bg-stone-100 text-stone-700 border-stone-200 hover:bg-stone-200 transition-colors"
            >
              <Settings className="w-4 h-4" />
              <span>Estações & Fluxo</span>
            </Link>
          )}

          <button
            type="button"
            onClick={() => setShowBottlenecks(!showBottlenecks)}
            className={`min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 border transition-colors ${
              showBottlenecks
                ? 'bg-amber-500 text-stone-950 border-amber-600'
                : isTvMode
                ? 'bg-stone-800 text-stone-200 border-stone-700 hover:bg-stone-700'
                : 'bg-stone-100 text-stone-700 border-stone-200 hover:bg-stone-200'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            <span>Gargalos</span>
          </button>

          <button
            type="button"
            onClick={handleToggleSound}
            className={`min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 border transition-colors ${
              soundActive
                ? 'bg-amber-500/20 text-amber-600 border-amber-500/40'
                : isTvMode
                ? 'bg-stone-800 text-stone-400 border-stone-700'
                : 'bg-stone-100 text-stone-500 border-stone-200'
            }`}
          >
            {soundActive ? (
              <Volume2 className="w-4 h-4" />
            ) : (
              <VolumeX className="w-4 h-4" />
            )}
            <span>{soundActive ? 'Som Ativo' : 'Mudo'}</span>
          </button>

          <button
            type="button"
            onClick={toggleTvMode}
            className={`min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 border transition-colors ${
              isTvMode
                ? 'bg-red-600 hover:bg-red-700 text-white border-red-500'
                : 'bg-stone-900 hover:bg-stone-800 text-white border-stone-900'
            }`}
          >
            {isTvMode ? (
              <>
                <Minimize2 className="w-4 h-4" />
                <span>Sair do Modo TV</span>
              </>
            ) : (
              <>
                <Monitor className="w-4 h-4" />
                <span>Modo TV</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => fetchKdsQueue()}
            disabled={isRefreshing}
            className={`min-h-[44px] px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 border ${
              isTvMode
                ? 'bg-stone-800 text-stone-200 border-stone-700 hover:bg-stone-700'
                : 'bg-stone-100 text-stone-800 border-stone-200 hover:bg-stone-200'
            }`}
            aria-label="Atualizar KDS"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Visão de Capacidade e Carga por Estação (Etapa 3B — Seção 23) */}
      {metrics.stationLoads && metrics.stationLoads.length > 0 && (
        <div
          className={`rounded-2xl p-4 border ${
            isTvMode
              ? 'bg-stone-900 border-stone-800 text-stone-100'
              : 'bg-white border-stone-200 text-stone-900'
          }`}
        >
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <ChefHat className="w-4 h-4 text-amber-500" />
              <h2 className="font-heading font-bold text-sm">
                Estações de Produção • Capacidade e Fila em Tempo Real
              </h2>
            </div>
            <span className="text-xs opacity-70">
              Toque em uma estação para abrir o KDS dedicado do setor
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {metrics.stationLoads.map((st) => {
              const isSaturated = st.saturationState === 'saturated';
              const isWarning = st.saturationState === 'warning';

              return (
                <Link
                  key={st.stationId}
                  href={`/admin/kds/${st.stationSlug}${isTvMode ? '?mode=tv' : ''}`}
                  className={`p-3.5 rounded-xl border flex flex-col justify-between gap-2 transition-all hover:shadow-sm ${
                    isSaturated
                      ? 'bg-red-500/10 border-red-500 text-red-950 dark:text-red-200'
                      : isWarning
                      ? 'bg-amber-500/10 border-amber-400'
                      : isTvMode
                      ? 'bg-stone-800/80 border-stone-700 hover:border-amber-500/50'
                      : 'bg-stone-50 border-stone-200 hover:border-amber-500'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-heading font-black text-sm flex items-center gap-1.5">
                        <span>{st.stationName}</span>
                        <ExternalLink className="w-3.5 h-3.5 opacity-60" />
                      </div>
                      <span className="text-[11px] opacity-70">
                        Capacidade simultânea: {st.inUseUnits}/{st.defaultCapacity} slots
                      </span>
                    </div>

                    <span
                      className={`px-2 py-0.5 rounded-md text-[11px] font-black uppercase ${
                        isSaturated
                          ? 'bg-red-600 text-white'
                          : isWarning
                          ? 'bg-amber-500 text-stone-950'
                          : 'bg-emerald-600/15 text-emerald-700 border border-emerald-600/30'
                      }`}
                    >
                      {st.saturationLabel}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-1 text-xs border-t border-stone-400/20">
                    <div>
                      <span className="opacity-60 block text-[10px]">Em Execução</span>
                      <span className="font-black">{st.preparingStepsCount}</span>
                    </div>
                    <div>
                      <span className="opacity-60 block text-[10px]">Na Fila</span>
                      <span className="font-black">{st.pendingStepsCount}</span>
                    </div>
                    <div>
                      <span className="opacity-60 block text-[10px]">Espera Est.</span>
                      <span className="font-black">
                        {st.estimatedQueueWaitMin > 0
                          ? `~${st.estimatedQueueWaitMin}m`
                          : 'Livre'}
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Painel Simples de Gargalos (Itens com maior tempo médio de preparo) */}
      {showBottlenecks && (
        <div
          className={`rounded-2xl p-4 border ${
            isTvMode
              ? 'bg-stone-900 border-stone-800 text-stone-100'
              : 'bg-white border-stone-200 text-stone-900'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-amber-500" />
              <h2 className="font-heading font-bold text-sm">
                Controle de Gargalos • Itens com Maior Tempo Médio de Preparo Hoje
              </h2>
            </div>
            <span className="text-xs opacity-60">
              Amostra mínima: {metrics.bottlenecks.minSampleRequired} preparos concluídos
            </span>
          </div>

          {!metrics.bottlenecks.hasSufficientData ? (
            <div className="py-3 px-4 rounded-xl bg-stone-500/10 text-xs font-semibold">
              {metrics.bottlenecks.message} — aguarde mais itens concluídos hoje para análise estatística confiável.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              {metrics.bottlenecks.items.map((item) => (
                <div
                  key={item.productName}
                  className={`p-3 rounded-xl border ${
                    isTvMode
                      ? 'bg-stone-800 border-stone-700'
                      : 'bg-stone-50 border-stone-200'
                  }`}
                >
                  <div className="font-bold text-xs truncate">{item.productName}</div>
                  <div className="flex items-baseline justify-between mt-1">
                    <span className="text-lg font-black text-amber-600">
                      {item.avgPrepMinutes} min
                    </span>
                    <span className="text-[11px] opacity-70">
                      ({item.sampleCount} concl. • máx {item.maxPrepMinutes}m)
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Feedback de erro de ação se ocorrer */}
      {actionFeedback && (
        <div className="p-3.5 rounded-xl bg-red-600 text-white text-xs font-bold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertOctagon className="w-4 h-4 shrink-0" />
            <span>{actionFeedback}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionFeedback(null)}
            className="underline font-black"
          >
            Fechar
          </button>
        </div>
      )}

      {/* Grade Principal de 3 Estágios do KDS: Confirmados | Em Preparo | Prontos */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
        {/* Coluna 1: Confirmados */}
        <section
          aria-label="Pedidos Confirmados"
          className={`rounded-2xl p-4 border space-y-4 ${
            isTvMode
              ? 'bg-stone-900/90 border-stone-800'
              : 'bg-stone-200/60 border-stone-300/80'
          }`}
        >
          <div className="flex items-center justify-between pb-2 border-b border-stone-400/20">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-amber-500"></span>
              <h2 className="font-heading font-black text-base uppercase tracking-wide">
                1. Confirmados (Fila)
              </h2>
            </div>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-amber-500 text-stone-950">
              {columns.confirmed.length}
            </span>
          </div>

          <div className="space-y-4 min-h-[320px]">
            {columns.confirmed.length === 0 ? (
              <div className="py-16 text-center text-xs opacity-50 font-medium">
                Nenhum pedido aguardando início de preparo
              </div>
            ) : (
              columns.confirmed.map((order) => (
                <KdsOrderCard
                  key={order.id}
                  order={order}
                  tvMode={isTvMode}
                  onStartPreparation={handleStartPreparation}
                  onToggleItemStatus={handleToggleItemStatus}
                  onCompletePreparation={handleCompletePreparation}
                  onExitFromReady={handleExitFromReady}
                />
              ))
            )}
          </div>
        </section>

        {/* Coluna 2: Em Preparo */}
        <section
          aria-label="Pedidos Em Preparo"
          className={`rounded-2xl p-4 border space-y-4 ${
            isTvMode
              ? 'bg-stone-900/90 border-stone-800'
              : 'bg-stone-200/60 border-stone-300/80'
          }`}
        >
          <div className="flex items-center justify-between pb-2 border-b border-stone-400/20">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-purple-500"></span>
              <h2 className="font-heading font-black text-base uppercase tracking-wide">
                2. Em Preparo (Fogão / Bancada)
              </h2>
            </div>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-purple-600 text-white">
              {columns.preparing.length}
            </span>
          </div>

          <div className="space-y-4 min-h-[320px]">
            {columns.preparing.length === 0 ? (
              <div className="py-16 text-center text-xs opacity-50 font-medium">
                Nenhum pedido em preparo no momento
              </div>
            ) : (
              columns.preparing.map((order) => (
                <KdsOrderCard
                  key={order.id}
                  order={order}
                  tvMode={isTvMode}
                  onStartPreparation={handleStartPreparation}
                  onToggleItemStatus={handleToggleItemStatus}
                  onCompletePreparation={handleCompletePreparation}
                  onExitFromReady={handleExitFromReady}
                />
              ))
            )}
          </div>
        </section>

        {/* Coluna 3: Prontos */}
        <section
          aria-label="Pedidos Prontos"
          className={`rounded-2xl p-4 border space-y-4 ${
            isTvMode
              ? 'bg-stone-900/90 border-stone-800'
              : 'bg-stone-200/60 border-stone-300/80'
          }`}
        >
          <div className="flex items-center justify-between pb-2 border-b border-stone-400/20">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-emerald-500"></span>
              <h2 className="font-heading font-black text-base uppercase tracking-wide">
                3. Prontos (Expedição)
              </h2>
            </div>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-emerald-600 text-white">
              {columns.ready.length}
            </span>
          </div>

          <div className="space-y-4 min-h-[320px]">
            {columns.ready.length === 0 ? (
              <div className="py-16 text-center text-xs opacity-50 font-medium">
                Nenhum pedido aguardando expedição
              </div>
            ) : (
              columns.ready.map((order) => (
                <KdsOrderCard
                  key={order.id}
                  order={order}
                  tvMode={isTvMode}
                  onStartPreparation={handleStartPreparation}
                  onToggleItemStatus={handleToggleItemStatus}
                  onCompletePreparation={handleCompletePreparation}
                  onExitFromReady={handleExitFromReady}
                />
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

export default function AdminKdsPage() {
  return (
    <Suspense
      fallback={
        <div className="p-12 text-center text-sm text-stone-500 font-semibold">
          Carregando KDS da cozinha...
        </div>
      }
    >
      <KdsBoardContent />
    </Suspense>
  );
}

