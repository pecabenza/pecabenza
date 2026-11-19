'use client';

import React, { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  CheckCircle2,
  Clock,
  ShoppingBag,
  ArrowRight,
  Truck,
  Store,
  Banknote,
  CreditCard,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { Container } from '@/components/ui/Container';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { PixPaymentBox } from '@/components/checkout/PixPaymentBox';

interface VerifiedOrderSummary {
  orderNumber: string;
  publicTrackingToken: string;
  status: string;
  statusLabel: string;
  paymentStatus: 'pending' | 'paid' | string;
  fulfillmentType: 'delivery' | 'pickup';
  scheduleType: 'asap' | 'scheduled';
  formattedTotal: string;
  customer: { name: string };
}

function OrderSuccessContent() {
  const searchParams = useSearchParams();

  const orderId = searchParams.get('orderId') || '';
  const trackingToken = searchParams.get('trackingToken') || '';
  const rawPaymentMethod = searchParams.get('paymentMethod') || 'pix';
  const paymentMethod: 'pix' | 'cash' | 'card_on_delivery' =
    rawPaymentMethod === 'cash' || rawPaymentMethod === 'card_on_delivery'
      ? rawPaymentMethod
      : 'pix';

  const [verifiedOrder, setVerifiedOrder] = useState<VerifiedOrderSummary | null>(null);
  const [isLoadingOrder, setIsLoadingOrder] = useState(Boolean(trackingToken));
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isPaid, setIsPaid] = useState(false);

  useEffect(() => {
    if (!trackingToken) {
      setIsLoadingOrder(false);
      return;
    }

    let active = true;
    fetch(`/api/orders/track/${encodeURIComponent(trackingToken)}`, { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error('Não foi possível confirmar os dados deste pedido no servidor.');
        }
        return res.json();
      })
      .then((data: VerifiedOrderSummary) => {
        if (!active) return;
        setVerifiedOrder(data);
        if (data.paymentStatus === 'paid') {
          setIsPaid(true);
        }
      })
      .catch((err: unknown) => {
        if (!active) return;
        setLoadError(
          (err as { message?: string })?.message || 'Erro ao carregar resumo oficial do pedido.'
        );
      })
      .finally(() => {
        if (active) setIsLoadingOrder(false);
      });

    return () => {
      active = false;
    };
  }, [trackingToken]);

  if (isLoadingOrder) {
    return (
      <div className="py-20 bg-tenant-background min-h-[85vh] flex items-center justify-center">
        <Container size="sm">
          <Card className="p-8 text-center space-y-3 bg-tenant-surface border-tenant-border">
            <RefreshCw className="w-7 h-7 text-tenant-primary mx-auto animate-spin" />
            <p className="text-sm font-bold text-tenant-text">Confirmando registro do pedido...</p>
          </Card>
        </Container>
      </div>
    );
  }

  if (!trackingToken || loadError || !verifiedOrder) {
    return (
      <div className="py-16 bg-tenant-background min-h-[85vh] flex items-center justify-center">
        <Container size="sm">
          <Card className="p-8 text-center space-y-4 bg-tenant-surface border-tenant-border">
            <AlertCircle className="w-10 h-10 text-amber-600 mx-auto" />
            <h1 className="font-heading text-xl font-bold text-tenant-text">
              Pedido não identificado
            </h1>
            <p className="text-xs text-tenant-muted max-w-sm mx-auto">
              {loadError ||
                'Não foi possível localizar um pedido válido para esta página de confirmação.'}
            </p>
            <Link
              href="/produtos"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-tenant bg-tenant-primary text-white text-xs font-semibold"
            >
              <ShoppingBag className="w-4 h-4" />
              <span>Voltar ao Cardápio</span>
            </Link>
          </Card>
        </Container>
      </div>
    );
  }

  const orderNumber = verifiedOrder.orderNumber;
  const total = verifiedOrder.formattedTotal;
  const name = verifiedOrder.customer.name;
  const fulfillment = verifiedOrder.fulfillmentType;
  const effectivePaid = isPaid || verifiedOrder.paymentStatus === 'paid';

  return (
    <div className="py-10 sm:py-16 bg-tenant-background min-h-[85vh] flex items-center justify-center">
      <Container size="sm">
        <Card className="p-6 sm:p-10 bg-tenant-surface border-tenant-border shadow-lg text-center space-y-6">
          {/* Header do Pedido (separa registro do pedido de confirmação de pagamento) */}
          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 flex-wrap justify-center">
              <Badge variant="accent" className="text-xs">
                Pedido Registrado ({verifiedOrder.statusLabel})
              </Badge>
              {effectivePaid && (
                <Badge variant="primary" className="text-xs bg-emerald-600 text-white border-none">
                  Pagamento Confirmado
                </Badge>
              )}
            </div>
            <h1 className="font-heading text-2xl sm:text-3xl font-extrabold text-tenant-text">
              Pedido {orderNumber}
            </h1>
            <p className="text-sm text-tenant-muted">
              Muito obrigado, <strong className="text-tenant-text">{name}</strong>! Recebemos sua
              solicitação.
            </p>
          </div>

          {/* Resumo Oficial do Pedido */}
          <div className="p-5 rounded-2xl bg-tenant-background border border-tenant-border/60 text-left space-y-3">
            <div className="flex items-center justify-between text-xs text-tenant-muted">
              <span>Status do Pagamento:</span>
              <span
                className={`font-semibold flex items-center gap-1 ${
                  effectivePaid ? 'text-emerald-600' : 'text-amber-600'
                }`}
              >
                {effectivePaid ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Pago com Pix</span>
                  </>
                ) : paymentMethod === 'cash' ? (
                  <>
                    <Banknote className="w-3.5 h-3.5" />
                    <span>Dinheiro na {fulfillment === 'delivery' ? 'Entrega' : 'Retirada'}</span>
                  </>
                ) : paymentMethod === 'card_on_delivery' ? (
                  <>
                    <CreditCard className="w-3.5 h-3.5" />
                    <span>Cartão na {fulfillment === 'delivery' ? 'Entrega' : 'Retirada'}</span>
                  </>
                ) : (
                  <>
                    <Clock className="w-3.5 h-3.5" />
                    <span>Aguardando Pagamento Pix</span>
                  </>
                )}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs text-tenant-muted">
              <span>Modalidade:</span>
              <span className="font-semibold text-tenant-text flex items-center gap-1">
                {fulfillment === 'delivery' ? (
                  <>
                    <Truck className="w-3.5 h-3.5 text-tenant-primary" />
                    <span>
                      {verifiedOrder.scheduleType === 'scheduled'
                        ? 'Entrega Agendada'
                        : 'Entrega'}
                    </span>
                  </>
                ) : (
                  <>
                    <Store className="w-3.5 h-3.5 text-tenant-primary" />
                    <span>Retirada no Local</span>
                  </>
                )}
              </span>
            </div>

            <div className="pt-2 border-t border-tenant-border/40 flex items-center justify-between">
              <span className="text-sm font-bold text-tenant-text">Valor Total:</span>
              <span className="font-heading font-extrabold text-xl text-tenant-primary">
                {total}
              </span>
            </div>
          </div>

          {/* Seção Transacional de Pagamento Pix ou Instrução de Pagamento Presencial */}
          {orderId && paymentMethod === 'pix' && !effectivePaid && (
            <div className="pt-2">
              <PixPaymentBox
                orderId={orderId}
                orderNumber={orderNumber}
                onPaymentConfirmed={() => setIsPaid(true)}
              />
            </div>
          )}

          {orderId && paymentMethod !== 'pix' && (
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-left space-y-1.5 text-xs text-emerald-800 dark:text-emerald-200">
              <div className="flex items-center gap-2 font-bold text-sm">
                {paymentMethod === 'cash' ? (
                  <Banknote className="w-4 h-4" />
                ) : (
                  <CreditCard className="w-4 h-4" />
                )}
                <span>
                  {paymentMethod === 'cash'
                    ? 'Pagamento em dinheiro combinado'
                    : 'Pagamento na maquininha combinado'}
                </span>
              </div>
              <p className="leading-relaxed">
                Seu pedido foi registrado. O pagamento de <strong>{total}</strong> será realizado
                diretamente no ato da {fulfillment === 'delivery' ? 'entrega' : 'retirada'}.
              </p>
            </div>
          )}

          {/* Atalho para Acompanhamento Público Seguro */}
          <div className="pt-2">
            <Link
              href={`/pedido/${verifiedOrder.publicTrackingToken}`}
              className="w-full inline-flex items-center justify-center gap-2 py-3 px-5 rounded-tenant bg-tenant-background border-2 border-tenant-primary text-tenant-primary text-xs font-bold hover:bg-tenant-primary hover:text-white transition-all shadow-sm"
            >
              <Clock className="w-4 h-4" />
              <span>Acompanhar Status do Pedido em Tempo Real</span>
            </Link>
          </div>

          <div className="pt-4">
            <Link
              href="/produtos"
              className="w-full inline-flex items-center justify-center gap-2 py-3.5 px-6 rounded-tenant bg-tenant-primary text-white text-sm font-semibold uppercase tracking-wider hover:brightness-110 transition-all shadow-md group"
            >
              <ShoppingBag className="w-4 h-4" />
              <span>Voltar ao Cardápio</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>
        </Card>
      </Container>
    </div>
  );
}

export default function OrderSuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="py-24 text-center text-sm text-tenant-muted">
          Carregando informações do pedido...
        </div>
      }
    >
      <OrderSuccessContent />
    </Suspense>
  );
}
