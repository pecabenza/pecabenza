'use client';

import React, { useState } from 'react';
import {
  Clock,
  Flame,
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  Truck,
  Store,
  CheckSquare,
  Square,
  Loader2,
  Calendar,
  PackageCheck,
  Sparkles,
} from 'lucide-react';
import type { KdsOrderCardData } from '@/modules/orders/kds.engine';
import type { ItemPreparationStatus } from '@/types/database.types';
import type { CanonicalOrderStatus } from '@/modules/orders/order-status.machine';

interface KdsOrderCardProps {
  order: KdsOrderCardData;
  tvMode?: boolean;
  onStartPreparation: (orderId: string) => Promise<void>;
  onToggleItemStatus: (
    orderId: string,
    orderItemId: string,
    nextStatus: ItemPreparationStatus
  ) => Promise<void>;
  onCompletePreparation: (orderId: string) => Promise<void>;
  onExitFromReady: (orderId: string, nextStatus: CanonicalOrderStatus) => Promise<void>;
}

export function KdsOrderCard({
  order,
  tvMode = false,
  onStartPreparation,
  onToggleItemStatus,
  onCompletePreparation,
  onExitFromReady,
}: KdsOrderCardProps) {
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const formatTimeHm = (iso: string | null | undefined) => {
    if (!iso) return '--:--';
    return new Date(iso).toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Badge acessível de SLA (Cor + Ícone + Texto explícito + SLA preditivo Etapa 3B)
  const renderSlaBadge = () => {
    const advState = order.advancedSla?.state;

    if (order.sla.state === 'delayed' || advState === 'delayed') {
      return (
        <span
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-600 text-white font-black text-xs uppercase tracking-wide shadow-xs"
          role="status"
          aria-label="SLA Atrasado"
        >
          <AlertOctagon className="w-4 h-4 shrink-0" />
          <span>Atrasado ({order.sla.elapsedMin}m)</span>
        </span>
      );
    }

    if (order.sla.state === 'warning' || advState === 'at_risk') {
      return (
        <span
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500 text-stone-950 font-black text-xs uppercase tracking-wide shadow-xs"
          role="status"
          aria-label="SLA Em Risco"
        >
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>
            {order.advancedSla?.isPredictedToDelay
              ? `Em Risco (+${order.advancedSla.predictedDelayMin}m prev.)`
              : `Atenção (${order.sla.elapsedMin}m)`}
          </span>
        </span>
      );
    }

    return (
      <span
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-600/15 text-emerald-800 border border-emerald-600/30 font-bold text-xs uppercase tracking-wide"
        role="status"
        aria-label="SLA No Prazo"
      >
        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
        <span>No Prazo ({order.sla.elapsedMin}m)</span>
      </span>
    );
  };

  const renderPriorityBadge = () => {
    if (order.priority.isScheduledFutureHold) {
      return (
        <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-stone-200 text-stone-700">
          Programado
        </span>
      );
    }
    if (order.priority.level === 'critical') {
      return (
        <span className="text-[11px] font-black px-2 py-0.5 rounded bg-red-100 text-red-900 border border-red-300">
          Prioridade Máxima
        </span>
      );
    }
    if (order.priority.level === 'high') {
      return (
        <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300">
          Alta Prioridade
        </span>
      );
    }
    return null;
  };

  const handleStartPrep = async () => {
    if (busyAction) return;
    setBusyAction('start');
    try {
      await onStartPreparation(order.id);
    } finally {
      setBusyAction(null);
    }
  };

  const handleItemTap = async (orderItemId: string, currentStatus: ItemPreparationStatus) => {
    if (busyAction || order.status !== 'preparing') return;
    const nextStatus: ItemPreparationStatus =
      currentStatus === 'ready' ? 'preparing' : 'ready';
    setBusyAction(`item:${orderItemId}`);
    try {
      await onToggleItemStatus(order.id, orderItemId, nextStatus);
    } finally {
      setBusyAction(null);
    }
  };

  const handleCompletePrep = async () => {
    if (busyAction || !order.allItemsReady) return;
    setBusyAction('complete');
    try {
      await onCompletePreparation(order.id);
    } finally {
      setBusyAction(null);
    }
  };

  const handleReadyExit = async () => {
    if (busyAction) return;
    const nextStatus: CanonicalOrderStatus =
      order.fulfillmentType === 'pickup' || order.fulfillmentType === 'dine_in'
        ? 'delivered'
        : 'out_for_delivery';
    setBusyAction('exit');
    try {
      await onExitFromReady(order.id, nextStatus);
    } finally {
      setBusyAction(null);
    }
  };

  const cardBorderStyle =
    order.sla.state === 'delayed'
      ? 'border-2 border-red-500 ring-2 ring-red-500/20'
      : order.sla.state === 'warning'
      ? 'border-2 border-amber-400'
      : order.allItemsReady && order.status === 'preparing'
      ? 'border-2 border-emerald-500 ring-2 ring-emerald-500/20'
      : 'border border-stone-300';

  return (
    <div
      className={`bg-white rounded-2xl shadow-sm flex flex-col justify-between transition-all ${cardBorderStyle}`}
    >
      {/* Cabeçalho de Cozinha */}
      <div className={tvMode ? 'p-5 space-y-3.5' : 'p-4 space-y-3'}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`font-heading font-black tracking-tight text-stone-950 ${
                  tvMode ? 'text-3xl' : 'text-2xl'
                }`}
              >
                {order.orderNumber}
              </span>
              {renderSlaBadge()}
            </div>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="text-sm font-bold text-stone-700">
                {order.customerDisplayName}
              </span>
              {renderPriorityBadge()}
            </div>
          </div>

          {/* Modalidade e Status de Pagamento */}
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            <span
              className={`px-2.5 py-1 rounded-lg font-black text-xs uppercase flex items-center gap-1.5 ${
                order.fulfillmentType === 'delivery'
                  ? 'bg-blue-100 text-blue-900 border border-blue-300'
                  : order.fulfillmentType === 'dine_in'
                  ? 'bg-purple-100 text-purple-900 border border-purple-300'
                  : 'bg-emerald-100 text-emerald-900 border border-emerald-300'
              }`}
            >
              {order.fulfillmentType === 'delivery' ? (
                <>
                  <Truck className="w-3.5 h-3.5" /> Entrega
                </>
              ) : order.fulfillmentType === 'dine_in' ? (
                <>
                  <Store className="w-3.5 h-3.5" /> No Local
                </>
              ) : (
                <>
                  <Store className="w-3.5 h-3.5" /> Retirada
                </>
              )}
            </span>

            <span
              className={`text-[11px] font-bold px-2 py-0.5 rounded ${
                order.paymentStatus === 'paid'
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : 'bg-amber-50 text-amber-800 border border-amber-200'
              }`}
            >
              {order.paymentStatus === 'paid' ? 'Pago' : 'Pgto Pendente'}
            </span>
          </div>
        </div>

        {/* Tempos Operacionais, Promessa e Caminho Crítico Multiestação */}
        <div className="grid grid-cols-2 gap-2 bg-stone-100 rounded-xl p-2.5 text-xs">
          <div>
            <span className="text-stone-500 block font-medium">Confirmado há:</span>
            <span className="font-black text-stone-900 text-sm">
              {order.confirmedElapsedMin} min
            </span>
          </div>
          <div>
            <span className="text-stone-500 block font-medium">
              {order.status === 'preparing'
                ? 'Previsão conclusão:'
                : order.status === 'ready'
                ? 'Preparado em:'
                : 'Horário prometido:'}
            </span>
            <span className="font-black text-stone-900 text-sm">
              {order.status === 'confirmed'
                ? formatTimeHm(order.promisedTimeAt)
                : order.status === 'preparing' && order.criticalPath
                ? `${formatTimeHm(order.criticalPath.estimatedOrderReadyAt)} (~${order.criticalPath.criticalPathDurationMin}m)`
                : `${order.prepElapsedMin} min`}
            </span>
          </div>
        </div>

        {/* Gargalo de Estação / Caminho Crítico quando em preparo */}
        {order.status !== 'ready' && order.criticalPath?.bottleneckStationName && (
          <div className="px-2.5 py-1.5 rounded-lg bg-stone-100 border border-stone-200 flex items-center justify-between text-[11px]">
            <span className="text-stone-600 font-semibold">
              Caminho crítico:{' '}
              <strong className="text-stone-900">
                {order.criticalPath.bottleneckStationName}
              </strong>
            </span>
            <span className="font-bold text-stone-700">
              Etapas: {order.criticalPath.completedStepsCount}/{order.criticalPath.totalStepsCount}
            </span>
          </div>
        )}

        {/* Bloco Especial de Pedido Agendado */}
        {order.scheduleType === 'scheduled' && order.scheduledFor && (
          <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 text-xs flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 font-bold">
              <Calendar className="w-4 h-4 text-amber-700 shrink-0" />
              <span>Agendado: {formatTimeHm(order.scheduledFor)}</span>
            </div>
            {order.preparationDueAt && (
              <span className="font-black bg-amber-200/80 px-2 py-0.5 rounded text-amber-950">
                Iniciar às {formatTimeHm(order.preparationDueAt)}
              </span>
            )}
          </div>
        )}

        {/* Observações de Cozinha em Destaque */}
        {order.kitchenNotes && (
          <div className="p-3 bg-amber-100/90 border-l-4 border-amber-600 rounded-r-xl text-stone-950">
            <span className="text-[11px] font-black uppercase tracking-wider text-amber-900 block">
              ⚠️ Observação de Cozinha:
            </span>
            <p className={`font-bold mt-0.5 ${tvMode ? 'text-base' : 'text-sm'}`}>
              {order.kitchenNotes}
            </p>
          </div>
        )}

        {/* Checklist de Itens do Pedido */}
        <div className="space-y-2 pt-1">
          <div className="flex items-center justify-between text-xs font-bold text-stone-600">
            <span>ITENS DO PEDIDO</span>
            <span>
              {order.readyItemsCount}/{order.totalItemsCount} concluídos
            </span>
          </div>

          <div className="space-y-1.5">
            {order.items.map((item) => {
              const isItemReady = item.preparationStatus === 'ready';
              const isItemBusy = busyAction === `item:${item.orderItemId}`;
              const isInteractive = order.status === 'preparing';

              return (
                <button
                  key={item.orderItemId}
                  type="button"
                  disabled={!isInteractive || isItemBusy}
                  onClick={() =>
                    handleItemTap(item.orderItemId, item.preparationStatus)
                  }
                  className={`w-full min-h-[48px] px-3 py-2.5 rounded-xl border text-left flex items-center justify-between gap-3 transition-all ${
                    isItemReady
                      ? 'bg-emerald-50/90 border-emerald-300 text-emerald-950'
                      : 'bg-stone-50 border-stone-200 text-stone-950 hover:bg-stone-100'
                  } ${isInteractive ? 'cursor-pointer active:scale-[0.99]' : 'cursor-default'}`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {isItemBusy ? (
                      <Loader2 className="w-5 h-5 animate-spin text-amber-600 shrink-0" />
                    ) : isItemReady ? (
                      <CheckSquare className="w-5 h-5 text-emerald-600 shrink-0" />
                    ) : (
                      <Square className="w-5 h-5 text-stone-400 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <div
                        className={`font-bold leading-snug ${
                          tvMode ? 'text-lg' : 'text-sm'
                        } ${isItemReady ? 'line-through opacity-75' : ''}`}
                      >
                        <span className="font-black mr-1.5">{item.quantity}x</span>
                        {item.productName}
                      </div>
                      {item.variantName && (
                        <div className="text-xs text-stone-600 font-medium">
                          {item.variantName}
                        </div>
                      )}
                      {item.currentStationName && !isItemReady && (
                        <div className="text-[11px] text-amber-800 font-bold mt-0.5">
                          Estação: {item.currentStationName}
                          {item.steps && item.steps.length > 1
                            ? ` (Etapa ${item.currentStepOrder || 1}/${item.steps.length})`
                            : ''}
                          {item.nextStationName ? ` → ${item.nextStationName}` : ''}
                        </div>
                      )}
                    </div>
                  </div>

                  <span
                    className={`text-[11px] font-bold px-2 py-0.5 rounded shrink-0 ${
                      isItemReady
                        ? 'bg-emerald-200/70 text-emerald-900'
                        : item.preparationStatus === 'preparing'
                        ? 'bg-amber-100 text-amber-900'
                        : 'bg-stone-200 text-stone-700'
                    }`}
                  >
                    {isItemReady
                      ? 'Pronto'
                      : item.preparationStatus === 'preparing'
                      ? 'Preparando'
                      : 'Pendente'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Rodapé de Ação Touch-Friendly (Alvos >= 48px) */}
      <div className="p-3.5 bg-stone-50 border-t border-stone-200 rounded-b-2xl">
        {order.status === 'confirmed' && (
          <button
            type="button"
            onClick={handleStartPrep}
            disabled={busyAction !== null}
            className="w-full min-h-[50px] px-4 py-3 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-black text-sm uppercase tracking-wide flex items-center justify-center gap-2 shadow-sm active:scale-[0.99] disabled:opacity-50 transition-all"
          >
            {busyAction === 'start' ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <Flame className="w-5 h-5" />
                <span>Iniciar Preparo</span>
              </>
            )}
          </button>
        )}

        {order.status === 'preparing' && (
          <button
            type="button"
            onClick={handleCompletePrep}
            disabled={!order.allItemsReady || busyAction !== null}
            className={`w-full min-h-[52px] px-4 py-3 rounded-xl font-black text-sm uppercase tracking-wide flex items-center justify-center gap-2 transition-all ${
              order.allItemsReady
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-md ring-2 ring-emerald-500/30 active:scale-[0.99]'
                : 'bg-stone-200 text-stone-500 cursor-not-allowed'
            }`}
          >
            {busyAction === 'complete' ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : order.allItemsReady ? (
              <>
                <Sparkles className="w-5 h-5" />
                <span>Pedido Pronto (Confirmar)</span>
              </>
            ) : (
              <span>
                Marque todos os itens ({order.readyItemsCount}/{order.totalItemsCount})
              </span>
            )}
          </button>
        )}

        {order.status === 'ready' && (
          <div className="space-y-2">
            {order.stageTimings.readyWaitingDurationMin !== null && (
              <div className="text-center text-xs text-stone-600 font-semibold">
                Aguardando expedição há {order.stageTimings.readyWaitingDurationMin} min
              </div>
            )}
            <button
              type="button"
              onClick={handleReadyExit}
              disabled={busyAction !== null}
              className="w-full min-h-[48px] px-4 py-2.5 rounded-xl bg-stone-900 hover:bg-stone-800 text-white font-bold text-xs uppercase tracking-wide flex items-center justify-center gap-2 transition-all active:scale-[0.99] disabled:opacity-50"
            >
              {busyAction === 'exit' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : order.fulfillmentType === 'pickup' || order.fulfillmentType === 'dine_in' ? (
                <>
                  <PackageCheck className="w-4 h-4" />
                  <span>
                    {order.fulfillmentType === 'dine_in'
                      ? 'Entregar no Salão (Concluir)'
                      : 'Entregar no Balcão (Concluir)'}
                  </span>
                </>
              ) : (
                <>
                  <Truck className="w-4 h-4" />
                  <span>Expedir para Entrega (Retirar do KDS)</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

