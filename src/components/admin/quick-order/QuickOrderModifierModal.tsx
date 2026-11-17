'use client';

import React, { useState, useMemo } from 'react';
import { X, Check, AlertCircle, Plus } from 'lucide-react';
import { formatBrl } from '@/modules/cart/cart.utils';
import { validateAndResolveModifiers } from '@/modules/catalog/modifiers';
import type { CatalogProduct, CatalogVariant } from './types';

interface QuickOrderModifierModalProps {
  product: CatalogProduct;
  variant: CatalogVariant;
  onClose: () => void;
  onConfirm: (payload: {
    selectedModifierOptionIds: string[];
    extraPriceCents: number;
    modifierSummary: string;
  }) => void;
}

export function QuickOrderModifierModal({
  product,
  variant,
  onClose,
  onConfirm,
}: QuickOrderModifierModalProps) {
  const groups = useMemo(() => product.modifierGroups || [], [product.modifierGroups]);
  const [selectedByGroup, setSelectedByGroup] = useState<Record<string, string[]>>({});
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const allSelectedIds = useMemo(
    () => Object.values(selectedByGroup).flat(),
    [selectedByGroup]
  );

  const validation = useMemo(
    () => validateAndResolveModifiers(groups, allSelectedIds),
    [groups, allSelectedIds]
  );

  const handleToggleOption = (groupId: string, optionId: string, maxSelect: number) => {
    setErrorMsg(null);
    setSelectedByGroup((prev) => {
      const current = prev[groupId] || [];
      if (current.includes(optionId)) {
        return {
          ...prev,
          [groupId]: current.filter((id) => id !== optionId),
        };
      }
      if (maxSelect === 1) {
        return {
          ...prev,
          [groupId]: [optionId],
        };
      }
      if (current.length >= maxSelect) {
        return prev;
      }
      return {
        ...prev,
        [groupId]: [...current, optionId],
      };
    });
  };

  const handleConfirm = () => {
    if (!validation.valid) {
      setErrorMsg(validation.error || 'Verifique os complementos obrigatórios.');
      return;
    }
    const summary = validation.selectedSnapshots.map((s) => s.optionName).join(', ');
    onConfirm({
      selectedModifierOptionIds: allSelectedIds,
      extraPriceCents: validation.extraPriceCents,
      modifierSummary: summary,
    });
  };

  const finalUnitPriceCents = variant.price_in_cents + validation.extraPriceCents;

  return (
    <div
      className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modifier-modal-title"
    >
      <div className="bg-white rounded-2xl border border-stone-200 shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-stone-200 flex items-start justify-between gap-3">
          <div>
            <h2 id="modifier-modal-title" className="text-base font-black text-stone-900">
              {product.name} — {variant.name}
            </h2>
            <p className="text-xs text-stone-500 mt-0.5">
              Selecione os complementos do item antes de adicionar à sacola.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-stone-500 hover:bg-stone-100 hover:text-stone-900"
            aria-label="Fechar seleção de complementos"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 sm:p-5 overflow-y-auto space-y-5 flex-1">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {groups.map((grp) => {
            const currentSelected = selectedByGroup[grp.id] || [];
            const minRequired = Math.max(grp.is_required ? 1 : 0, grp.min_selections || 0);
            const maxAllowed = Math.max(1, grp.max_selections || 1);

            return (
              <div key={grp.id} className="space-y-2.5">
                <div className="flex items-center justify-between gap-2 bg-stone-50 px-3 py-2 rounded-xl border border-stone-200">
                  <div>
                    <h3 className="text-xs font-bold text-stone-900">{grp.name}</h3>
                    <p className="text-[11px] text-stone-500">
                      {minRequired > 0
                        ? `Escolha de ${minRequired} até ${maxAllowed}`
                        : `Opcional (máx. ${maxAllowed})`}
                    </p>
                  </div>
                  <span
                    className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                      minRequired > 0
                        ? currentSelected.length >= minRequired
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-amber-100 text-amber-800'
                        : 'bg-stone-200 text-stone-700'
                    }`}
                  >
                    {minRequired > 0 ? 'Obrigatório' : 'Opcional'} ({currentSelected.length}/
                    {maxAllowed})
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-2">
                  {(grp.options || []).map((opt) => {
                    const isChecked = currentSelected.includes(opt.id);
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => handleToggleOption(grp.id, opt.id, maxAllowed)}
                        aria-pressed={isChecked}
                        className={`w-full min-h-[42px] px-3.5 py-2.5 rounded-xl border text-left flex items-center justify-between gap-3 transition-all ${
                          isChecked
                            ? 'bg-emerald-50/80 border-emerald-500 text-stone-900 font-bold'
                            : 'bg-white border-stone-200 text-stone-700 hover:border-stone-300'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <span
                            className={`w-4 h-4 rounded flex items-center justify-center border ${
                              isChecked
                                ? 'bg-emerald-600 border-emerald-600 text-white'
                                : 'border-stone-300 bg-white'
                            }`}
                          >
                            {isChecked && <Check className="w-3 h-3" />}
                          </span>
                          <span className="text-xs">{opt.name}</span>
                        </div>
                        <span className="text-xs font-mono font-semibold text-stone-700">
                          {opt.price_in_cents > 0 ? `+ ${formatBrl(opt.price_in_cents)}` : 'Grátis'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <div className="p-4 sm:p-5 border-t border-stone-200 bg-stone-50 flex items-center justify-between gap-3">
          <div>
            <span className="text-[11px] text-stone-500 block">Valor unitário com adicionais</span>
            <span className="text-base font-black font-mono text-stone-900">
              {formatBrl(finalUnitPriceCents)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[40px] px-4 py-2 rounded-xl border border-stone-300 bg-white text-xs font-bold text-stone-700 hover:bg-stone-100"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              className="min-h-[40px] px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>Adicionar à Sacola</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

