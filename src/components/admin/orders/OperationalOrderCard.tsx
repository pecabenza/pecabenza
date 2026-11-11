'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Clock,
  Printer,
  ExternalLink,
  CheckCircle,
  Truck,
  Store,
  Utensils,
  MessageCircle,
  Phone,
  Globe,
  Banknote,
  CreditCard,
  QrCode,
  Flame,
  ChefHat,
  PackageCheck,
  Loader2,
} from 'lucide-react';
import { formatBrl } from '@/modules/cart/cart.utils';
import type { OperationalOrder } from '@/modules/orders/orders.service';
import {
  type CanonicalOrderStatus,
  ORDER_CHANNEL_LABELS,
  PAYMENT_METHOD_LABELS,
} from '@/modules/orders/order-status.machine';

interface OperationalOrderCardProps {
  order: OperationalOrder;
  onStatusChange: (orderId: string, nextStatus: CanonicalOrderStatus) => Promise<void>;
  onPrint: (order: OperationalOrder) => void;
  onConfirmPayment?: (orderId: string) => Promise<void>;
}

export function OperationalOrderCard({
  order,
  onStatusChange,
  onPrint,
  onConfirmPayment,
}: OperationalOrderCardProps) {
  const [isUpdating, setIsUpdating] = useState(false);
  const [isConfirmingPay, setIsConfirmingPay] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  // Determina próxima ação canônica recomendada para 1 clique
  const getPrimaryAction = () => {
    switch (order.status) {
      case 'pending':
        return {
          label: 'Confirmar Pedido',
          nextStatus: 'confirmed' as CanonicalOrderStatus,
          color: 'bg-blue-600 hover:bg-blue-700 text-white',
          icon: CheckCircle,
        };
      case 'confirmed':
        return {
          label: 'Iniciar Preparo',
          nextStatus: 'preparing' as CanonicalOrderStatus,
          color: 'bg-amber-600 hover:bg-amber-700 text-white',
          icon: Flame,
        };
      case 'preparing':
        return {
          label: 'Marcar como Pronto',
          nextStatus: 'ready' as CanonicalOrderStatus,
          color: 'bg-purple-600 hover:bg-purple-700 text-white',
          icon: ChefHat,
        };
      case 'ready':
        if (order.fulfillmentType === 'pickup' || order.fulfillmentType === 'dine_in') {
          return {
            label: 'Entregar ao Cliente',
            nextStatus: 'delivered' as CanonicalOrderStatus,
            color: 'bg-emerald-600 hover:bg-emerald-700 text-white',
            icon: PackageCheck,
          };
        }
        return {
          label: 'Despachar / Saiu',
          nextStatus: 'out_for_delivery' as CanonicalOrderStatus,
          color: 'bg-indigo-600 hover:bg-indigo-700 text-white',
          icon: Truck,
        };
      case 'out_for_delivery':
        return {
          label: 'Confirmar Entrega',
          nextStatus: 'delivered' as CanonicalOrderStatus,
          color: 'bg-emerald-600 hover:bg-emerald-700 text-white',
          icon: PackageCheck,
        };
      default:
        return null;
    }
  };

  const primaryAction = getPrimaryAction();

  const handleActionClick = async () => {
    if (!primaryAction || isUpdating) return;
    setIsUpdating(true);
    try {
      await onStatusChange(order.id, primaryAction.nextStatus);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleCancelClick = async () => {
    if (isUpdating) return;
    setIsUpdating(true);
    try {
      await onStatusChange(order.id, 'cancelled');
      setShowCancelConfirm(false);
    } finally {
      setIsUpdating(false);
    }
  };

  // Cores de tempo e urgência
  const getTimeBadgeColor = () => {
    if (order.isDelayed) {
      return 'bg-red-500 text-white animate-pulse font-black';
    }
    if (order.isUrgent) {
      return 'bg-amber-500 text-white font-bold';
    }
    if (order.elapsedMinutes > 20) {
      return 'bg-amber-100 text-amber-800 font-bold';
    }
    return 'bg-stone-100 text-stone-700';
  };

  const isTerminal = order.status === 'delivered' || order.status === 'cancelled';

  return (
    <div
      className={`bg-white rounded-xl shadow-sm border transition-all duration-200 flex flex-col justify-between ${
        order.isDelayed
          ? 'border-red-400 ring-2 ring-red-400/20'
          : order.isUrgent
          ? 'border-amber-300'
          : 'border-stone-200 hover:border-stone-300'
      }`}
    >
      {/* Top Header */}
      <div className="p-3.5 pb-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-heading font-black text-lg text-stone-900 tracking-tight">
                {order.orderNumber}
              </span>
              <span
                className={`text-[11px] px-2 py-0.5 rounded-full flex items-center gap-1 ${getTimeBadgeColor()}`}
              >
                <Clock className="w-3 h-3" />
                {order.elapsedMinutes}m
              </span>
              <span
                className={`text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1 ${
                  order.orderChannel === 'whatsapp'
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : order.orderChannel === 'phone'
                    ? 'bg-blue-50 text-blue-700 border border-blue-200'
                    : order.orderChannel === 'counter'
                    ? 'bg-amber-50 text-amber-800 border border-amber-200'
                    : 'bg-stone-100 text-stone-600'
                }`}
              >
                {order.orderChannel === 'whatsapp' ? (
                  <MessageCircle className="w-2.5 h-2.5" />
                ) : order.orderChannel === 'phone' ? (
                  <Phone className="w-2.5 h-2.5" />
                ) : order.orderChannel === 'counter' ? (
                  <Store className="w-2.5 h-2.5" />
                ) : (
                  <Globe className="w-2.5 h-2.5" />
                )}
                {ORDER_CHANNEL_LABELS[order.orderChannel || 'website'] || 'Site'}
              </span>
            </div>
            <div className="text-xs font-bold text-stone-800 mt-0.5 truncate max-w-[190px]">
              {order.customerName}
            </div>
          </div>

          {/* Badges de Modalidade e Pagamento */}
          <div className="flex flex-col items-end gap-1">
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 ${
                order.fulfillmentType === 'delivery'
                  ? 'bg-blue-50 text-blue-700 border border-blue-200'
                  : order.fulfillmentType === 'dine_in'
                  ? 'bg-purple-50 text-purple-700 border border-purple-200'
                  : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              }`}
            >
              {order.fulfillmentType === 'delivery' ? (
                <>
                  <Truck className="w-3 h-3" /> Entrega
                </>
              ) : order.fulfillmentType === 'dine_in' ? (
                <>
                  <Utensils className="w-3 h-3" /> No Local
                </>
              ) : (
                <>
                  <Store className="w-3 h-3" /> Retirada
                </>
              )}
            </span>

            <span
              className={`text-[10px] font-semibold px-1.5 py-0.5 rounded flex items-center gap-1 ${
                order.paymentStatus === 'paid'
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-amber-100 text-amber-800'
              }`}
            >
              {order.paymentMethod === 'cash' ? (
                <Banknote className="w-2.5 h-2.5" />
              ) : order.paymentMethod === 'card_on_delivery' ||
                order.paymentMethod === 'pos_card' ||
                order.paymentMethod === 'credit_card' ? (
                <CreditCard className="w-2.5 h-2.5" />
              ) : (
                <QrCode className="w-2.5 h-2.5" />
              )}
              {PAYMENT_METHOD_LABELS[order.paymentMethod || 'pix']?.split(' ')[0] || 'Pix'} •{' '}
              {order.paymentStatus === 'paid' ? 'Pago' : 'Pendente'}
            </span>
          </div>
        </div>

        {/* Troco em destaque para pedidos em dinheiro */}
        {order.paymentMethod === 'cash' &&
          order.cashChangeForCents &&
          order.cashChangeForCents > order.totalCents && (
            <div className="mt-1.5 text-[10px] font-bold text-emerald-900 bg-emerald-50 px-2 py-1 rounded border border-emerald-200 flex items-center justify-between">
              <span>💵 Troco p/ {formatBrl(order.cashChangeForCents)}</span>
              <span>Devolver: {formatBrl(order.cashChangeForCents - order.totalCents)}</span>
            </div>
          )}

        {/* Agendamento */}
        {order.scheduleType === 'scheduled' && order.scheduledFor && (
          <div className="mt-2 text-[11px] font-bold text-amber-800 bg-amber-50 px-2 py-1 rounded border border-amber-200 flex items-center justify-between">
            <span>⏰ Agendado: {new Date(order.scheduledFor).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
            {order.preparationDueAt && (
              <span className="text-[10px] text-amber-950 font-normal">
                Meta preparo: {new Date(order.preparationDueAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>
        )}

        {/* Observação Importante do Cliente */}
        {order.notes && (
          <div className="mt-2 p-2 bg-amber-50/80 border-l-4 border-amber-500 rounded-r text-xs text-amber-900 font-medium">
            <span className="font-bold block text-[10px] uppercase text-amber-800">Obs:</span>
            {order.notes}
          </div>
        )}

        {/* Lista resumida de itens */}
        <div className="mt-3 pt-2.5 border-t border-stone-100 space-y-1">
          {order.items.slice(0, 4).map((item, idx) => (
            <div key={idx} className="flex justify-between items-baseline text-xs text-stone-700">
              <span className="truncate pr-1">
                <strong className="font-bold text-stone-900 mr-1">{item.quantity}x</strong>
                {item.productName}
                {item.variantName && <span className="text-stone-500 text-[11px]"> ({item.variantName})</span>}
              </span>
            </div>
          ))}
          {order.items.length > 4 && (
            <div className="text-[11px] text-stone-500 italic">
              + {order.items.length - 4} outro(s) item(ns)...
            </div>
          )}
        </div>
      </div>

      {/* Footer com Total e Botões Operacionais */}
      <div className="p-3 bg-stone-50/70 border-t border-stone-100 rounded-b-xl space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-stone-500 font-medium">Total:</span>
          <span className="font-black font-mono text-stone-900 text-sm">{order.formattedTotal}</span>
        </div>

        {/* Botão de Ação Primária (1 Clique) */}
        {!isTerminal && primaryAction && (
          <button
            onClick={handleActionClick}
            disabled={isUpdating}
            className={`w-full py-2 px-3 rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-sm active:scale-[0.98] disabled:opacity-50 ${primaryAction.color}`}
          >
            {isUpdating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <primaryAction.icon className="w-4 h-4" />
                {primaryAction.label}
              </>
            )}
          </button>
        )}

        {/* Ações Secundárias: Imprimir, Link Tracking, Cancelar */}
        <div className="flex items-center justify-between pt-1 gap-1">
          <div className="flex items-center gap-1">
            <button
              onClick={() => onPrint(order)}
              className="p-1.5 rounded-md text-stone-600 hover:text-stone-900 hover:bg-stone-200/60 transition-colors"
              title="Imprimir comanda"
              aria-label="Imprimir comanda"
            >
              <Printer className="w-4 h-4" />
            </button>

            {order.publicTrackingToken && (
              <Link
                href={`/pedido/${order.publicTrackingToken}`}
                target="_blank"
                className="p-1.5 rounded-md text-stone-600 hover:text-stone-900 hover:bg-stone-200/60 transition-colors"
                title="Acompanhamento público"
                aria-label="Acompanhamento público"
              >
                <ExternalLink className="w-4 h-4" />
              </Link>
            )}

            {!isTerminal && order.paymentStatus !== 'paid' && onConfirmPayment && (
              <button
                type="button"
                disabled={isConfirmingPay}
                onClick={async () => {
                  setIsConfirmingPay(true);
                  try {
                    await onConfirmPayment(order.id);
                  } finally {
                    setIsConfirmingPay(false);
                  }
                }}
                className="px-2 py-1 rounded-md bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-[10px] font-bold transition-colors disabled:opacity-50"
                title="Confirmar recebimento manual do pagamento"
              >
                {isConfirmingPay ? '...' : '✓ Confirmar Pgto'}
              </button>
            )}
          </div>

          {!isTerminal && (
            <div>
              {showCancelConfirm ? (
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-red-600 font-bold">Cancelar?</span>
                  <button
                    onClick={handleCancelClick}
                    disabled={isUpdating}
                    className="px-2 py-0.5 bg-red-600 text-white text-[10px] font-bold rounded hover:bg-red-700"
                  >
                    Sim
                  </button>
                  <button
                    onClick={() => setShowCancelConfirm(false)}
                    className="px-1.5 py-0.5 bg-stone-200 text-stone-700 text-[10px] rounded"
                  >
                    Não
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowCancelConfirm(true)}
                  className="text-[11px] text-stone-400 hover:text-red-600 transition-colors"
                >
                  Cancelar
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

