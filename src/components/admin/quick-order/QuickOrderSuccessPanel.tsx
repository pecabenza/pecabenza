'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  CheckCircle2,
  Printer,
  Plus,
  QrCode,
  Copy,
  Check,
  MessageCircle,
  ExternalLink,
  Clock,
  AlertTriangle,
} from 'lucide-react';
import { formatBrl } from '@/modules/cart/cart.utils';
import {
  ORDER_CHANNEL_LABELS,
  FULFILLMENT_TYPE_LABELS,
  PAYMENT_METHOD_LABELS,
} from '@/modules/orders/order-status.machine';
import { toShortTrackingToken } from '@/modules/orders/tracking-token';
import type { PrintTicketMode } from '@/components/admin/orders/OrderPrintModal';
import type { CreatedOrderWithPix } from './types';

interface QuickOrderSuccessPanelProps {
  createdOrder: CreatedOrderWithPix;
  copiedWhatsApp: boolean;
  copiedPix: boolean;
  onCopyWhatsApp: () => void;
  onCopyPix: () => void;
  onOpenPrintModal: (mode: PrintTicketMode) => void;
  onStartNewOrder: () => void;
}

export function QuickOrderSuccessPanel({
  createdOrder,
  copiedWhatsApp,
  copiedPix,
  onCopyWhatsApp,
  onCopyPix,
  onOpenPrintModal,
  onStartNewOrder,
}: QuickOrderSuccessPanelProps) {
  const [livePaymentStatus, setLivePaymentStatus] = useState<string>(createdOrder.paymentStatus);
  const [isPixExpired, setIsPixExpired] = useState(false);

  const paymentId = createdOrder.pixPayment?.paymentId;
  const pixExpiresAt = createdOrder.pixPayment?.pixExpiresAt;

  // Monitora expiração e confirmação do Pix em tempo real
  useEffect(() => {
    const syncInitial = setTimeout(() => {
      setLivePaymentStatus(createdOrder.paymentStatus);
      if (pixExpiresAt) {
        setIsPixExpired(new Date(pixExpiresAt).getTime() <= Date.now());
      } else {
        setIsPixExpired(false);
      }
    }, 0);

    if (!paymentId || createdOrder.paymentStatus === 'paid') {
      return () => clearTimeout(syncInitial);
    }

    const interval = setInterval(async () => {
      if (pixExpiresAt && new Date(pixExpiresAt).getTime() <= Date.now()) {
        setIsPixExpired(true);
        clearInterval(interval);
        return;
      }

      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        return;
      }

      try {
        const res = await fetch(`/api/payments/${paymentId}/status`, { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          if (data.status === 'paid') {
            setLivePaymentStatus('paid');
            clearInterval(interval);
          } else if (data.status === 'expired' || data.isExpired) {
            setIsPixExpired(true);
            clearInterval(interval);
          }
        }
      } catch {
        // preserva último estado em falha transitória
      }
    }, 5000);

    return () => {
      clearTimeout(syncInitial);
      clearInterval(interval);
    };
  }, [paymentId, pixExpiresAt, createdOrder.paymentStatus]);

  const shortTrackingToken = toShortTrackingToken(createdOrder.publicTrackingToken);
  const cleanPhoneDigits = (createdOrder.customerPhone || '').replace(/\D/g, '');
  const whatsappSendUrl =
    cleanPhoneDigits.length >= 10
      ? `https://wa.me/${
          cleanPhoneDigits.startsWith('55') ? cleanPhoneDigits : `55${cleanPhoneDigits}`
        }?text=${encodeURIComponent(createdOrder.whatsappSummaryText)}`
      : null;

  return (
    <div className="bg-emerald-50/90 border-2 border-emerald-500 rounded-2xl p-6 space-y-5 shadow-md">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-emerald-200 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-sm">
            <CheckCircle2 className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-black uppercase tracking-wider text-emerald-800">
                Pedido Registrado com Sucesso
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-stone-900 text-white">
                {createdOrder.orderNumber}
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-200 text-emerald-950">
                {ORDER_CHANNEL_LABELS[createdOrder.orderChannel]}
              </span>
            </div>
            <p className="text-sm font-bold text-stone-800 mt-1">
              Cliente: {createdOrder.customerName} • Total: {createdOrder.formattedTotal}
            </p>
            <p className="text-xs text-stone-600">
              Status do Pedido:{' '}
              <strong>
                {createdOrder.status === 'confirmed'
                  ? 'Confirmado (Na Cozinha / KDS)'
                  : 'Pendente (Fila Operacional)'}
              </strong>{' '}
              | Status Financeiro:{' '}
              <strong>
                {livePaymentStatus === 'paid'
                  ? 'Pago (Confirmado)'
                  : isPixExpired
                  ? 'Cobrança Pix Expirada'
                  : 'Aguardando Pagamento'}
              </strong>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onOpenPrintModal('kitchen')}
            className="min-h-[40px] flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-xs"
          >
            <Printer className="w-4 h-4" />
            <span>Imprimir Cozinha</span>
          </button>
          <button
            type="button"
            onClick={() => onOpenPrintModal('full')}
            className="min-h-[40px] flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-stone-800 hover:bg-stone-900 text-white text-xs font-bold shadow-xs"
          >
            <Printer className="w-4 h-4" />
            <span>Imprimir Balcão/Entrega</span>
          </button>
          <button
            type="button"
            onClick={onStartNewOrder}
            className="min-h-[40px] flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>Iniciar Novo Pedido</span>
          </button>
        </div>
      </div>

      {/* Resumo WhatsApp + Cobrança Pix + Link de Rastreio */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl p-4 border border-emerald-200 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-black uppercase text-stone-700">
              Resumo Pronto para WhatsApp
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onCopyWhatsApp}
                className="min-h-[36px] flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold"
              >
                {copiedWhatsApp ? (
                  <Check className="w-3.5 h-3.5" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                <span>{copiedWhatsApp ? 'Copiado!' : 'Copiar Resumo'}</span>
              </button>
              {whatsappSendUrl && (
                <a
                  href={whatsappSendUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-[36px] flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-stone-900 hover:bg-stone-800 text-white text-xs font-bold"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  <span>Abrir WhatsApp</span>
                </a>
              )}
            </div>
          </div>
          <pre className="text-xs font-mono bg-stone-50 p-3 rounded-lg border border-stone-200 whitespace-pre-wrap text-stone-800 max-h-48 overflow-y-auto">
            {createdOrder.whatsappSummaryText}
          </pre>
        </div>

        <div className="bg-white rounded-xl p-4 border border-emerald-200 space-y-3 flex flex-col justify-between">
          {createdOrder.pixPayment ? (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-black uppercase text-stone-700 flex items-center gap-1.5">
                  <QrCode className="w-4 h-4 text-emerald-700" />
                  Código Pix Copia e Cola Gerado
                </span>
                  <button
                    type="button"
                    disabled={isPixExpired || livePaymentStatus === 'paid'}
                    onClick={onCopyPix}
                    className="min-h-[36px] flex items-center gap-1 px-2.5 py-1 rounded-lg bg-stone-900 text-white text-xs font-bold disabled:opacity-40"
                  >
                    {copiedPix ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedPix ? 'Pix Copiado!' : 'Copiar Pix'}</span>
                  </button>
                </div>
                <input
                  type="text"
                  readOnly
                  value={createdOrder.pixPayment.pixQrCodeText}
                  aria-label="Código Pix Copia e Cola"
                  className="w-full text-xs font-mono bg-stone-50 p-2 rounded border border-stone-200 text-stone-700"
                />
                {livePaymentStatus === 'paid' ? (
                  <div className="p-2.5 rounded-lg bg-emerald-100 text-emerald-900 text-xs font-bold flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                    <span>Pagamento Pix confirmado automaticamente!</span>
                  </div>
                ) : isPixExpired ? (
                  <div className="p-2.5 rounded-lg bg-red-100 text-red-900 text-xs font-bold flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-700 shrink-0" />
                    <span>Este QR Code Pix expirou. Gere uma nova cobrança ou receba por outro método.</span>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-2 text-[11px] text-amber-800 font-semibold">
                    <span>
                      O pedido permanece como Pendente até a confirmação do pagamento via webhook ou conferência manual.
                    </span>
                    {createdOrder.pixPayment.pixExpiresAt && (
                      <span className="inline-flex items-center gap-1 shrink-0 bg-amber-100 px-2 py-0.5 rounded-full">
                        <Clock className="w-3 h-3" />
                        Expira às{' '}
                        {new Date(createdOrder.pixPayment.pixExpiresAt).toLocaleTimeString(
                          'pt-BR',
                          {
                            hour: '2-digit',
                            minute: '2-digit',
                          }
                        )}
                      </span>
                    )}
                  </div>
                )}
              </div>
          ) : (
            <div className="space-y-1">
              <span className="text-xs font-black uppercase text-stone-700">
                Detalhes Financeiros & Logísticos
              </span>
              <p className="text-xs text-stone-600">
                Modalidade: <strong>{FULFILLMENT_TYPE_LABELS[createdOrder.fulfillmentType]}</strong>
              </p>
              <p className="text-xs text-stone-600">
                Pagamento: <strong>{PAYMENT_METHOD_LABELS[createdOrder.paymentMethod]}</strong>
              </p>
              {createdOrder.cashChangeAmountCents !== null && (
                <p className="text-xs font-bold text-emerald-800">
                  Troco a devolver: {formatBrl(createdOrder.cashChangeAmountCents)} (Pago com{' '}
                  {formatBrl(createdOrder.cashChangeForCents || 0)})
                </p>
              )}
            </div>
          )}

          <div className="pt-2 border-t border-stone-100 flex items-center justify-between">
            <span className="text-xs text-stone-500">Link público de rastreamento:</span>
            <Link
              href={`/pedido/${shortTrackingToken}`}
              target="_blank"
              className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 hover:underline"
            >
              <span>/pedido/{shortTrackingToken}</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

