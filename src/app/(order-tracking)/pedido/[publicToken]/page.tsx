'use client';

import React, { use, useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ShoppingBag,
  RefreshCw,
  Truck,
  Store,
  CheckCircle2,
  Calendar,
  AlertCircle,
  MapPin,
  Navigation,
  UserCheck,
  MessageCircle,
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
  delivery?: {
    status: string;
    statusLabel: string;
    driverFirstName: string | null;
    stopSequence: number;
    dispatchedAt?: string | null;
    arrivedAt?: string | null;
    deliveredAt?: string | null;
    proofSummary?: {
      recipientName: string;
      relationshipLabel: string;
    } | null;
    liveLocation?: {
      latitude: number;
      longitude: number;
      recordedAt: string;
    } | null;
  } | null;
  deliveredThankYouMessage?: string | null;
  supportWhatsapp?: string | null;
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

function buildOrderWhatsAppHelpUrl(rawPhone?: string | null, orderNumber?: string): string | null {
  if (!rawPhone) return null;
  const digits = rawPhone.replace(/\D/g, '');
  if (digits.length < 10) return null;
  const fullNumber = digits.startsWith('55') ? digits : `55${digits}`;
  const text = encodeURIComponent(
    `Olá! Preciso de ajuda com o meu pedido ${orderNumber || ''}.`.trim()
  );
  return `https://wa.me/${fullNumber}?text=${text}`;
}

export default function PublicOrderTrackingPage({ params }: OrderTrackingPageProps) {
  const { publicToken } = use(params);

  const [order, setOrder] = useState<PublicOrderData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshWarning, setRefreshWarning] = useState<string | null>(null);

  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const inFlightRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const hasLoadedOrderRef = useRef(false);

  const fetchOrder = useCallback(
    async (isBackground = false) => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;

      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        await Promise.resolve();
        if (!isBackground && !hasLoadedOrderRef.current) {
          setIsLoading(true);
          setError(null);
        } else {
          setIsRefreshing(true);
        }

        const res = await fetch(`/api/orders/track/${publicToken}`, {
          signal: controller.signal,
          cache: 'no-store',
        });

        if (!res.ok) {
          if (res.status === 404 || res.status === 400) {
            throw new Error('Pedido não localizado ou link de acompanhamento inválido.');
          }
          throw new Error('Erro ao carregar status do pedido.');
        }

        const data: PublicOrderData = await res.json();
        hasLoadedOrderRef.current = true;
        setOrder(data);
        setError(null);
        setRefreshWarning(null);
      } catch (err: unknown) {
        const errorObj = err as { name?: string; message?: string };
        if (errorObj?.name === 'AbortError') return;

        // Se o pedido já estava carregado na tela, preserva os dados e exibe aviso leve
        if (hasLoadedOrderRef.current) {
          setRefreshWarning(
            'Não foi possível atualizar o status agora. Mantivemos a última posição e tentaremos novamente em instantes.'
          );
        } else {
          setError(errorObj?.message || 'Falha de conexão ao consultar o pedido.');
        }
      } finally {
        inFlightRef.current = false;
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [publicToken]
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchOrder(false);
    }, 0);
    return () => {
      clearTimeout(timer);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchOrder]);

  const currentStatus = order?.status;

  // Polling a cada 6s apenas enquanto o pedido não for terminal e a aba estiver visível
  useEffect(() => {
    if (!currentStatus) return;
    const isTerminal = currentStatus === 'delivered' || currentStatus === 'cancelled';
    if (isTerminal) {
      if (pollingRef.current) clearInterval(pollingRef.current);
      return;
    }

    const startPolling = () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
      pollingRef.current = setInterval(() => {
        if (typeof document === 'undefined' || document.visibilityState === 'visible') {
          void fetchOrder(true);
        }
      }, 6000);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void fetchOrder(true);
        startPolling();
      } else if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };

    startPolling();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [currentStatus, fetchOrder]);

  if (isLoading) {
    return (
      <div className="py-16 sm:py-24 bg-tenant-background min-h-[75vh] flex items-center justify-center">
        <Container size="sm">
          <Card className="p-8 text-center space-y-4 bg-tenant-surface border-tenant-border">
            <RefreshCw className="w-8 h-8 text-tenant-primary mx-auto animate-spin motion-reduce:animate-none" />
            <h1 className="text-base font-bold text-tenant-text">Localizando seu pedido...</h1>
            <p className="text-xs text-tenant-muted">
              Aguarde um momento enquanto consultamos o andamento na cozinha.
            </p>
          </Card>
        </Container>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="py-16 sm:py-24 bg-tenant-background min-h-[75vh] flex items-center justify-center">
        <Container size="sm">
          <Card className="p-8 text-center space-y-4 bg-tenant-surface border-tenant-border">
            <AlertCircle className="w-10 h-10 text-red-500 mx-auto" />
            <h1 className="text-lg font-bold text-tenant-text">Pedido Não Localizado</h1>
            <p className="text-xs text-tenant-muted max-w-sm mx-auto">
              {error || 'Não encontramos nenhum pedido com esse código de acompanhamento.'}
            </p>
            <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => fetchOrder(false)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-tenant bg-tenant-background border border-tenant-border text-tenant-text text-xs font-semibold hover:border-tenant-primary transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Tentar novamente</span>
              </button>
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
  const isScheduled = order.scheduleType === 'scheduled' && Boolean(order.scheduledFor);
  const whatsappHelpUrl = buildOrderWhatsAppHelpUrl(order.supportWhatsapp, order.orderNumber);

  return (
    <div className="py-6 sm:py-10 bg-tenant-background">
      <Container size="md">
        {/* Topo discreto */}
        <div className="mb-5 flex items-center justify-between gap-2">
          <Link
            href="/produtos"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-tenant-muted hover:text-tenant-primary transition-colors motion-reduce:transition-none"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Voltar ao cardápio</span>
          </Link>

          {isRefreshing && (
            <span className="text-xs text-tenant-muted flex items-center gap-1.5">
              <RefreshCw className="w-3 h-3 animate-spin motion-reduce:animate-none text-tenant-primary" />
              <span>Atualizando...</span>
            </span>
          )}
        </div>

        <div className="space-y-6">
          {/* Aviso não intrusivo caso uma atualização em background falhe */}
          {refreshWarning && (
            <div
              role="status"
              className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-between gap-3 text-xs text-amber-900"
            >
              <span>{refreshWarning}</span>
              <button
                type="button"
                onClick={() => fetchOrder(true)}
                className="font-bold underline hover:no-underline shrink-0"
              >
                Atualizar agora
              </button>
            </div>
          )}

          {/* 1. Card Principal: Identificação, Status e Linha do Tempo */}
          <Card className="p-5 sm:p-8 bg-tenant-surface border-tenant-border shadow-md space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-tenant-border/60 pb-5">
              <div className="space-y-1.5">
                <p className="text-xs font-bold uppercase tracking-wider text-tenant-muted">
                  Acompanhe seu pedido
                </p>
                <div className="flex flex-wrap items-center gap-2.5">
                  <h1 className="font-heading text-2xl sm:text-3xl font-extrabold text-tenant-text">
                    Pedido {order.orderNumber} • {order.customer.name}
                  </h1>
                </div>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Badge variant="primary" className="text-xs font-bold">
                    {order.status === 'ready'
                      ? order.fulfillmentType === 'delivery'
                        ? 'Pronto · Aguardando Entregador'
                        : 'Pronto para Retirada'
                      : order.statusLabel}
                  </Badge>
                  <Badge
                    variant={isPaid ? 'accent' : 'secondary'}
                    className={`text-xs ${
                      isPaid ? 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20' : ''
                    }`}
                  >
                    {order.paymentStatusLabel}
                  </Badge>
                </div>
              </div>

              {/* Modalidade real (sem exibir "Entrega Programada" para pedidos imediatos) */}
              <div className="self-start p-3 rounded-2xl bg-tenant-background border border-tenant-border/60 text-xs space-y-0.5">
                <span className="text-tenant-muted block font-medium">Modalidade:</span>
                <span className="font-bold text-tenant-text flex items-center gap-1.5">
                  {order.fulfillmentType === 'delivery' ? (
                    <>
                      <Truck className="w-4 h-4 text-tenant-primary" />
                      <span>Entrega</span>
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

            {/* Nota de Agradecimento quando o pedido é Entregue / Finalizado */}
            {order.status === 'delivered' && (
              <div className="p-5 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 flex items-start gap-3.5">
                <CheckCircle2 className="w-6 h-6 text-emerald-600 mt-0.5 shrink-0" />
                <div className="space-y-1">
                  <strong className="text-sm sm:text-base font-extrabold text-emerald-900 block">
                    Pedido finalizado com sucesso!
                  </strong>
                  <p className="text-xs sm:text-sm text-emerald-800 leading-relaxed">
                    {order.deliveredThankYouMessage ||
                      'Seu pedido foi entregue! 🤎 Obrigado por escolher a BENZA. Esperamos que cada garfada seja especial. Bom apetite!'}
                  </p>
                </div>
              </div>
            )}

            {/* Alerta de Pedido Agendado (exibido exclusivamente quando houver agendamento) */}
            {isScheduled && order.scheduledFor && (
              <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-3">
                <Calendar className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
                <div className="text-xs space-y-0.5">
                  <strong className="text-amber-800 block">Horário Agendado</strong>
                  <p className="text-amber-700">
                    Programado para{' '}
                    <strong>
                      {new Date(order.scheduledFor).toLocaleString('pt-BR', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </strong>
                    .
                  </p>
                </div>
              </div>
            )}

            {/* 2. Andamento do pedido (Timeline Visual) */}
            <div className="pt-1">
              <h2 className="text-xs font-bold uppercase tracking-wider text-tenant-muted mb-3">
                Andamento do pedido
              </h2>
              <OrderTimeline
                currentStatus={order.status}
                fulfillmentType={order.fulfillmentType}
                timelineEvents={order.timeline}
              />
            </div>

            {/* 3. Situação da Entrega (Rastreamento Logístico Dedicado) */}
            {order.fulfillmentType === 'delivery' && order.delivery && (
              <div className="p-4 rounded-2xl bg-tenant-background border border-tenant-border/70 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Truck className="w-4 h-4 text-tenant-primary" />
                    <span className="text-xs font-bold text-tenant-text">
                      Entrega: {order.delivery.statusLabel}
                    </span>
                  </div>
                  {order.delivery.driverFirstName && (
                    <span className="text-[11px] bg-tenant-surface border border-tenant-border px-2.5 py-1 rounded-full text-tenant-muted">
                      Entregador:{' '}
                      <strong className="text-tenant-text">{order.delivery.driverFirstName}</strong>
                      {order.delivery.stopSequence > 0 && ` • Parada #${order.delivery.stopSequence}`}
                    </span>
                  )}
                </div>

                {order.delivery.liveLocation && (
                  <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs">
                    <div className="flex items-center gap-2 text-emerald-800">
                      <Navigation className="w-4 h-4 text-emerald-600 animate-pulse motion-reduce:animate-none" />
                      <div>
                        <span className="font-semibold block">Localização em rota compartilhada</span>
                        <span className="text-[11px] text-emerald-700">
                          Atualizada às{' '}
                          {new Date(order.delivery.liveLocation.recordedAt).toLocaleTimeString(
                            'pt-BR',
                            {
                              hour: '2-digit',
                              minute: '2-digit',
                            }
                          )}
                        </span>
                      </div>
                    </div>
                    <a
                      href={`https://www.google.com/maps?q=${order.delivery.liveLocation.latitude},${order.delivery.liveLocation.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-700 transition-colors motion-reduce:transition-none"
                    >
                      <MapPin className="w-3.5 h-3.5" />
                      <span>Ver posição</span>
                    </a>
                  </div>
                )}

                {order.delivery.proofSummary && (
                  <div className="flex items-center gap-2.5 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-800">
                    <UserCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>
                      Recebido por <strong>{order.delivery.proofSummary.recipientName}</strong> (
                      {order.delivery.proofSummary.relationshipLabel})
                      {order.delivery.deliveredAt &&
                        ` às ${new Date(order.delivery.deliveredAt).toLocaleTimeString('pt-BR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}`}
                    </span>
                  </div>
                )}
              </div>
            )}
          </Card>

          {/* 4. Resumo do Pedido */}
          <Card className="p-5 sm:p-8 bg-tenant-surface border-tenant-border shadow-md space-y-5">
            <h2 className="font-heading text-lg font-bold text-tenant-text border-b border-tenant-border/60 pb-3">
              Resumo do pedido
            </h2>

            <div className="divide-y divide-tenant-border/40">
              {order.items.map((item, idx) => (
                <div key={idx} className="py-3 flex items-center justify-between gap-3 text-xs sm:text-sm">
                  <div className="min-w-0">
                    <span className="font-bold text-tenant-text block">
                      {item.quantity}× {item.name}
                    </span>
                    {item.variant && (
                      <span className="text-xs text-tenant-muted block">{item.variant}</span>
                    )}
                  </div>
                  <span className="font-semibold text-tenant-text font-mono shrink-0">
                    {item.formattedSubtotal}
                  </span>
                </div>
              ))}
            </div>

            {/* Endereço Seguro (Sem número de residência para proteção do cliente) */}
            {order.address && (
              <div className="pt-3 border-t border-tenant-border/60 text-xs space-y-1">
                <span className="text-tenant-muted block font-medium">
                  Bairro / Região de Entrega:
                </span>
                <p className="font-semibold text-tenant-text">
                  {order.address.street}, {order.address.neighborhood} — {order.address.city}/
                  {order.address.state}
                </p>
              </div>
            )}

            {/* Total */}
            <div className="pt-4 border-t border-tenant-border/60 flex items-center justify-between">
              <span className="text-sm font-bold text-tenant-text">Total</span>
              <span className="font-heading text-2xl font-extrabold text-tenant-primary">
                {order.formattedTotal}
              </span>
            </div>
          </Card>

          {/* 5. Ajuda e Atendimento + Retorno discreto ao cardápio */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1 text-xs text-tenant-muted">
            {whatsappHelpUrl ? (
              <a
                href={whatsappHelpUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-tenant-surface border border-tenant-border text-tenant-text font-semibold hover:border-tenant-primary hover:text-tenant-primary transition-colors motion-reduce:transition-none"
              >
                <MessageCircle className="w-4 h-4 text-emerald-600" />
                <span>Falar com o atendimento sobre o pedido {order.orderNumber}</span>
              </a>
            ) : (
              <span />
            )}

            <Link
              href="/produtos"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-tenant-muted hover:text-tenant-primary underline-offset-4 hover:underline"
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              <span>Voltar ao cardápio</span>
            </Link>
          </div>
        </div>
      </Container>
    </div>
  );
}

