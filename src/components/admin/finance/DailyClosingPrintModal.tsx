'use client';

import React, { useEffect, useState } from 'react';
import { X, Printer, Calendar } from 'lucide-react';
import { formatBrl } from '@/modules/cart/cart.utils';
import type { ThermalPaperWidth } from '@/components/admin/orders/OrderPrintModal';

const PAPER_WIDTH_STORAGE_KEY = 'benza_print_paper_width';

const PRINTABLE_WIDTH_MAP: Record<ThermalPaperWidth, string> = {
  '58mm': '52mm',
  '70mm': '66mm',
  '75mm': '70mm',
  '80mm': '72mm',
};

export interface DailyClosingSummary {
  date: string;
  tenantName: string;
  ordersCount: number;
  paidOrdersCount: number;
  pendingOrdersCount: number;
  totalItemsQuantity: number;
  totalSalesCents: number;
  paidSalesCents: number;
  pendingSalesCents: number;
  deliveryFeesCents: number;
  discountsCents: number;
  expensesPaidCents: number;
  expensesPendingCents: number;
  netCashDayCents: number;
  byPaymentMethod: Array<{
    method: string;
    label: string;
    count: number;
    totalCents: number;
    paidCents: number;
  }>;
  byProduct: Array<{
    productName: string;
    variantName: string;
    quantity: number;
    totalCents: number;
  }>;
}

interface DailyClosingPrintModalProps {
  isOpen: boolean;
  initialDate: string;
  onClose: () => void;
}

