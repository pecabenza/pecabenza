'use client';

import React, { use, useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ShoppingBag,
  Clock,
  CheckCircle2,
  ChefHat,
  Truck,
  Store,
  XCircle,
  PackageCheck,
  AlertCircle,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  MapPin,
  Calendar,
  DollarSign,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import {
  CanonicalOrderStatus,
  CanonicalPaymentStatus,
  ORDER_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  ALLOWED_STATUS_TRANSITIONS,
} from '@/modules/orders/order-status.machine';
import { formatBrl } from '@/modules/cart/cart.utils';

interface OrderDetail {
  id: string;
  order_number: string;
  public_tracking_token?: string;
  customer_name: string;
  customer_phone: string;
  customer_email?: string | null;
  fulfillment_type: 'delivery' | 'pickup';
  schedule_type: 'asap' | 'scheduled';
  scheduled_for?: string | null;
  status: CanonicalOrderStatus;
  payment_status: CanonicalPaymentStatus;
  subtotal_cents: number;
  delivery_fee_cents: number;
  discount_cents: number;
  total_cents: number;
  notes?: string | null;
  created_at: string;
  items: Array<{
    id: string;
    snapshot_product_name: string;
    snapshot_variant_name: string;
    quantity: number;
    unit_price_cents: number;
    subtotal_cents: number;
  }>;
  address?: {
    zip_code: string;
    street: string;
    number: string;
    complement?: string | null;
    neighborhood: string;
    city: string;
    state: string;
    reference?: string | null;
  } | null;
  timeline: Array<{
    id: string;
    from_status?: string | null;
    to_status: string;
    source: string;
    metadata?: any;
    created_at: string;
  }>;
  payment?: {
    id: string;
    provider: string;
    status: string;
    amount_cents: number;
    pix_qr_code_text?: string | null;
    paid_at?: string | null;
  } | null;
}

export default function AdminOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: orderId } = use(params);

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [cancellationReason, setCancellationReason] = useState('');
  const [showCancelPrompt, setShowCancelPrompt] = useState(false);

  const fetchOrder = useCallback(async () => {
    setIsLoading(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}`);
      if (!res.ok) {
        throw new Error('Erro ao carregar detalhes do pedido.');
      }
      const data = await res.json();
      setOrder(data);
    } catch (err: any) {
      setActionError(err.message || 'Falha de conexão.');
    } finally {
      setIsLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    fetchOrder();
  }, [fetchOrder]);

  const handleStatusChange = async (nextStatus: CanonicalOrderStatus, reason?: string) => {
    setIsUpdating(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: nextStatus,
          reason: reason || undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Falha ao atualizar status do pedido.');
      }

      setShowCancelPrompt(false);
      setCancellationReason('');
      await fetchOrder();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setIsUpdating(false);
    }
  };

  if (isLoading) {
    return (
      <div className="py-20 text-center text-xs text-slate-500 flex flex-col items-center justify-center gap-2">
        <RefreshCw className="w-6 h-6 animate-spin text-slate-400" />
        <span>Carregando detalhes do pedido...</span>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="py-16 text-center text-xs text-slate-500 space-y-3">
        <AlertCircle className="w-8 h-8 text-red-500 mx-auto" />
        <h2 className="text-base font-bold text-slate-800">Pedido Não Localizado</h2>
        <div className="pt-2">
          <Link
            href="/admin/pedidos"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Voltar para Lista de Pedidos</span>
          </Link>
        </div>
      </div>
    );
  }

  // Ações permitidas pela máquina de estados canônica
  const rawAllowedNext = ALLOWED_STATUS_TRANSITIONS[order.status] || [];
  const allowedNextTransitions = rawAllowedNext.filter((st) => {
    if (order.fulfillment_type === 'pickup' && st === 'out_for_delivery') {
      return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Topo / Voltar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <Link
          href="/admin/pedidos"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Voltar aos Pedidos</span>
        </Link>

        {order.public_tracking_token && (
          <Link
            href={`/pedido/${order.public_tracking_token}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200/80 text-slate-700 text-xs font-semibold transition-all shadow-sm self-start sm:self-auto"
          >
            <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
            <span>Ver Rastreio do Cliente</span>
          </Link>
        )}
      </div>

      {actionError && (
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Header do Pedido */}
      <Card className="p-6 bg-white border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-extrabold text-slate-900">
                Pedido {order.order_number}
              </h1>
              <Badge variant="primary" className="text-xs">
                {ORDER_STATUS_LABELS[order.status] || order.status}
              </Badge>
              <Badge
                variant={order.payment_status === 'paid' ? 'primary' : 'secondary'}
                className={`text-xs ${order.payment_status === 'paid' ? 'bg-emerald-500/10 text-emerald-800 border-emerald-500/20' : ''}`}
              >
                {PAYMENT_STATUS_LABELS[order.payment_status] || order.payment_status}
              </Badge>
            </div>
            <p className="text-xs text-slate-500">
              Registrado em {new Date(order.created_at).toLocaleString('pt-BR')}
            </p>
          </div>

          {/* Painel Operacional de Transição de Status (Máquina de Estados) */}
          <div className="flex flex-wrap items-center gap-2">
            {allowedNextTransitions.map((nextSt) => {
              if (nextSt === 'cancelled') {
                return (
                  <button
                    key={nextSt}
                    onClick={() => setShowCancelPrompt(true)}
                    disabled={isUpdating}
                    className="px-3.5 py-2 rounded-xl bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 text-xs font-semibold transition-all"
                  >
                    Cancelar Pedido
                  </button>
                );
              }

              let btnLabel = `Mudar para ${ORDER_STATUS_LABELS[nextSt]}`;
              let btnClass = 'bg-slate-900 text-white hover:bg-slate-800';

              if (nextSt === 'confirmed') {
                btnLabel = 'Aceitar & Confirmar';
                btnClass = 'bg-blue-600 text-white hover:bg-blue-700';
              } else if (nextSt === 'preparing') {
                btnLabel = 'Iniciar Preparo na Cozinha';
                btnClass = 'bg-purple-600 text-white hover:bg-purple-700';
              } else if (nextSt === 'ready') {
                btnLabel = 'Marcar como Pronto';
                btnClass = 'bg-indigo-600 text-white hover:bg-indigo-700';
              } else if (nextSt === 'out_for_delivery') {
                btnLabel = 'Despachar para Entrega';
                btnClass = 'bg-amber-600 text-white hover:bg-amber-700';
              } else if (nextSt === 'delivered') {
                btnLabel = order.fulfillment_type === 'pickup' ? 'Confirmar Retirada' : 'Confirmar Entrega';
                btnClass = 'bg-emerald-600 text-white hover:bg-emerald-700';
              }

              return (
                <button
                  key={nextSt}
                  onClick={() => handleStatusChange(nextSt)}
                  disabled={isUpdating}
                  className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all shadow-sm ${btnClass}`}
                >
                  {isUpdating ? 'Atualizando...' : btnLabel}
                </button>
              );
            })}

            {allowedNextTransitions.length === 0 && (
              <span className="text-xs text-slate-400 font-semibold px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200">
                Estado terminal atingido ({ORDER_STATUS_LABELS[order.status]})
              </span>
            )}
          </div>
        </div>

        {/* Modal/Prompt de Cancelamento */}
        {showCancelPrompt && (
          <div className="p-4 rounded-xl bg-red-50/70 border border-red-200 space-y-3">
            <h4 className="text-xs font-bold text-red-900">Motivo do Cancelamento:</h4>
            <input
              type="text"
              placeholder="Ex: Cliente solicitou desistência, prato esgotado..."
              value={cancellationReason}
              onChange={(e) => setCancellationReason(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-white border border-red-300 text-xs text-slate-800 placeholder-red-300 focus:outline-none focus:ring-2 focus:ring-red-400"
            />
            <div className="flex items-center gap-2 justify-end">
              <button
                onClick={() => setShowCancelPrompt(false)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-200/50"
              >
                Voltar
              </button>
              <button
                onClick={() => handleStatusChange('cancelled', cancellationReason)}
                disabled={isUpdating}
                className="px-4 py-1.5 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700 shadow-sm"
              >
                Confirmar Cancelamento
              </button>
            </div>
          </div>
        )}
      </Card>

      {/* Grid com Dados do Pedido */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Coluna 1 & 2: Itens, Endereço e Observações */}
        <div className="lg:col-span-2 space-y-6">
          {/* Itens */}
          <Card className="p-6 bg-white border border-slate-200 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-3 flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-slate-500" />
              <span>Itens do Pedido</span>
            </h3>

            <div className="divide-y divide-slate-100">
              {order.items.map((it) => (
                <div key={it.id} className="py-3 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-bold text-slate-900 block">
                      {it.quantity}x {it.snapshot_product_name}
                    </span>
                    <span className="text-slate-500 block">
                      {it.snapshot_variant_name} ({formatBrl(it.unit_price_cents)} un)
                    </span>
                  </div>
                  <span className="font-bold text-slate-900 font-mono">
                    {formatBrl(it.subtotal_cents)}
                  </span>
                </div>
              ))}
            </div>

            {/* Totais */}
            <div className="pt-3 border-t border-slate-100 space-y-1.5 text-xs text-slate-600">
              <div className="flex justify-between">
                <span>Subtotal dos itens:</span>
                <span className="font-mono">{formatBrl(order.subtotal_cents)}</span>
              </div>
              <div className="flex justify-between">
                <span>Taxa de Entrega:</span>
                <span className="font-mono">{formatBrl(order.delivery_fee_cents)}</span>
              </div>
              <div className="flex justify-between text-sm font-bold text-slate-900 pt-2 border-t border-slate-100">
                <span>Total:</span>
                <span className="font-mono text-base text-slate-950">{formatBrl(order.total_cents)}</span>
              </div>
            </div>
          </Card>

          {/* Endereço & Observações */}
          <Card className="p-6 bg-white border border-slate-200 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-3 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-slate-500" />
              <span>Dados de Entrega / Retirada</span>
            </h3>

            {order.fulfillment_type === 'delivery' && order.address ? (
              <div className="text-xs space-y-1 text-slate-700">
                <p className="font-semibold text-slate-900">
                  {order.address.street}, {order.address.number}
                  {order.address.complement ? ` (${order.address.complement})` : ''}
                </p>
                <p>
                  {order.address.neighborhood} — {order.address.city}/{order.address.state}
                </p>
                <p className="text-slate-500 font-mono">CEP: {order.address.zip_code}</p>
                {order.address.reference && (
                  <p className="pt-1 text-slate-500 italic">
                    Referência: {order.address.reference}
                  </p>
                )}
              </div>
            ) : (
              <div className="text-xs text-slate-600">
                <p className="font-semibold text-slate-900">Retirada no Balcão</p>
                <p className="text-slate-500">O cliente retirará o pedido diretamente no restaurante.</p>
              </div>
            )}

            {order.notes && (
              <div className="pt-3 border-t border-slate-100 text-xs">
                <span className="font-bold text-slate-700 block">Observações do Cliente:</span>
                <p className="text-slate-600 mt-0.5 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                  {order.notes}
                </p>
              </div>
            )}
          </Card>
        </div>

        {/* Coluna 3: Cliente, Pagamento & Timeline de Auditoria */}
        <div className="space-y-6">
          {/* Cliente */}
          <Card className="p-6 bg-white border border-slate-200 shadow-sm space-y-3 text-xs">
            <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">
              Dados do Cliente
            </h3>
            <div>
              <span className="text-slate-400 block text-[11px]">Nome:</span>
              <span className="font-bold text-slate-800 text-sm">{order.customer_name}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">Telefone/WhatsApp:</span>
              <span className="font-semibold text-slate-800 font-mono">{order.customer_phone}</span>
            </div>
            {order.customer_email && (
              <div>
                <span className="text-slate-400 block text-[11px]">E-mail:</span>
                <span className="text-slate-700">{order.customer_email}</span>
              </div>
            )}
          </Card>

          {/* Histórico Imutável de Eventos */}
          <Card className="p-6 bg-white border border-slate-200 shadow-sm space-y-3">
            <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2 flex items-center gap-2">
              <Clock className="w-4 h-4 text-slate-500" />
              <span>Histórico de Status (Audit)</span>
            </h3>

            <div className="space-y-3 text-xs">
              {order.timeline.map((ev, idx) => (
                <div key={ev.id || idx} className="border-l-2 border-slate-200 pl-3 py-0.5 space-y-0.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-800">
                      {ORDER_STATUS_LABELS[ev.to_status as CanonicalOrderStatus] || ev.to_status}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {new Date(ev.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-400 block">
                    Origem: <strong className="text-slate-600">{ev.source}</strong>
                  </span>
                  {ev.metadata?.reason && (
                    <span className="text-[11px] text-red-600 block">
                      Motivo: {ev.metadata.reason}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

