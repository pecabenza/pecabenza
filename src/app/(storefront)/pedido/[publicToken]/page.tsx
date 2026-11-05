'use client';

import React, { use, useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ShoppingBag,
  Clock,
  RefreshCw,
  Truck,
  Store,
  CheckCircle2,
  Calendar,
  ShieldCheck,
  AlertCircle,
} from 'lucide-react';
import { Container } from '@/components/ui/Container';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { OrderTimeline, TimelineEventItem } from '@/components/orders/OrderTimeline';
import { CanonicalOrderStatus, CanonicalPaymentStatus } from '@/modules/orders/order-status.machine';

interface PublicOrderData {
  orderNumber: string;
  publicTrackingToken: string;
  status: CanonicalOrderStatus;
  statusLabel: string;
  paymentStatus: CanonicalPaymentStatus;
  paymentStatusLabel: string;
  fulfillmentType: 'delivery' | 'pickup';
  scheduleType: 'asap' | 'scheduled';
  scheduledFor?: string | null;
  createdAt: string;
  totalCents: number;
  formattedTotal: string;
  formattedDeliveryFee: string;
  customer: {
    name: string;
    phone: string;
  };
  address?: {
    street: string;
    neighborhood: string;
    city: string;
    state: string;
  } | null;
  items: Array<{
    name: string;
    variant: string;
    quantity: number;
    formattedSubtotal: string;
  }>;
  timeline: TimelineEventItem[];
}

interface OrderTrackingPageProps {
  params: Promise<{ publicToken: string }>;
}

