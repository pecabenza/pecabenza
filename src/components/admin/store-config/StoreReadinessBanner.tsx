'use client';

import React, { useState } from 'react';
import { ShieldCheck, CheckCircle2, AlertTriangle, Lock } from 'lucide-react';
import type { CommercialReadinessResult } from '@/modules/commerce/store-config.engine';
import type { SiteMode } from '@/types/database.types';

interface StoreReadinessBannerProps {
  siteMode: SiteMode;
  readiness: CommercialReadinessResult;
  saving: boolean;
  hasUnsavedChanges: boolean;
  onActivateCommerce: () => void;
  onDeactivateToPrelaunch: () => void;
}

export function StoreReadinessBanner({
  siteMode,
  readiness,
  saving,
  hasUnsavedChanges,
  onActivateCommerce,
  onDeactivateToPrelaunch,
}: StoreReadinessBannerProps) {
  const [confirmingActivation, setConfirmingActivation] = useState(false);

  return (
    <div
      className={`rounded-2xl border p-5 space-y-4 ${
        readiness.canActivate
          ? 'bg-emerald-50/70 border-emerald-200'
          : 'bg-amber-50/70 border-amber-200'
      }`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <ShieldCheck
            className={`w-6 h-6 ${readiness.canActivate ? 'text-emerald-600' : 'text-amber-600'}`}
          />
          <div>
            <h2 className="font-bold text-stone-900 text-base">
              Prontidão Comercial da Loja (
              {siteMode === 'commerce'
                ? 'Vendas Ativas'
                : siteMode === 'prelaunch'
                ? 'Pré-Lançamento'
                : 'Institucional'}
              )
            </h2>
            <p className="text-xs text-stone-600">
              {readiness.canActivate
                ? 'Todos os requisitos obrigatórios estão validados para receber vendas públicas.'
                : 'Resolva os itens pendentes abaixo e salve as configurações antes de ativar vendas online.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {siteMode !== 'commerce' ? (
            <button
              type="button"
              disabled={!readiness.canActivate || saving}
              onClick={() => setConfirmingActivation(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
            >
              {!readiness.canActivate && <Lock className="w-3.5 h-3.5" />}
              Ativar Loja para Vendas (Commerce)
            </button>
          ) : (
            <button
              type="button"
              disabled={saving}
              onClick={onDeactivateToPrelaunch}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-stone-800 text-white text-xs font-bold hover:bg-stone-700"
            >
              Voltar p/ Pré-Lançamento
            </button>
          )}
        </div>
      </div>

      {confirmingActivation && siteMode !== 'commerce' && (
        <div className="p-4 rounded-xl bg-white border border-emerald-300 shadow-sm space-y-3">
          <p className="text-xs font-semibold text-stone-800">
            Confirmar ativação do modo <strong>Commerce</strong>?{' '}
            {hasUnsavedChanges
              ? 'Existem alterações não salvas no formulário — elas serão salvas e validadas no servidor antes da ativação.'
              : 'O servidor revalidará todos os critérios de prontidão antes de abrir vendas públicas.'}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => {
                setConfirmingActivation(false);
                onActivateCommerce();
              }}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 disabled:opacity-50"
            >
              Confirmar e Ativar Vendas
            </button>
            <button
              type="button"
              onClick={() => setConfirmingActivation(false)}
              className="px-3 py-1.5 rounded-lg border border-stone-300 bg-white text-stone-700 text-xs font-semibold hover:bg-stone-50"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {readiness.checks.map((chk) => (
          <div
            key={chk.id}
            className={`p-3 rounded-xl border text-xs flex items-start gap-2 bg-white ${
              chk.passed ? 'border-emerald-200' : 'border-red-200'
            }`}
          >
            {chk.passed ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            )}
            <div>
              <span className="font-bold text-stone-900 block">{chk.label}</span>
              <span className="text-stone-500">{chk.message}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

