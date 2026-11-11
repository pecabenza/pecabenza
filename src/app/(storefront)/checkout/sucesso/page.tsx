'use client';

import React, { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, Clock, ShoppingBag, ArrowRight, Truck, Store, Banknote, CreditCard } from 'lucide-react';
import { Container } from '@/components/ui/Container';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { PixPaymentBox } from '@/components/checkout/PixPaymentBox';

function OrderSuccessContent() {
  const searchParams = useSearchParams();

  const orderId = searchParams.get('orderId') || '';
  const orderNumber = searchParams.get('orderNumber') || '#000101';
  const trackingToken = searchParams.get('trackingToken') || '';
  const total = searchParams.get('total') || 'R$ 0,00';
  const name = searchParams.get('name') || 'Cliente';
  const fulfillment = searchParams.get('fulfillment') || 'delivery';
  const rawPaymentMethod = searchParams.get('paymentMethod') || 'pix';
  const paymentMethod: 'pix' | 'cash' | 'card_on_delivery' =
    rawPaymentMethod === 'cash' || rawPaymentMethod === 'card_on_delivery' ? rawPaymentMethod : 'pix';

  const [isPaid, setIsPaid] = useState(false);

  return (
    <div className="py-10 sm:py-16 bg-tenant-background min-h-[85vh] flex items-center justify-center">
      <Container size="sm">
        <Card className="p-6 sm:p-10 bg-tenant-surface border-tenant-border shadow-lg text-center space-y-6">
          {/* Header do Pedido */}
          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5">
              <Badge variant={isPaid ? 'primary' : 'accent'} className="text-xs">
                {isPaid ? 'Pedido Confirmado' : 'Pedido Registrado'}
              </Badge>
            </div>
            <h1 className="font-heading text-2xl sm:text-3xl font-extrabold text-tenant-text">
              Pedido {orderNumber}
            </h1>
            <p className="text-sm text-tenant-muted">
              Muito obrigado, <strong className="text-tenant-text">{name}</strong>! Recebemos sua solicitação.
            </p>
          </div>

          {/* Resumo do Pedido */}
          <div className="p-5 rounded-2xl bg-tenant-background border border-tenant-border/60 text-left space-y-3">
            <div className="flex items-center justify-between text-xs text-tenant-muted">
              <span>Status do Pagamento:</span>
              <span className={`font-semibold flex items-center gap-1 ${isPaid ? 'text-emerald-600' : 'text-amber-600'}`}>
                {isPaid ? (
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
                    <span>Aguardando Pagamento</span>
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
                    <span>Entrega Programada</span>
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

          {/* Seção Transacional de Pagamento Pix (Etapa 2B) ou Instrução de Pagamento Presencial */}
          {orderId && paymentMethod === 'pix' && (
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
                {paymentMethod === 'cash' ? <Banknote className="w-4 h-4" /> : <CreditCard className="w-4 h-4" />}
                <span>
                  {paymentMethod === 'cash'
                    ? 'Pagamento em dinheiro combinado'
                    : 'Pagamento na maquininha combinado'}
                </span>
              </div>
              <p className="leading-relaxed">
                Seu pedido já foi registrado na cozinha. O pagamento de <strong>{total}</strong> será realizado diretamente no ato da{' '}
                {fulfillment === 'delivery' ? 'entrega' : 'retirada'}.
              </p>
            </div>
          )}

          {/* Atalho para Acompanhamento Público Seguro (Etapa 2C) */}
          {trackingToken && (
            <div className="pt-2">
              <Link
                href={`/pedido/${trackingToken}`}
                className="w-full inline-flex items-center justify-center gap-2 py-3 px-5 rounded-tenant bg-tenant-background border-2 border-tenant-primary text-tenant-primary text-xs font-bold hover:bg-tenant-primary hover:text-white transition-all shadow-sm"
              >
                <Clock className="w-4 h-4" />
                <span>Acompanhar Status do Pedido em Tempo Real</span>
              </Link>
            </div>
          )}

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