export default function PublicOrderTrackingPage({ params }: OrderTrackingPageProps) {
  const { publicToken } = use(params);

  const [order, setOrder] = useState<PublicOrderData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  const fetchOrder = useCallback(
    async (isBackground = false) => {
      if (!isBackground) setIsLoading(true);
      else setIsRefreshing(true);
      setError(null);

      try {
        const res = await fetch(`/api/orders/track/${publicToken}`);
        if (!res.ok) {
          if (res.status === 404) {
            throw new Error('Pedido não localizado ou link de acompanhamento inválido.');
          }
          throw new Error('Erro ao carregar status do pedido.');
        }

        const data: PublicOrderData = await res.json();
        setOrder(data);
      } catch (err: any) {
        setError(err.message || 'Falha de conexão.');
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [publicToken]
  );

  useEffect(() => {
    fetchOrder();
  }, [fetchOrder]);

  // Polling a cada 6 segundos enquanto o pedido não estiver em estado terminal
  useEffect(() => {
    if (!order) return;
    const isTerminal = order.status === 'delivered' || order.status === 'cancelled';
    if (isTerminal) {
      if (pollingRef.current) clearInterval(pollingRef.current);
      return;
    }

    pollingRef.current = setInterval(() => {
      fetchOrder(true);
    }, 6000);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [order?.status, fetchOrder]);

  if (isLoading) {
    return (
      <div className="py-20 bg-tenant-background min-h-[80vh] flex items-center justify-center">
        <Container size="sm">
          <Card className="p-8 text-center space-y-4 bg-tenant-surface border-tenant-border">
            <RefreshCw className="w-8 h-8 text-tenant-primary mx-auto animate-spin" />
            <h2 className="text-base font-bold text-tenant-text">Localizando seu pedido...</h2>
            <p className="text-xs text-tenant-muted">Aguarde um momento enquanto consultamos a cozinha.</p>
          </Card>
        </Container>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="py-20 bg-tenant-background min-h-[80vh] flex items-center justify-center">
        <Container size="sm">
          <Card className="p-8 text-center space-y-4 bg-tenant-surface border-tenant-border">
            <AlertCircle className="w-10 h-10 text-red-500 mx-auto" />
            <h2 className="text-lg font-bold text-tenant-text">Pedido Não Localizado</h2>
            <p className="text-xs text-tenant-muted max-w-sm mx-auto">
              {error || 'Não encontramos nenhum pedido com esse código de acompanhamento.'}
            </p>
            <div className="pt-2">
              <Link
                href="/produtos"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-tenant bg-tenant-primary text-white text-xs font-semibold hover:brightness-110 shadow-sm"
              >
                <ShoppingBag className="w-4 h-4" />
                <span>Voltar ao Cardápio</span>
              </Link>
            </div>
          </Card>
        </Container>
      </div>
    );
  }

  const isPaid = order.paymentStatus === 'paid';
  const isScheduled = order.scheduleType === 'scheduled' && order.scheduledFor;

  return (
    <div className="py-8 sm:py-16 bg-tenant-background min-h-[90vh]">
      <Container size="md">
        {/* Topo / Voltar */}
        <div className="mb-6 flex items-center justify-between">
          <Link
            href="/produtos"
            className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-tenant-muted hover:text-tenant-primary transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Voltar ao Cardápio</span>
          </Link>

          {isRefreshing && (
            <span className="text-xs text-tenant-muted flex items-center gap-1.5 animate-pulse">
              <RefreshCw className="w-3 h-3 animate-spin text-tenant-primary" />
              <span>Atualizando status...</span>
            </span>
          )}
        </div>

        <div className="space-y-6">
          {/* Card Principal: Status & Timeline */}
          <Card className="p-6 sm:p-8 bg-tenant-surface border-tenant-border shadow-md space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-tenant-border/60 pb-6">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="primary" className="text-xs">
                    Pedido {order.orderNumber}
                  </Badge>
                  <Badge
                    variant={isPaid ? 'accent' : 'secondary'}
                    className={`text-xs ${isPaid ? 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20' : ''}`}
                  >
                    {order.paymentStatusLabel}
                  </Badge>
                </div>
                <h1 className="font-heading text-2xl sm:text-3xl font-extrabold text-tenant-text">
                  Acompanhamento do Pedido
                </h1>
                <p className="text-xs text-tenant-muted mt-1">
                  Olá, <strong className="text-tenant-text">{order.customer.name}</strong>! Aqui você vê o progresso em tempo real.
                </p>
              </div>

              {/* Modalidade */}
              <div className="self-start sm:self-auto p-3 rounded-2xl bg-tenant-background border border-tenant-border/60 text-xs space-y-1">
                <span className="text-tenant-muted block font-medium">Modalidade:</span>
                <span className="font-bold text-tenant-text flex items-center gap-1.5">
                  {order.fulfillmentType === 'delivery' ? (
                    <>
                      <Truck className="w-4 h-4 text-tenant-primary" />
                      <span>Entrega Programada</span>
                    </>
                  ) : (
                    <>
                      <Store className="w-4 h-4 text-tenant-primary" />
                      <span>Retirada no Restaurante</span>
                    </>
                  )}
                </span>
              </div>
            </div>

            {/* Alerta de Pedido Agendado */}
            {isScheduled && (
              <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-3">
                <Calendar className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
                <div className="text-xs space-y-0.5">
                  <strong className="text-amber-800 block">Pedido Agendado</strong>
                  <p className="text-amber-700">
                    A produção deste pedido iniciará próximo ao horário agendado:{' '}
                    <strong>
                      {new Date(order.scheduledFor!).toLocaleString('pt-BR', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </strong>.
                  </p>
                </div>
              </div>
            )}

            {/* Timeline Visual */}
            <div className="pt-2">
              <OrderTimeline
                currentStatus={order.status}
                fulfillmentType={order.fulfillmentType}
                timelineEvents={order.timeline}
              />
            </div>
          </Card>

          {/* Card com Detalhes dos Itens e Endereço */}
          <Card className="p-6 sm:p-8 bg-tenant-surface border-tenant-border shadow-md space-y-6">
            <h3 className="font-heading text-lg font-bold text-tenant-text border-b border-tenant-border/60 pb-3">
              Resumo do Pedido
            </h3>

            {/* Itens */}
            <div className="divide-y divide-tenant-border/40">
              {order.items.map((item, idx) => (
                <div key={idx} className="py-3 flex items-center justify-between text-xs">
                  <div className="space-y-0.5">
                    <span className="font-bold text-tenant-text block">
                      {item.quantity}x {item.name}
                    </span>
                    <span className="text-tenant-muted block">{item.variant}</span>
                  </div>
                  <span className="font-semibold text-tenant-text font-mono">
                    {item.formattedSubtotal}
                  </span>
                </div>
              ))}
            </div>

            {/* Endereço Seguro (Sem número de residência para proteção do cliente) */}
            {order.address && (
              <div className="pt-3 border-t border-tenant-border/60 text-xs space-y-1">
                <span className="text-tenant-muted block font-medium">Bairro / Região de Entrega:</span>
                <p className="font-semibold text-tenant-text">
                  {order.address.street}, {order.address.neighborhood} — {order.address.city}/{order.address.state}
                </p>
              </div>
            )}

            {/* Total */}
            <div className="pt-4 border-t border-tenant-border/60 flex items-center justify-between">
              <span className="text-sm font-bold text-tenant-text">Total do Pedido:</span>
              <span className="font-heading text-xl font-extrabold text-tenant-primary">
                {order.formattedTotal}
              </span>
            </div>

            <div className="pt-2 flex items-center justify-center gap-1.5 text-xs text-tenant-muted">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Página segura de acompanhamento • Dados protegidos</span>
            </div>
          </Card>
        </div>
      </Container>
    </div>
  );
}

