'use client';

import React, { useEffect, useState } from 'react';
import { X, Printer, FileText, Flame } from 'lucide-react';
import { formatBrl } from '@/modules/cart/cart.utils';
import type { OperationalOrder } from '@/modules/orders/orders.service';
import {
  PAYMENT_STATUS_LABELS,
  ORDER_CHANNEL_LABELS,
  PAYMENT_METHOD_LABELS,
} from '@/modules/orders/order-status.machine';

export type ThermalPaperWidth = '58mm' | '70mm' | '80mm';
export type PrintTicketMode = 'full' | 'kitchen' | 'hot_kitchen' | 'assembly' | 'expedition';

const PAPER_WIDTH_STORAGE_KEY = 'benza_print_paper_width';

const PRINTABLE_WIDTH_MAP: Record<ThermalPaperWidth, string> = {
  '58mm': '52mm',
  '70mm': '66mm',
  '80mm': '72mm',
};

interface OrderPrintModalProps {
  order: OperationalOrder | null;
  tenantName: string;
  onClose: () => void;
  defaultPaperWidth?: ThermalPaperWidth;
  defaultMode?: PrintTicketMode;
}

export function OrderPrintModal({
  order,
  tenantName,
  onClose,
  defaultPaperWidth = '80mm',
  defaultMode = 'full',
}: OrderPrintModalProps) {
  const [paperWidth, setPaperWidth] = useState<ThermalPaperWidth>(defaultPaperWidth);
  const [ticketMode, setTicketMode] = useState<PrintTicketMode>(defaultMode);

  useEffect(() => {
    setTicketMode(defaultMode);
  }, [defaultMode, order?.id]);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(PAPER_WIDTH_STORAGE_KEY) as ThermalPaperWidth | null;
      if (saved === '58mm' || saved === '70mm' || saved === '80mm') {
        setPaperWidth(saved);
      }
    } catch {
      // ignora erro de storage
    }
  }, []);

  const handleSelectPaperWidth = (w: ThermalPaperWidth) => {
    setPaperWidth(w);
    try {
      window.localStorage.setItem(PAPER_WIDTH_STORAGE_KEY, w);
    } catch {
      // ignora erro de storage
    }
  };

  if (!order) return null;

  const handlePrint = () => {
    window.print();
  };

  const formattedDate = new Date(order.createdAt).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const formattedTime = new Date(order.createdAt).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const channelLabel = ORDER_CHANNEL_LABELS[order.orderChannel || 'website'] || 'Site';
  const paymentMethodLabel = PAYMENT_METHOD_LABELS[order.paymentMethod || 'pix'] || 'Pix';
  const fulfillmentLabel =
    order.fulfillmentType === 'delivery'
      ? 'ENTREGA'
      : order.fulfillmentType === 'dine_in'
      ? 'CONSUMO NO LOCAL'
      : 'RETIRADA NO BALCÃO';

  const stationBannerMap: Record<PrintTicketMode, string | null> = {
    full: null,
    kitchen: 'COMANDA GERAL DE COZINHA',
    hot_kitchen: 'ESTAÇÃO: COZINHA QUENTE',
    assembly: 'ESTAÇÃO: MONTAGEM & FINALIZAÇÃO',
    expedition: 'ESTAÇÃO: EXPEDIÇÃO / CONFERÊNCIA',
  };

  const isKitchenSlip = ticketMode !== 'full' && ticketMode !== 'expedition';
  const changeAmountCents =
    order.paymentMethod === 'cash' &&
    order.cashChangeForCents &&
    order.cashChangeForCents > order.totalCents
      ? order.cashChangeForCents - order.totalCents
      : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in print:static print:inset-auto print:block print:p-0 print:bg-white print:backdrop-blur-none">
      <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full max-h-[92vh] flex flex-col overflow-hidden border border-stone-200 print:border-none print:shadow-none print:max-w-none print:max-h-none print:h-auto print:overflow-visible print:block print:w-full print:m-0 print:p-0">
        {/* Barra Superior de Configuração de Impressão (Oculta no @media print) */}
        <div className="px-5 py-4 border-b border-stone-200 bg-stone-50 print:hidden space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Printer className="w-5 h-5 text-stone-800" />
              <div>
                <h3 className="font-heading font-bold text-stone-900 text-sm">
                  Impressão Térmica de Comanda ({order.orderNumber})
                </h3>
                <p className="text-[11px] text-stone-500">
                  Selecione largura da bobina (58mm/70mm/80mm) e tipo de via
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handlePrint}
                className="flex items-center gap-1.5 px-4 py-2 bg-stone-900 text-white rounded-xl text-xs font-bold hover:bg-stone-800 transition-colors shadow-sm"
              >
                <Printer className="w-4 h-4" />
                Imprimir Agora
              </button>
              <button
                onClick={onClose}
                className="p-2 text-stone-400 hover:text-stone-700 rounded-lg hover:bg-stone-200/60 transition-colors"
                aria-label="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Seletores de Largura (58mm / 70mm / 80mm) e Modo de Comanda */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-stone-200/70 text-xs">
            <div className="flex items-center gap-1 bg-stone-200/70 p-1 rounded-lg">
              {(['58mm', '70mm', '80mm'] as ThermalPaperWidth[]).map((w) => (
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

            <div className="flex items-center gap-1 flex-wrap">
              {[
                { id: 'full', label: 'Completa (Cliente)', icon: FileText },
                { id: 'kitchen', label: 'Cozinha Geral', icon: Flame },
                { id: 'hot_kitchen', label: 'Cozinha Quente', icon: Flame },
                { id: 'assembly', label: 'Montagem', icon: Flame },
                { id: 'expedition', label: 'Expedição', icon: FileText },
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setTicketMode(m.id as PrintTicketMode)}
                  className={`px-2.5 py-1 rounded-lg font-semibold border transition-all ${
                    ticketMode === m.id
                      ? 'bg-amber-600 text-white border-amber-600'
                      : 'bg-white text-stone-700 border-stone-200 hover:bg-stone-100'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Preview e Área Imprimível */}
        <div className="p-6 overflow-y-auto bg-stone-100 flex justify-center print:p-0 print:bg-white print:overflow-visible">
          <div
            id="printable-ticket"
            className={`bg-white text-black font-mono border border-stone-300 shadow-sm p-4 print:border-none print:shadow-none ${
              paperWidth === '58mm'
                ? 'w-[220px] text-[11px]'
                : paperWidth === '70mm'
                ? 'w-[264px] text-xs'
                : 'w-[302px] text-xs'
            }`}
          >
            {/* Cabeçalho da Comanda */}
            <div className="text-center border-b-2 border-dashed border-black pb-3 mb-3">
              <div className="font-black uppercase tracking-wider text-sm">{tenantName}</div>
              {stationBannerMap[ticketMode] && (
                <div className="mt-1 px-2 py-0.5 bg-black text-white font-black text-[10px] uppercase">
                  {stationBannerMap[ticketMode]}
                </div>
              )}
              <div className="text-2xl font-black mt-1 tracking-tight">{order.orderNumber}</div>
              <div className="text-[10px] mt-0.5">
                {formattedDate} às {formattedTime} • Canal: <strong>{channelLabel.toUpperCase()}</strong>
              </div>
              <div className="mt-1.5 inline-block px-2 py-0.5 border border-black font-black text-[11px] uppercase">
                {fulfillmentLabel}
              </div>
              {order.scheduleType === 'scheduled' && order.scheduledFor && (
                <div className="mt-1.5 font-black text-[11px] border border-black px-1.5 py-0.5">
                  AGENDADO: {new Date(order.scheduledFor).toLocaleString('pt-BR')}
                </div>
              )}
            </div>

            {/* Identificação do Cliente */}
            <div className="border-b border-dashed border-black pb-2.5 mb-2.5 space-y-0.5">
              <div className="font-black uppercase text-[10px]">Cliente:</div>
              <div className="font-bold text-sm">{order.customerName}</div>
              {order.customerPhone && <div>Tel: {order.customerPhone}</div>}

              {!isKitchenSlip && order.fulfillmentType === 'delivery' && order.address && (
                <div className="mt-1.5 pt-1.5 border-t border-dotted border-black space-y-0.5">
                  <div className="font-bold">
                    {order.address.street}, {order.address.number}
                    {order.address.complement ? ` - ${order.address.complement}` : ''}
                  </div>
                  <div>
                    {order.address.neighborhood} — {order.address.city}/{order.address.state}
                  </div>
                  {order.address.reference && (
                    <div className="italic">Ref: {order.address.reference}</div>
                  )}
                </div>
              )}
            </div>

            {/* Observações da Cozinha / Pedido em Alto Destaque */}
            {order.notes && (
              <div className="mb-2.5 p-2 border-2 border-black font-bold">
                <div className="font-black uppercase text-[10px]">ATENÇÃO / OBSERVAÇÕES:</div>
                <div className="text-xs mt-0.5">{order.notes}</div>
              </div>
            )}

            {/* Itens do Pedido */}
            <div className="border-b-2 border-dashed border-black pb-3 mb-3">
              <div className="font-black uppercase text-[10px] mb-1.5">
                ITENS DO PEDIDO ({order.itemCount})
              </div>
              <div className="space-y-2">
                {order.items.map((item, idx) => (
                  <div key={idx} className="flex justify-between items-start gap-1">
                    <div>
                      <span className="font-black text-sm mr-1">[ ] {item.quantity}x</span>
                      <span className="font-bold">{item.productName}</span>
                      {item.variantName && (
                        <div className="text-[10px] pl-5">Tam/Porção: {item.variantName}</div>
                      )}
                    </div>
                    {!isKitchenSlip && (
                      <div className="font-bold whitespace-nowrap">
                        {formatBrl(item.subtotalCents)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Totais e Financeiro (Exibido na Comanda Completa e na Expedição) */}
            {!isKitchenSlip && (
              <div className="space-y-1 border-b border-dashed border-black pb-2.5 mb-2.5">
                <div className="flex justify-between">
                  <span>Subtotal:</span>
                  <span>{formatBrl(order.subtotalCents)}</span>
                </div>
                {order.fulfillmentType === 'delivery' && (
                  <div className="flex justify-between">
                    <span>Taxa Entrega:</span>
                    <span>{formatBrl(order.deliveryFeeCents)}</span>
                  </div>
                )}
                {(order.discountCents || 0) > 0 && (
                  <div className="flex justify-between font-bold">
                    <span>Desconto:</span>
                    <span>-{formatBrl(order.discountCents || 0)}</span>
                  </div>
                )}
                <div className="flex justify-between font-black text-sm pt-1 border-t border-black">
                  <span>TOTAL:</span>
                  <span>{order.formattedTotal}</span>
                </div>
                <div className="pt-1 space-y-0.5 text-[11px]">
                  <div className="flex justify-between">
                    <span>Forma Pgto:</span>
                    <span className="font-bold uppercase">{paymentMethodLabel}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Situação Pgto:</span>
                    <span className="font-black uppercase">
                      {order.paymentStatus === 'paid'
                        ? 'PAGO'
                        : PAYMENT_STATUS_LABELS[order.paymentStatus] || 'PENDENTE'}
                    </span>
                  </div>
                  {order.paymentMethod === 'cash' && order.cashChangeForCents && (
                    <div className="pt-1 border-t border-dotted border-black font-bold">
                      <div>Troco para: {formatBrl(order.cashChangeForCents)}</div>
                      {changeAmountCents !== null && (
                        <div className="font-black">TROCO A DEVOLVER: {formatBrl(changeAmountCents)}</div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Rodapé */}
            <div className="text-center text-[10px] space-y-0.5">
              <div className="font-bold">{tenantName} • Operação Multicanal</div>
              <div>Impresso em {new Date().toLocaleString('pt-BR')}</div>
            </div>
          </div>
        </div>

        {/* Estilo Global de Impressão Térmica */}
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
            #printable-ticket,
            #printable-ticket * {
              visibility: visible;
            }
            #printable-ticket {
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
