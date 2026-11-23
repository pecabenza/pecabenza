'use client';

import React from 'react';
import { Printer, Image as ImageIcon, FileText } from 'lucide-react';
import {
  DEFAULT_PRINT_SETTINGS,
  type PrintPaperWidthOption,
  type StructuredBusinessHours,
} from '@/modules/commerce/store-config.engine';

interface StorePrintTabProps {
  businessHours: StructuredBusinessHours;
  logoUrl?: string | null;
  tenantName?: string;
  onChangeBusinessHours: (next: StructuredBusinessHours) => void;
}

const PAPER_OPTIONS: Array<{ value: PrintPaperWidthOption; label: string; hint: string }> = [
  { value: '58mm', label: 'Bobina 58mm', hint: 'Área útil ~52mm' },
  { value: '70mm', label: 'Bobina 70mm', hint: 'Área útil ~66mm' },
  { value: '75mm', label: 'Bobina 75mm', hint: 'Área útil ~70mm' },
  { value: '80mm', label: 'Bobina 80mm', hint: 'Área útil ~72mm' },
];

export function StorePrintTab({
  businessHours,
  logoUrl,
  tenantName = 'BENZA',
  onChangeBusinessHours,
}: StorePrintTabProps) {
  const printSettings = businessHours.print_settings || DEFAULT_PRINT_SETTINGS;

  const updatePrint = (patch: Partial<typeof printSettings>) => {
    onChangeBusinessHours({
      ...businessHours,
      print_settings: {
        ...printSettings,
        ...patch,
      },
    });
  };

  return (
    <div className="bg-white rounded-xl border border-stone-200 shadow-sm p-5 space-y-6">
      <div className="border-b border-stone-100 pb-3">
        <h3 className="font-bold text-stone-900 flex items-center gap-2">
          <Printer className="w-4 h-4 text-amber-600" />
          Layout & Padrão de Impressão Térmica
        </h3>
        <p className="text-xs text-stone-500 mt-0.5">
          Defina a bobina padrão, exibição da logomarca no topo e a mensagem de rodapé nos cupons de pedido e fechamento.
        </p>
      </div>

      {/* Bobina Padrão */}
      <div className="space-y-2">
        <label className="block text-xs font-bold uppercase text-stone-700">
          Largura de Bobina Padrão
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {PAPER_OPTIONS.map((opt) => {
            const active = printSettings.default_paper_width === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => updatePrint({ default_paper_width: opt.value })}
                className={`p-3 rounded-xl border text-left transition-all ${
                  active
                    ? 'bg-stone-900 text-white border-stone-900 shadow-sm'
                    : 'bg-white text-stone-800 border-stone-200 hover:bg-stone-50'
                }`}
              >
                <span className="block text-xs font-bold">{opt.label}</span>
                <span
                  className={`block text-[11px] mt-0.5 ${
                    active ? 'text-stone-300' : 'text-stone-500'
                  }`}
                >
                  {opt.hint}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Logomarca no topo */}
      <div className="p-4 rounded-xl border border-stone-200 bg-stone-50/70 space-y-3">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={printSettings.show_logo_on_top}
            onChange={(e) => updatePrint({ show_logo_on_top: e.target.checked })}
            className="mt-0.5 rounded border-stone-300 text-amber-600"
          />
          <div>
            <span className="text-sm font-bold text-stone-900 flex items-center gap-1.5">
              <ImageIcon className="w-4 h-4 text-amber-600" />
              Mostrar logomarca no topo no lugar do nome
            </span>
            <span className="block text-xs text-stone-500 mt-0.5">
              Utiliza a logomarca cadastrada em <strong>Identidade &amp; Cores</strong> (ou a logo padrão da loja) em alto contraste para impressão térmica.
            </span>
          </div>
        </label>

        {printSettings.show_logo_on_top && (
          <div className="pt-2 border-t border-stone-200 flex items-center gap-4">
            <div className="p-3 bg-white border border-stone-200 rounded-lg">
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt={tenantName}
                  className="h-10 w-auto max-w-[160px] object-contain brightness-0"
                />
              ) : (
                <span className="text-xs font-bold text-stone-500">{tenantName}</span>
              )}
            </div>
            <span className="text-[11px] text-stone-500">
              Prévia monocromática de como a logomarca aparecerá no cabeçalho da comanda.
            </span>
          </div>
        )}
      </div>

      {/* Nota de Rodapé */}
      <div className="space-y-1.5">
        <label className="text-xs font-bold uppercase text-stone-700 flex items-center gap-1.5">
          <FileText className="w-3.5 h-3.5 text-amber-600" />
          <span>Nota de Rodapé do Cupom</span>
        </label>
        <input
          type="text"
          maxLength={200}
          value={printSettings.footer_note}
          onChange={(e) => updatePrint({ footer_note: e.target.value })}
          placeholder="Não é documento fiscal"
          className="w-full px-3.5 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:border-stone-800"
        />
        <p className="text-[11px] text-stone-500">
          Exibida no final de todos os cupons impressos (ex.: &ldquo;Não é documento fiscal&rdquo;).
        </p>
      </div>
    </div>
  );
}

