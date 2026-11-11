'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ChefHat,
  ArrowLeft,
  Monitor,
  Minimize2,
  RefreshCw,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
  AlertOctagon,
  PackageCheck,
  CheckCircle2,
  Clock,
  Lock,
  Sparkles,
} from 'lucide-react';
import type {
  ProductionStation,
  TenantRole,
} from '@/types/database.types';
import type {
  KdsStationStepCardData,
  ExpeditionOrderSummary,
} from '@/modules/orders/orders.service';
import type {
  StationLoadMetrics,
  StationHistoricalPerformance,
} from '@/modules/orders/station-capacity.engine';
import { KdsStationStepCard } from '@/components/admin/kds/KdsStationStepCard';
import {
  isSoundEnabled,
  setSoundEnabled,
  playNewOrderChime,
  checkAndNotifyNewOrders,
} from '@/lib/audio/order-chime';

function StationKdsContent() {
  const params = useParams<{ stationSlug: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const stationSlug = params.stationSlug;
  const isTvMode = searchParams.get('mode') === 'tv';

  const [station, setStation] = useState<ProductionStation | null>(null);
  const [allStations, setAllStations] = useState<ProductionStation[]>([]);
  const [stationLoad, setStationLoad] = useState<StationLoadMetrics | null>(null);
  const [stationPerformance, setStationPerformance] =
    useState<StationHistoricalPerformance | null>(null);
  const [pendingSteps, setPendingSteps] = useState<KdsStationStepCardData[]>([]);
  const [preparingSteps, setPreparingSteps] = useState<KdsStationStepCardData[]>([]);
  const [blockedSteps, setBlockedSteps] = useState<KdsStationStepCardData[]>([]);
  const [expeditionOrders, setExpeditionOrders] = useState<ExpeditionOrderSummary[]>([]);
  const [role, setRole] = useState<TenantRole>('tenant_manager');

  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [connectionState, setConnectionState] = useState<'online' | 'reconnecting'>(
    'online'
  );
  const [soundActive, setSoundActive] = useState(true);
  const [showBlocked, setShowBlocked] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  useEffect(() => {
    setSoundActive(isSoundEnabled());
  }, []);

  const fetchStationQueue = useCallback(
    async (silent = false) => {
      if (!stationSlug) return;
      if (!silent) setIsRefreshing(true);

      try {
        const res = await fetch(`/api/admin/kds/stations/${stationSlug}`, {
          cache: 'no-store',
        });
        if (!res.ok) {
          throw new Error('Falha ao carregar estação do KDS.');
        }

        const data = await res.json();
        const incomingPending: KdsStationStepCardData[] = data.pendingSteps || [];
        const incomingPreparing: KdsStationStepCardData[] = data.preparingSteps || [];

        const activeStepIds = [
          ...incomingPending.map((s) => s.stepId),
          ...incomingPreparing.map((s) => s.stepId),
        ];
        checkAndNotifyNewOrders(activeStepIds, isInitialLoading);

        setStation(data.station || null);
        setAllStations(data.allStations || []);
        setStationLoad(data.stationLoad || null);
        setStationPerformance(data.stationPerformance || null);
        setPendingSteps(incomingPending);
        setPreparingSteps(incomingPreparing);
        setBlockedSteps(data.blockedSteps || []);
        setExpeditionOrders(data.expeditionOrders || []);
        if (data.role) setRole(data.role);
        setConnectionState('online');
      } catch {
        setConnectionState('reconnecting');
      } finally {
        setIsInitialLoading(false);
        setIsRefreshing(false);
      }
    },
    [stationSlug, isInitialLoading]
  );

  useEffect(() => {
    fetchStationQueue();
    const timer = setInterval(() => {
      fetchStationQueue(true);
    }, 5000);
    return () => clearInterval(timer);
  }, [fetchStationQueue]);

  const handleToggleSound = () => {
    const next = !soundActive;
    setSoundActive(next);
    setSoundEnabled(next);
    if (next) playNewOrderChime();
  };

  const toggleTvMode = () => {
    if (isTvMode) {
      router.push(`/admin/kds/${stationSlug}`);
    } else {
      router.push(`/admin/kds/${stationSlug}?mode=tv`);
    }
  };

  const handleStartStep = async (orderId: string, stepId: string) => {
    setActionFeedback(null);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/steps`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start_step', stepId }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Falha ao iniciar etapa.');
      }
      await fetchStationQueue(true);
    } catch (e: any) {
      setActionFeedback(e.message || 'Erro ao iniciar etapa.');
    }
  };

  const handleCompleteStep = async (orderId: string, stepId: string) => {
    setActionFeedback(null);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/steps`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'complete_step', stepId }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Falha ao concluir etapa.');
      }
      await fetchStationQueue(true);
    } catch (e: any) {
      setActionFeedback(e.message || 'Erro ao concluir etapa.');
    }
  };

  const handleOverrideStep = async (
    orderId: string,
    stepId: string,
    overrideAction: 'skip' | 'force_complete',
    reason: string
  ) => {
    setActionFeedback(null);
    const res = await fetch(`/api/admin/orders/${orderId}/steps`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'override_step',
        stepId,
        overrideAction,
        reason,
      }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Falha no override administrativo.');
    }
    await fetchStationQueue(true);
  };

  const handleCompleteOrderFromExpedition = async (orderId: string) => {
    setActionFeedback(null);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/kds`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'complete_preparation' }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Falha ao confirmar pedido pronto.');
      }
      await fetchStationQueue(true);
    } catch (e: any) {
      setActionFeedback(e.message || 'Erro ao liberar pedido.');
    }
  };

  const wrapperClass = isTvMode
    ? 'fixed inset-0 z-50 bg-stone-950 text-stone-100 overflow-y-auto p-4 md:p-6 space-y-5'
    : 'space-y-5 pb-12';

  return (
    <div className={wrapperClass}>
      {/* Barra de Navegação Rápida entre Estações */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href={isTvMode ? '/admin/kds?mode=tv' : '/admin/kds'}
            className={`min-h-[42px] px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 border ${
              isTvMode
                ? 'bg-stone-900 border-stone-700 text-stone-200 hover:bg-stone-800'
                : 'bg-white border-stone-300 text-stone-800 hover:bg-stone-100'
            }`}
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Visão Geral KDS</span>
          </Link>

          {allStations.map((st) => {
            const isActive = st.slug === stationSlug;
            return (
              <Link
                key={st.id}
                href={`/admin/kds/${st.slug}${isTvMode ? '?mode=tv' : ''}`}
                className={`min-h-[42px] px-3.5 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 border transition-colors ${
                  isActive
                    ? 'bg-amber-500 text-stone-950 border-amber-600'
                    : isTvMode
                    ? 'bg-stone-900 border-stone-800 text-stone-400 hover:text-white'
                    : 'bg-white border-stone-200 text-stone-600 hover:text-stone-950'
                }`}
              >
                <ChefHat className="w-3.5 h-3.5" />
                <span>{st.name}</span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Cabeçalho da Estação + Indicadores de Capacidade */}
      <div
        className={`rounded-2xl p-4 border shadow-xs flex flex-col xl:flex-row items-start xl:items-center justify-between gap-4 ${
          isTvMode
            ? 'bg-stone-900 border-stone-800 text-white'
            : 'bg-white border-stone-200 text-stone-900'
        }`}
      >
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-amber-500/15 text-amber-500 flex items-center justify-center shrink-0">
            <ChefHat className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1
                className={`font-heading font-black tracking-tight ${
                  isTvMode ? 'text-2xl text-white' : 'text-xl text-stone-950'
                }`}
              >
                Estação: {station?.name || stationSlug}
              </h1>

              {stationLoad && (
                <span
                  className={`px-2.5 py-0.5 rounded-full text-xs font-black uppercase ${
                    stationLoad.saturationState === 'saturated'
                      ? 'bg-red-600 text-white'
                      : stationLoad.saturationState === 'warning'
                      ? 'bg-amber-500 text-stone-950'
                      : 'bg-emerald-500/20 text-emerald-600 border border-emerald-500/30'
                  }`}
                >
                  {stationLoad.saturationLabel}
                </span>
              )}

              {connectionState === 'online' ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/15 text-emerald-600">
                  <Wifi className="w-3 h-3" /> Ao Vivo
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/20 text-amber-500">
                  <WifiOff className="w-3 h-3" /> Reconectando
                </span>
              )}
            </div>
            <p className="text-xs opacity-70 mt-0.5">
              {station?.description || 'Fila operacional dedicada por estação de produção'}
            </p>
          </div>
        </div>

        {/* Métricas de Capacidade da Estação */}
        {stationLoad && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 w-full xl:w-auto">
            <div
              className={`px-3.5 py-2 rounded-xl border ${
                isTvMode
                  ? 'bg-stone-800 border-stone-700'
                  : 'bg-stone-50 border-stone-200'
              }`}
            >
              <span className="text-[10px] font-bold uppercase opacity-70 block">
                Capacidade em Uso
              </span>
              <span className="text-lg font-black font-heading">
                {stationLoad.inUseUnits} / {stationLoad.defaultCapacity}
              </span>
            </div>

            <div
              className={`px-3.5 py-2 rounded-xl border ${
                isTvMode
                  ? 'bg-stone-800 border-stone-700'
                  : 'bg-stone-50 border-stone-200'
              }`}
            >
              <span className="text-[10px] font-bold uppercase opacity-70 block">
                Fila da Estação
              </span>
              <span className="text-lg font-black font-heading">
                {stationLoad.pendingStepsCount} itens
              </span>
            </div>

            <div
              className={`px-3.5 py-2 rounded-xl border ${
                isTvMode
                  ? 'bg-stone-800 border-stone-700'
                  : 'bg-stone-50 border-stone-200'
              }`}
            >
              <span className="text-[10px] font-bold uppercase opacity-70 block">
                Espera Estimada
              </span>
              <span className="text-lg font-black font-heading">
                {stationLoad.estimatedQueueWaitMin > 0
                  ? `~${stationLoad.estimatedQueueWaitMin} min`
                  : 'Imediato'}
              </span>
            </div>

            <div
              className={`px-3.5 py-2 rounded-xl border ${
                isTvMode
                  ? 'bg-stone-800 border-stone-700'
                  : 'bg-stone-50 border-stone-200'
              }`}
            >
              <span className="text-[10px] font-bold uppercase opacity-70 block">
                Tempo Médio Real
              </span>
              <span className="text-sm font-black font-heading">
                {stationPerformance?.hasSufficientData
                  ? `${stationPerformance.avgExecutionMinutes} min`
                  : 'Dados insuficientes'}
              </span>
            </div>
          </div>
        )}

        {/* Controles */}
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {blockedSteps.length > 0 && (
            <button
              type="button"
              onClick={() => setShowBlocked(!showBlocked)}
              className={`min-h-[44px] px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 border ${
                showBlocked
                  ? 'bg-amber-500 text-stone-950 border-amber-600'
                  : isTvMode
                  ? 'bg-stone-800 text-stone-300 border-stone-700'
                  : 'bg-stone-100 text-stone-700 border-stone-200'
              }`}
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Bloqueadas ({blockedSteps.length})</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleToggleSound}
            className={`min-h-[44px] px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 border ${
              soundActive
                ? 'bg-amber-500/20 text-amber-600 border-amber-500/40'
                : 'bg-stone-100 text-stone-500 border-stone-200'
            }`}
          >
            {soundActive ? (
              <Volume2 className="w-4 h-4" />
            ) : (
              <VolumeX className="w-4 h-4" />
            )}
          </button>

          <button
            type="button"
            onClick={toggleTvMode}
            className={`min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 border ${
              isTvMode
                ? 'bg-red-600 text-white border-red-500'
                : 'bg-stone-900 text-white border-stone-900'
            }`}
          >
            {isTvMode ? (
              <>
                <Minimize2 className="w-4 h-4" /> Sair TV
              </>
            ) : (
              <>
                <Monitor className="w-4 h-4" /> Modo TV
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => fetchStationQueue()}
            disabled={isRefreshing}
            className="min-h-[44px] px-3 py-2 rounded-xl text-xs font-bold border bg-stone-100 text-stone-800 border-stone-200"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {actionFeedback && (
        <div className="p-3.5 rounded-xl bg-red-600 text-white text-xs font-bold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertOctagon className="w-4 h-4" />
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

      {/* Colunas da Estação: 1. Fila da Estação (Pending) | 2. Em Execução na Bancada (Preparing) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        <section
          className={`rounded-2xl p-4 border space-y-4 ${
            isTvMode
              ? 'bg-stone-900/90 border-stone-800'
              : 'bg-stone-200/60 border-stone-300/80'
          }`}
        >
          <div className="flex items-center justify-between pb-2 border-b border-stone-400/20">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-amber-500"></span>
              <h2 className="font-heading font-black text-base uppercase">
                1. Aguardando na Estação (Liberados)
              </h2>
            </div>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-amber-500 text-stone-950">
              {pendingSteps.length}
            </span>
          </div>

          <div className="space-y-4 min-h-[260px]">
            {pendingSteps.length === 0 ? (
              <div className="py-12 text-center text-xs opacity-50 font-medium">
                Nenhuma etapa aguardando início nesta estação
              </div>
            ) : (
              pendingSteps.map((step) => (
                <KdsStationStepCard
                  key={step.stepId}
                  step={step}
                  tvMode={isTvMode}
                  role={role}
                  onStartStep={handleStartStep}
                  onCompleteStep={handleCompleteStep}
                  onOverrideStep={handleOverrideStep}
                />
              ))
            )}
          </div>
        </section>

        <section
          className={`rounded-2xl p-4 border space-y-4 ${
            isTvMode
              ? 'bg-stone-900/90 border-stone-800'
              : 'bg-stone-200/60 border-stone-300/80'
          }`}
        >
          <div className="flex items-center justify-between pb-2 border-b border-stone-400/20">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-purple-500"></span>
              <h2 className="font-heading font-black text-base uppercase">
                2. Em Execução na Estação
              </h2>
            </div>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-purple-600 text-white">
              {preparingSteps.length}
            </span>
          </div>

          <div className="space-y-4 min-h-[260px]">
            {preparingSteps.length === 0 ? (
              <div className="py-12 text-center text-xs opacity-50 font-medium">
                Nenhum item em execução nesta estação agora
              </div>
            ) : (
              preparingSteps.map((step) => (
                <KdsStationStepCard
                  key={step.stepId}
                  step={step}
                  tvMode={isTvMode}
                  role={role}
                  onStartStep={handleStartStep}
                  onCompleteStep={handleCompleteStep}
                  onOverrideStep={handleOverrideStep}
                />
              ))
            )}
          </div>
        </section>
      </div>

      {/* Etapas Bloqueadas (Ocultas por padrão conforme Seção 24, visíveis sob demanda) */}
      {showBlocked && blockedSteps.length > 0 && (
        <section
          className={`rounded-2xl p-4 border space-y-3 ${
            isTvMode
              ? 'bg-stone-900 border-stone-800'
              : 'bg-stone-100 border-stone-300'
          }`}
        >
          <div className="flex items-center gap-2 text-xs font-bold uppercase opacity-75">
            <Lock className="w-4 h-4" />
            <span>
              Etapas Futuras Bloqueadas (Aguardando Estação Anterior — Não Iniciáveis)
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {blockedSteps.map((b) => (
              <div
                key={b.stepId}
                className="p-3 rounded-xl border border-stone-300 bg-white/70 text-stone-700 text-xs flex items-center justify-between"
              >
                <div>
                  <span className="font-black text-stone-900">{b.orderNumber}</span> •{' '}
                  <span className="font-bold">
                    {b.quantity}x {b.productName}
                  </span>
                </div>
                <span className="px-2 py-0.5 rounded bg-stone-200 text-stone-700 font-bold">
                  Etapa {b.stepOrder}/{b.totalStepsForItem} (Bloqueada)
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Visão de Conferência de Expedição (Seção 27) */}
      {(station?.station_type === 'expedition' || stationSlug.includes('expedic')) && (
        <section
          className={`rounded-2xl p-4 border space-y-4 ${
            isTvMode
              ? 'bg-stone-900 border-stone-800'
              : 'bg-white border-stone-200'
          }`}
        >
          <div className="flex items-center justify-between border-b pb-2 border-stone-300/40">
            <div className="flex items-center gap-2">
              <PackageCheck className="w-5 h-5 text-emerald-500" />
              <h2 className="font-heading font-black text-base uppercase">
                Conferência de Expedição • Consolidação de Pedidos
              </h2>
            </div>
            <span className="text-xs opacity-70">
              O pedido só pode ser marcado como Pronto quando todos os itens de todas as estações terminarem
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {expeditionOrders
              .filter((o) => o.status !== 'ready')
              .map((ord) => (
                <div
                  key={ord.orderId}
                  className={`p-4 rounded-xl border flex flex-col justify-between gap-3 ${
                    ord.allItemsReady
                      ? 'bg-emerald-50/70 border-emerald-400 text-stone-900'
                      : 'bg-stone-50 border-stone-200 text-stone-900'
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-heading font-black text-lg">
                        {ord.orderNumber}
                      </span>
                      <span className="text-xs font-bold text-stone-600">
                        {ord.customerDisplayName}
                      </span>
                    </div>

                    {ord.readyItems.length > 0 && (
                      <div className="space-y-1">
                        <span className="text-[10px] font-black uppercase text-emerald-700 block">
                          Itens Concluídos ({ord.readyItems.length}):
                        </span>
                        {ord.readyItems.map((ri) => (
                          <div
                            key={ri.orderItemId}
                            className="text-xs font-bold text-emerald-900 flex items-center gap-1.5"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            <span>
                              {ri.quantity}x {ri.productName}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {ord.missingItems.length > 0 && (
                      <div className="space-y-1 pt-1">
                        <span className="text-[10px] font-black uppercase text-amber-800 block">
                          Aguardando Outras Estações ({ord.missingItems.length}):
                        </span>
                        {ord.missingItems.map((mi) => (
                          <div
                            key={mi.orderItemId}
                            className="text-xs font-semibold text-stone-700 flex items-center justify-between"
                          >
                            <span>
                              {mi.quantity}x {mi.productName}
                            </span>
                            {mi.currentStationName && (
                              <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 text-[10px] font-bold">
                                {mi.currentStationName}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    disabled={!ord.allItemsReady}
                    onClick={() => handleCompleteOrderFromExpedition(ord.orderId)}
                    className={`w-full min-h-[48px] px-3 py-2.5 rounded-xl font-black text-xs uppercase flex items-center justify-center gap-1.5 ${
                      ord.allItemsReady
                        ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs'
                        : 'bg-stone-200 text-stone-500 cursor-not-allowed'
                    }`}
                  >
                    {ord.allItemsReady ? (
                      <>
                        <Sparkles className="w-4 h-4" />
                        <span>Liberar Pedido Pronto</span>
                      </>
                    ) : (
                      <span>Aguardando todas as estações</span>
                    )}
                  </button>
                </div>
              ))}
          </div>
        </section>
      )}
    </div>
  );
}

export default function StationKdsPage() {
  return (
    <Suspense
      fallback={
        <div className="p-12 text-center text-sm text-stone-500 font-semibold">
          Carregando estação do KDS...
        </div>
      }
    >
      <StationKdsContent />
    </Suspense>
  );
}