export function DailyClosingPrintModal({
  isOpen,
  initialDate,
  onClose,
}: DailyClosingPrintModalProps) {
  const [paperWidth, setPaperWidth] = useState<ThermalPaperWidth>('75mm');
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [summary, setSummary] = useState<DailyClosingSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showLogoOnTop, setShowLogoOnTop] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [footerNote, setFooterNote] = useState('Não é documento fiscal');

  useEffect(() => {
    setSelectedDate(initialDate);
  }, [initialDate, isOpen]);

  useEffect(() => {
    let savedWidth: ThermalPaperWidth | null = null;
    try {
      const saved = window.localStorage.getItem(PAPER_WIDTH_STORAGE_KEY) as ThermalPaperWidth | null;
      if (saved === '58mm' || saved === '70mm' || saved === '75mm' || saved === '80mm') {
        savedWidth = saved;
        setPaperWidth(saved);
      }
    } catch {
      // ignora
    }

    if (!isOpen) return;
    let active = true;
    fetch('/api/admin/print-settings', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!active || !data) return;
        if (data.logoUrl) setLogoUrl(data.logoUrl);
        if (data.printSettings) {
          setShowLogoOnTop(Boolean(data.printSettings.show_logo_on_top));
          if (data.printSettings.footer_note) {
            setFooterNote(data.printSettings.footer_note);
          }
          if (!savedWidth && data.printSettings.default_paper_width) {
            setPaperWidth(data.printSettings.default_paper_width);
          }
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !selectedDate) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/admin/finance/daily-closing?date=${encodeURIComponent(selectedDate)}`, {
      cache: 'no-store',
    })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || 'Erro ao carregar fechamento.');
        if (!cancelled) setSummary(json);
      })
      .catch((err: any) => {
        if (!cancelled) setError(err?.message || 'Erro ao carregar fechamento.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, selectedDate]);

  if (!isOpen) return null;

  const handleSelectPaperWidth = (w: ThermalPaperWidth) => {
    setPaperWidth(w);
    try {
      window.localStorage.setItem(PAPER_WIDTH_STORAGE_KEY, w);
    } catch {
      // ignora
    }
  };

  const formattedDateBr = selectedDate.split('-').reverse().join('/');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm print:static print:inset-auto print:block print:p-0 print:bg-white print:backdrop-blur-none">
      <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full max-h-[92vh] flex flex-col overflow-hidden border border-stone-200 print:border-none print:shadow-none print:max-w-none print:max-h-none print:h-auto print:overflow-visible print:block print:w-full print:m-0 print:p-0">
        {/* Barra Superior (Oculta na Impressão) */}
        <div className="px-5 py-4 border-b border-stone-200 bg-stone-50 print:hidden space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Printer className="w-5 h-5 text-stone-800" />
              <div>
                <h3 className="font-heading font-bold text-stone-900 text-sm">
                  Fechamento de Vendas do Dia
                </h3>
                <p className="text-[11px] text-stone-500">
                  Resumo por quantidade de produtos, formas de pagamento e valores
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={loading || !summary}
                onClick={() => window.print()}
                className="flex items-center gap-1.5 px-4 py-2 bg-stone-900 text-white rounded-xl text-xs font-bold hover:bg-stone-800 transition-colors shadow-sm disabled:opacity-50"
              >
                <Printer className="w-4 h-4" />
                Imprimir Agora
              </button>
              <button
                type="button"
                onClick={onClose}
                className="p-2 text-stone-400 hover:text-stone-700 rounded-lg hover:bg-stone-200/60"
                aria-label="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-stone-200/70 text-xs">
            <div className="flex items-center gap-1 bg-stone-200/70 p-1 rounded-lg">
              {(['58mm', '70mm', '75mm', '80mm'] as ThermalPaperWidth[]).map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => handleSelectPaperWidth(w)}
                  className={`px-2.5 py-1 rounded-md font-bold transition-all ${
                    paperWidth === w
                      ? 'bg-stone-900 text-white shadow-xs'
                      : 'text-stone-600 hover:text-stone-900'
                  }`}
                >
                  Bobina {w}
                </button>
              ))}
            </div>

            <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-stone-700">
              <Calendar className="w-3.5 h-3.5 text-stone-500" />
              <span>Data:</span>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="px-2 py-1 rounded-lg border border-stone-300 bg-white text-xs"
              />
            </label>
          </div>
        </div>

        {/* Área de Preview e Impressão Térmica */}
        <div className="p-6 overflow-y-auto bg-stone-100 flex justify-center print:p-0 print:bg-white print:overflow-visible">
          {loading ? (
            <div className="py-12 text-xs text-stone-500">Calculando fechamento do dia...</div>
          ) : error ? (
            <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700">
              {error}
            </div>
          ) : summary ? (
            <div
              id="printable-daily-closing"
              className={`bg-white text-black font-mono border border-stone-300 shadow-sm p-4 print:border-none print:shadow-none ${
                paperWidth === '58mm'
                  ? 'w-[220px] text-[11px]'
                  : paperWidth === '70mm'
                  ? 'w-[264px] text-xs'
                  : paperWidth === '75mm'
                  ? 'w-[282px] text-xs'
                  : 'w-[302px] text-xs'
              }`}
            >
              {/* Cabeçalho */}
              <div className="text-center border-b-2 border-dashed border-black pb-2.5 mb-2.5">
                {showLogoOnTop && logoUrl ? (
                  <div className="flex justify-center mb-1">
                    <img
                      src={logoUrl}
                      alt={summary.tenantName}
                      className="h-10 w-auto max-w-[160px] object-contain brightness-0"
                    />
                  </div>
                ) : (
                  <div className="font-black uppercase tracking-wider text-sm">
                    {summary.tenantName}
                  </div>
                )}
                <div className="font-black text-xs mt-1 uppercase">
                  FECHAMENTO DE VENDAS DO DIA
                </div>
                <div className="text-[11px] font-bold mt-0.5">Data: {formattedDateBr}</div>
              </div>

              {/* Resumo Geral de Pedidos */}
              <div className="border-b border-dashed border-black pb-2.5 mb-2.5 space-y-0.5">
                <div className="font-black uppercase text-[10px] mb-1">RESUMO GERAL:</div>
                <div className="flex justify-between">
                  <span>Pedidos válidos:</span>
                  <span className="font-bold">{summary.ordersCount}</span>
                </div>
                <div className="flex justify-between">
                  <span>Pagos / Pendentes:</span>
                  <span>
                    {summary.paidOrdersCount} / {summary.pendingOrdersCount}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Qtd. total itens:</span>
                  <span className="font-bold">{summary.totalItemsQuantity}</span>
                </div>
                <div className="flex justify-between pt-1 border-t border-dotted border-black font-bold">
                  <span>Recebido (Pago):</span>
                  <span>{formatBrl(summary.paidSalesCents)}</span>
                </div>
                {summary.pendingSalesCents > 0 && (
                  <div className="flex justify-between">
                    <span>A receber (Pend.):</span>
                    <span>{formatBrl(summary.pendingSalesCents)}</span>
                  </div>
                )}
                <div className="flex justify-between font-black text-sm pt-1 border-t border-black">
                  <span>TOTAL VENDIDO:</span>
                  <span>{formatBrl(summary.totalSalesCents)}</span>
                </div>
              </div>

              {/* Por Forma de Pagamento */}
              <div className="border-b border-dashed border-black pb-2.5 mb-2.5 space-y-1">
                <div className="font-black uppercase text-[10px] mb-1">
                  POR FORMA DE PAGAMENTO:
                </div>
                {summary.byPaymentMethod.length === 0 ? (
                  <div className="text-[10px] italic">Nenhuma venda registrada neste dia.</div>
                ) : (
                  summary.byPaymentMethod.map((pm) => (
                    <div key={pm.method} className="flex justify-between gap-1">
                      <span>
                        {pm.label} ({pm.count}x)
                      </span>
                      <span className="font-bold whitespace-nowrap">
                        {formatBrl(pm.totalCents)}
                      </span>
                    </div>
                  ))
                )}
              </div>

              {/* Por Produto (Quantidade e Valor) */}
              <div className="border-b-2 border-dashed border-black pb-2.5 mb-2.5 space-y-1.5">
                <div className="font-black uppercase text-[10px] mb-1">
                  PRODUTOS VENDIDOS ({summary.totalItemsQuantity} un):
                </div>
                {summary.byProduct.length === 0 ? (
                  <div className="text-[10px] italic">Sem itens vendidos nesta data.</div>
                ) : (
                  summary.byProduct.map((prod, idx) => (
                    <div key={idx} className="flex justify-between items-start gap-1">
                      <div>
                        <span className="font-black">{prod.quantity}x </span>
                        <span className="font-bold">{prod.productName}</span>
                        {prod.variantName && (
                          <div className="text-[10px] pl-4">{prod.variantName}</div>
                        )}
                      </div>
                      <span className="font-bold whitespace-nowrap">
                        {formatBrl(prod.totalCents)}
                      </span>
                    </div>
                  ))
                )}
              </div>

              {/* Despesas & Saldo Líquido do Dia */}
              <div className="border-b border-dashed border-black pb-2.5 mb-2.5 space-y-0.5">
                {summary.deliveryFeesCents > 0 && (
                  <div className="flex justify-between">
                    <span>Taxas de entrega:</span>
                    <span>{formatBrl(summary.deliveryFeesCents)}</span>
                  </div>
                )}
                {summary.discountsCents > 0 && (
                  <div className="flex justify-between">
                    <span>Descontos:</span>
                    <span>-{formatBrl(summary.discountsCents)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>Despesas pagas (dia):</span>
                  <span>-{formatBrl(summary.expensesPaidCents)}</span>
                </div>
                <div className="flex justify-between font-black text-sm pt-1 border-t border-black">
                  <span>SALDO LÍQUIDO:</span>
                  <span>{formatBrl(summary.netCashDayCents)}</span>
                </div>
              </div>

              <div className="text-center text-[10px] space-y-0.5">
                <div className="font-bold">{summary.tenantName} • Fechamento</div>
                <div>Impresso em {new Date().toLocaleString('pt-BR')}</div>
                {footerNote && (
                  <div className="font-black uppercase pt-1 border-t border-dotted border-black mt-1">
                    {footerNote}
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>

        <style jsx global>{`
          @media print {
            @page {
              size: ${paperWidth} auto;
              margin: 0mm;
            }
            html,
            body,
            main {
              height: auto !important;
              min-height: 0 !important;
              overflow: visible !important;
              position: static !important;
              margin: 0 !important;
              padding: 0 !important;
              background: #ffffff !important;
            }
            body * {
              visibility: hidden;
            }
            #printable-daily-closing,
            #printable-daily-closing * {
              visibility: visible;
            }
            #printable-daily-closing {
              position: absolute;
              left: 0;
              top: 0;
              box-sizing: border-box;
              width: ${PRINTABLE_WIDTH_MAP[paperWidth]};
              max-width: ${PRINTABLE_WIDTH_MAP[paperWidth]};
              height: auto !important;
              overflow: visible !important;
              margin: 0;
              padding: 1.5mm 2mm;
              font-family: monospace, sans-serif;
              page-break-inside: auto;
            }
          }
        `}</style>
      </div>
    </div>
  );
}

