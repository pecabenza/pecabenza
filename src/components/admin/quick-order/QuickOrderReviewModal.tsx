'use client';

import React from 'react';
import {
  X,
  CheckCircle2,
  User,
  MapPin,
  Clock,
  CreditCard,
  Flame,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import { formatBrl } from '@/modules/cart/cart.utils';
import {
  ORDER_CHANNEL_LABELS,
  FULFILLMENT_TYPE_LABELS,
  PAYMENT_METHOD_LABELS,
} from '@/modules/orders/order-status.machine';
import type { FulfillmentType, OrderChannel, OrderPaymentMethod } from '@/types/database.types';
import type { PosCartItem } from './types';

interface QuickOrderReviewModalProps {
  orderChannel: OrderChannel;
  fulfillmentType: FulfillmentType;
  scheduleType: 'asap' | 'scheduled';
  scheduledForInput: string;
  customerName: string;
  customerPhone: string;
  address: {
    zipCode: string;
    street: string;
    number: string;
    complement: string;
    neighborhood: string;
    city: string;
    stateUf: string;
    reference: string;
  };
  cart: PosCartItem[];
  kitchenNotes: string;
  subtotalCents: number;
  deliveryFeeCents: number;
  discountCents: number;
  totalCents: number;
  paymentMethod: OrderPaymentMethod;
  markAsPaidNow: boolean;
  cashChangeForCents: number | null;
  cashChangeReturnCents: number | null;
  confirmImmediately: boolean;
  onToggleConfirmImmediately: (next: boolean) => void;
  isSubmitting: boolean;
  onClose: () => void;
  onConfirmSubmit: () => void;
}

export function QuickOrderReviewModal({
  orderChannel,
  fulfillmentType,
  scheduleType,
  scheduledForInput,
  customerName,
  customerPhone,
  address,
  cart,
  kitchenNotes,
  subtotalCents,
  deliveryFeeCents,
  discountCents,
  totalCents,
  paymentMethod,
  markAsPaidNow,
  cashChangeForCents,
  cashChangeReturnCents,
  confirmImmediately,
  onToggleConfirmImmediately,
  isSubmitting,
  onClose,
  onConfirmSubmit,
}: QuickOrderReviewModalProps) {
  const canBeMarkedPaidNow =
    paymentMethod === 'cash' || paymentMethod === 'pos_card' || paymentMethod === 'credit_card';
  const effectivePaidNow = canBeMarkedPaidNow && markAsPaidNow;

  return (
    <div
      className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="review-modal-title"
    >
      <div className="bg-white rounded-2xl border border-stone-200 shadow-2xl w-full max-w-xl max-h-[92vh] flex flex-col overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-stone-200 flex items-start justify-between gap-3 bg-stone-50">
          <div>
            <h2 id="review-modal-title" className="text-base sm:text-lg font-black text-stone-900">
              Conferência Final do Pedido
            </h2>
            <p className="text-xs text-stone-500 mt-0.5">
              Revise os dados antes de registrar e disparar para a operação.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="p-2 rounded-lg text-stone-500 hover:bg-stone-200/60 hover:text-stone-900"
            aria-label="Voltar para edição do pedido"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1 text-xs">
          {/* Cliente, Canal e Modalidade */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3 rounded-xl bg-stone-50 border border-stone-200 space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-stone-700">
                <User className="w-3.5 h-3.5 text-stone-500" />
                <span>Cliente & Canal</span>
              </div>
              <p className="text-sm font-black text-stone-900">
                {customerName.trim() || 'Cliente Balcão'}
              </p>
              <p className="text-stone-600">
                {customerPhone.trim() || 'Sem telefone'} •{' '}
                <strong>{ORDER_CHANNEL_LABELS[orderChannel] || orderChannel}</strong>
              </p>
            </div>

            <div className="p-3 rounded-xl bg-stone-50 border border-stone-200 space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-stone-700">
                <Clock className="w-3.5 h-3.5 text-stone-500" />
                <span>Modalidade & Horário</span>
              </div>
              <p className="text-sm font-black text-stone-900">
                {FULFILLMENT_TYPE_LABELS[fulfillmentType] || fulfillmentType}
              </p>
              <p className="text-stone-600">
                {scheduleType === 'scheduled' && scheduledForInput
                  ? `Agendado: ${new Date(scheduledForInput).toLocaleString('pt-BR', {
                      day: '2-digit',
                      month: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}`
                  : 'Preparo Imediato (ASAP)'}
              </p>
            </div>
          </div>

          {/* Endereço de Entrega */}
          {fulfillmentType === 'delivery' && (
            <div className="p-3 rounded-xl bg-blue-50/70 border border-blue-200 space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-blue-900">
                <MapPin className="w-3.5 h-3.5 text-blue-700" />
                <span>Endereço de Entrega</span>
              </div>
              <p className="font-bold text-stone-900">
                {address.street}, {address.number}
                {address.complement ? ` (${address.complement})` : ''}
              </p>
              <p className="text-stone-700">
                {address.neighborhood} — {address.city}/{address.stateUf}
                {address.zipCode ? ` • CEP ${address.zipCode}` : ' • Sem CEP informado'}
              </p>
              {address.reference && (
                <p className="text-stone-600 italic">Ref.: {address.reference}</p>
              )}
            </div>
          )}

          {/* Lista de Produtos e Complementos */}
          <div className="rounded-xl border border-stone-200 overflow-hidden">
            <div className="bg-stone-100 px-3.5 py-2 font-bold text-stone-800 flex items-center justify-between">
              <span>Itens do Pedido ({cart.reduce((s, i) => s + i.quantity, 0)})</span>
              <span>Subtotal</span>
            </div>
            <div className="divide-y divide-stone-100 px-3.5 py-1">
              {cart.map((item) => (
                <div key={item.cartItemKey} className="py-2 flex items-start justify-between gap-3">
                  <div>
                    <span className="font-bold text-stone-900">
                      {item.quantity}× {item.productName} ({item.variantName})
                    </span>
                    {item.modifierSummary && (
                      <span className="block text-[11px] text-emerald-800 font-medium">
                        + {item.modifierSummary}
                      </span>
                    )}
                  </div>
                  <span className="font-mono font-bold text-stone-900 shrink-0">
                    {formatBrl(item.unitPriceInCents * item.quantity)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {kitchenNotes.trim() && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900">
              <strong className="block text-[11px] uppercase">Observações do Pedido:</strong>
              <span>{kitchenNotes.trim()}</span>
            </div>
          )}

          {/* Resumo Financeiro e Pagamento */}
          <div className="p-3.5 rounded-xl bg-stone-50 border border-stone-200 space-y-2">
            <div className="flex items-center justify-between text-stone-600">
              <span>Subtotal dos itens:</span>
              <span className="font-mono font-semibold">{formatBrl(subtotalCents)}</span>
            </div>
            {fulfillmentType === 'delivery' && (
              <div className="flex items-center justify-between text-stone-600">
                <span>Taxa de entrega:</span>
                <span className="font-mono font-semibold">{formatBrl(deliveryFeeCents)}</span>
              </div>
            )}
            {discountCents > 0 && (
              <div className="flex items-center justify-between text-emerald-700 font-semibold">
                <span>Desconto aplicado:</span>
                <span className="font-mono">- {formatBrl(discountCents)}</span>
              </div>
            )}
            <div className="pt-2 border-t border-stone-200 flex items-center justify-between text-sm font-black text-stone-900">
              <span>Total a Cobrar:</span>
              <span className="font-mono text-base text-emerald-700">{formatBrl(totalCents)}</span>
            </div>
            <div className="pt-1 flex flex-wrap items-center justify-between gap-2 text-stone-700">
              <span className="flex items-center gap-1.5 font-semibold">
                <CreditCard className="w-3.5 h-3.5 text-stone-500" />
                {PAYMENT_METHOD_LABELS[paymentMethod] || paymentMethod}
              </span>
              <span
                className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                  effectivePaidNow
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-amber-100 text-amber-800'
                }`}
              >
                {effectivePaidNow ? 'Status Financeiro: Pago no Balcão' : 'Status Financeiro: Pendente'}
              </span>
            </div>
            {paymentMethod === 'cash' && cashChangeForCents && cashChangeReturnCents !== null && (
              <div className="text-[11px] font-bold text-emerald-800 bg-emerald-50 px-2.5 py-1.5 rounded-lg border border-emerald-200 flex items-center justify-between">
                <span>Troco para {formatBrl(cashChangeForCents)}</span>
                <span>Devolver: {formatBrl(cashChangeReturnCents)}</span>
              </div>
            )}
          </div>

          {/* Status de Entrada no KDS / Cozinha */}
          <label className="p-3.5 rounded-xl border border-stone-300 bg-white flex items-start gap-3 cursor-pointer hover:border-stone-400">
            <input
              type="checkbox"
              checked={confirmImmediately}
              onChange={(e) => onToggleConfirmImmediately(e.target.checked)}
              className="mt-0.5 rounded border-stone-300 text-emerald-600 focus:ring-emerald-500"
            />
            <div className="space-y-0.5">
              <span className="font-bold text-stone-900 flex items-center gap-1.5">
                <Flame className="w-3.5 h-3.5 text-amber-600" />
                {confirmImmediately
                  ? 'Entrada no KDS: Confirmado (Envia direto para a Cozinha e reserva estoque)'
                  : 'Entrada na Fila: Pendente (Aguardará confirmação antes de ir ao KDS)'}
              </span>
              <span className="block text-[11px] text-stone-500">
                {confirmImmediately
                  ? 'Use quando o pedido já foi confirmado com o cliente.'
                  : 'Desmarque se quiser deixar o pedido aguardando pagamento/validação antes do preparo.'}
              </span>
            </div>
          </label>

          {!confirmImmediately && (
            <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-900 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                Este pedido será criado como <strong>Pendente</strong> e não acionará o KDS até ser confirmado em <code>/admin/operacao</code>.
              </span>
            </div>
          )}
        </div>

        <div className="p-4 sm:p-5 border-t border-stone-200 bg-stone-50 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="min-h-[42px] px-4 py-2 rounded-xl border border-stone-300 bg-white text-xs font-bold text-stone-700 hover:bg-stone-100 disabled:opacity-50"
          >
            Voltar e Ajustar
          </button>
          <button
            type="button"
            onClick={onConfirmSubmit}
            disabled={isSubmitting}
            className="min-h-[42px] px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center gap-2 shadow-sm disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Registrando Pedido...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>Confirmar e Registrar Pedido</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

