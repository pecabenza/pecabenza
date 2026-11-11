'use client';

import React, { useState } from 'react';
import {
  Flame,
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  Truck,
  Store,
  Loader2,
  ArrowRight,
  ShieldAlert,
  Clock,
  Calendar,
} from 'lucide-react';
import type { KdsStationStepCardData } from '@/modules/orders/orders.service';
import type { TenantRole } from '@/types/database.types';

interface KdsStationStepCardProps {
  step: KdsStationStepCardData;
  tvMode?: boolean;
  role?: TenantRole;
  onStartStep: (orderId: string, stepId: string) => Promise<void>;
  onCompleteStep: (orderId: string, stepId: string) => Promise<void>;
  onOverrideStep: (
    orderId: string,
    stepId: string,
    overrideAction: 'skip' | 'force_complete',
    reason: string
  ) => Promise<void>;
}

export function KdsStationStepCard({
  step,
  tvMode = false,
  role = 'tenant_manager',
  onStartStep,
  onCompleteStep,
  onOverrideStep,
}: KdsStationStepCardProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const [showOverrideForm, setShowOverrideForm] = useState(false);
  const [overrideAction, setOverrideAction] = useState<'skip' | 'force_complete'>(
    'skip'
  );
  const [overrideReason, setOverrideReason] = useState('');
  const [overrideError, setOverrideError] = useState<string | null>(null);

  const estimatedMin = Math.max(1, Math.round(step.estimatedDurationSeconds / 60));

  const renderSlaBadge = () => {
    if (step.advancedSla.state === 'delayed') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-red-600 text-white font-black text-xs uppercase">
          <AlertOctagon className="w-3.5 h-3.5" />
          <span>Atrasado</span>
        </span>
      );
    }
    if (step.advancedSla.state === 'at_risk') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-amber-500 text-stone-950 font-black text-xs uppercase">
          <AlertTriangle className="w-3.5 h-3.5" />
          <span>Em Risco</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-emerald-600/15 text-emerald-800 border border-emerald-600/30 font-bold text-xs uppercase">
        <CheckCircle2 className="w-3.5 h-3.5" />
        <span>No Prazo</span>
      </span>
    );
  };

  const handleStart = async () => {
    if (busy) return;
    setBusy('start');
    try {
      await onStartStep(step.orderId, step.stepId);
    } finally {
      setBusy(null);
    }
  };

  const handleComplete = async () => {
    if (busy) return;
    setBusy('complete');
    try {
      await onCompleteStep(step.orderId, step.stepId);
    } finally {
      setBusy(null);
    }
  };

  const handleOverrideSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setOverrideError(null);
    const trimmed = overrideReason.trim();
    if (trimmed.length < 3) {
      setOverrideError('Informe um motivo obrigatório (mínimo 3 caracteres).');
      return;
    }
    setBusy('override');
    try {
      await onOverrideStep(step.orderId, step.stepId, overrideAction, trimmed);
      setShowOverrideForm(false);
      setOverrideReason('');
    } catch (err: any) {
      setOverrideError(err.message || 'Erro no override.');
    } finally {
      setBusy(null);
    }
  };

  const borderClass =
    step.advancedSla.state === 'delayed'
      ? 'border-2 border-red-500 ring-2 ring-red-500/20'
      : step.advancedSla.state === 'at_risk'
      ? 'border-2 border-amber-400'
      : step.status === 'preparing'
      ? 'border-2 border-purple-500'
      : 'border border-stone-300';

  return (
    <div
      className={`bg-white rounded-2xl shadow-sm flex flex-col justify-between transition-all ${borderClass}`}
    >
      <div className={tvMode ? 'p-5 space-y-3.5' : 'p-4 space-y-3'}>
        {/* Cabeçalho do Pedido + SLA */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`font-heading font-black text-stone-950 ${
                  tvMode ? 'text-2xl' : 'text-xl'
                }`}
              >
                {step.orderNumber}
              </span>
              {renderSlaBadge()}
            </div>
            <span className="text-xs font-bold text-stone-600 block mt-0.5">
              {step.customerDisplayName}
            </span>
          </div>

          <div className="flex flex-col items-end gap-1 shrink-0">
            <span
              className={`px-2 py-0.5 rounded-lg font-black text-[11px] uppercase flex items-center gap-1 ${
                step.fulfillmentType === 'delivery'
                  ? 'bg-blue-100 text-blue-900 border border-blue-300'
                  : 'bg-emerald-100 text-emerald-900 border border-emerald-300'
              }`}
            >
              {step.fulfillmentType === 'delivery' ? (
                <>
                  <Truck className="w-3 h-3" /> Entrega
                </>
              ) : (
                <>
                  <Store className="w-3 h-3" /> Retirada
                </>
              )}
            </span>
            <span className="text-[11px] font-black px-2 py-0.5 rounded bg-stone-900 text-amber-400">
              Etapa {step.stepOrder} de {step.totalStepsForItem}
            </span>
          </div>
        </div>

        {/* Destaque Principal: Produto, Variante e Quantidade */}
        <div className="p-3 rounded-xl bg-stone-100 border border-stone-200">
          <div
            className={`font-heading font-black text-stone-950 leading-tight ${
              tvMode ? 'text-2xl' : 'text-lg'
            }`}
          >
            <span className="text-amber-700 mr-1.5">{step.quantity}x</span>
            {step.productName}
          </div>
          {step.variantName && (
            <div className="text-xs font-bold text-stone-700 mt-0.5">
              Variante: {step.variantName}
            </div>
          )}
        </div>

        {/* Tempos na Fila / Execução / Meta */}
        <div className="grid grid-cols-3 gap-2 text-xs bg-stone-50 p-2.5 rounded-xl border border-stone-200">
          <div>
            <span className="text-stone-500 block text-[10px] uppercase font-bold">
              Tempo na Fila
            </span>
            <span className="font-black text-stone-900">{step.queueElapsedMin} min</span>
          </div>
          <div>
            <span className="text-stone-500 block text-[10px] uppercase font-bold">
              Em Execução
            </span>
            <span className="font-black text-stone-900">
              {step.status === 'preparing' ? `${step.execElapsedMin} min` : '--'}
            </span>
          </div>
          <div>
            <span className="text-stone-500 block text-[10px] uppercase font-bold">
              Meta Etapa
            </span>
            <span className="font-black text-amber-700">{estimatedMin} min</span>
          </div>
        </div>

        {/* Próxima Estação na Sequência */}
        <div className="flex items-center justify-between text-xs px-2.5 py-1.5 rounded-lg bg-stone-100 text-stone-700 font-semibold">
          <span className="flex items-center gap-1.5">
            <ArrowRight className="w-3.5 h-3.5 text-amber-600" />
            {step.nextStationName ? (
              <span>
                Próxima estação: <strong className="text-stone-950">{step.nextStationName}</strong>
              </span>
            ) : (
              <strong className="text-emerald-800">
                Última etapa do item (libera para expedição)
              </strong>
            )}
          </span>
        </div>

        {/* Agendamento se aplicável */}
        {step.scheduleType === 'scheduled' && step.scheduledFor && (
          <div className="p-2 rounded-lg bg-amber-50 border border-amber-300 text-amber-950 text-xs font-bold flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-amber-700 shrink-0" />
            <span>
              Agendado:{' '}
              {new Date(step.scheduledFor).toLocaleTimeString('pt-BR', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </div>
        )}

        {/* Observação de Cozinha */}
        {step.kitchenNotes && (
          <div className="p-2.5 bg-amber-100/90 border-l-4 border-amber-600 rounded-r-xl text-stone-950">
            <span className="text-[10px] font-black uppercase tracking-wider text-amber-900 block">
              ⚠️ Observação de Cozinha:
            </span>
            <p className="font-bold text-xs mt-0.5">{step.kitchenNotes}</p>
          </div>
        )}

        {/* Formulário de Override Administrativo (Exclusivo tenant_admin) */}
        {showOverrideForm && role === 'tenant_admin' && (
          <form
            onSubmit={handleOverrideSubmit}
            className="p-3 rounded-xl bg-red-50 border border-red-300 space-y-2.5 text-xs text-stone-900"
          >
            <div className="font-black text-red-900 flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4" />
              <span>Override Administrativo de Etapa</span>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setOverrideAction('skip')}
                className={`flex-1 py-1.5 px-2 rounded-lg font-bold border ${
                  overrideAction === 'skip'
                    ? 'bg-red-600 text-white border-red-700'
                    : 'bg-white text-stone-700 border-stone-300'
                }`}
              >
                Pular Etapa (Skip)
              </button>
              <button
                type="button"
                onClick={() => setOverrideAction('force_complete')}
                className={`flex-1 py-1.5 px-2 rounded-lg font-bold border ${
                  overrideAction === 'force_complete'
                    ? 'bg-red-600 text-white border-red-700'
                    : 'bg-white text-stone-700 border-stone-300'
                }`}
              >
                Forçar Conclusão
              </button>
            </div>

            <div>
              <label className="block font-bold text-stone-700 mb-1">
                Motivo Obrigatório (registrado em Auditoria):
              </label>
              <input
                type="text"
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                placeholder="Ex: Forno 2 em manutenção, feito na bancada auxiliar"
                className="w-full px-2.5 py-2 rounded-lg border border-stone-300 bg-white text-stone-900 font-medium"
                required
              />
            </div>

            {overrideError && (
              <div className="text-red-700 font-bold">{overrideError}</div>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowOverrideForm(false)}
                className="px-3 py-1.5 rounded-lg bg-stone-200 text-stone-800 font-bold"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={busy !== null}
                className="px-3 py-1.5 rounded-lg bg-red-700 text-white font-black"
              >
                Confirmar Override
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Rodapé Touch-Friendly (>= 48px) */}
      <div className="p-3.5 bg-stone-50 border-t border-stone-200 rounded-b-2xl space-y-2">
        {step.status === 'pending' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleStart}
              disabled={busy !== null}
              className="min-h-[50px] px-4 py-3 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-black text-xs uppercase tracking-wide flex items-center justify-center gap-1.5 shadow-xs active:scale-[0.99] disabled:opacity-50"
            >
              {busy === 'start' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Flame className="w-4 h-4" />
                  <span>Iniciar Etapa</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleComplete}
              disabled={busy !== null}
              className="min-h-[50px] px-4 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase tracking-wide flex items-center justify-center gap-1.5 shadow-xs active:scale-[0.99] disabled:opacity-50"
            >
              {busy === 'complete' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Concluir Direto</span>
                </>
              )}
            </button>
          </div>
        )}

        {step.status === 'preparing' && (
          <button
            type="button"
            onClick={handleComplete}
            disabled={busy !== null}
            className="w-full min-h-[52px] px-4 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm uppercase tracking-wide flex items-center justify-center gap-2 shadow-sm active:scale-[0.99] disabled:opacity-50"
          >
            {busy === 'complete' ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <CheckCircle2 className="w-5 h-5" />
                <span>Concluir Etapa na Estação</span>
              </>
            )}
          </button>
        )}

        {role === 'tenant_admin' && !tvMode && !showOverrideForm && (
          <button
            type="button"
            onClick={() => setShowOverrideForm(true)}
            className="w-full py-1.5 text-[11px] font-bold text-stone-500 hover:text-red-700 flex items-center justify-center gap-1 transition-colors"
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>Override Admin (Pular / Forçar Etapa)</span>
          </button>
        )}
      </div>
    </div>
  );
}

