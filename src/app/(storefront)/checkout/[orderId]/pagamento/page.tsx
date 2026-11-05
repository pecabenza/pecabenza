'use client';

import React, { use, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ShoppingBag } from 'lucide-react';
import { Container } from '@/components/ui/Container';
import { PixPaymentBox } from '@/components/checkout/PixPaymentBox';

interface PaymentPageProps {
  params: Promise<{ orderId: string }>;
}

export default function OrderPaymentPage({ params }: PaymentPageProps) {
  const { orderId } = use(params);
  const [isPaid, setIsPaid] = useState(false);

  return (
    <div className="py-10 sm:py-16 bg-tenant-background min-h-[85vh]">
      <Container size="sm">
        <div className="mb-6">
          <Link
            href="/produtos"
            className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-tenant-muted hover:text-tenant-primary transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Voltar ao Cardápio</span>
          </Link>
        </div>

        <div className="space-y-6">
          <div className="text-center space-y-2">
            <h1 className="font-heading text-2xl sm:text-3xl font-extrabold text-tenant-text">
              {isPaid ? 'Pagamento Concluído' : 'Finalizar com Pix'}
            </h1>
            <p className="text-xs sm:text-sm text-tenant-muted">
              {isPaid
                ? 'Seu pagamento foi confirmado com sucesso.'
                : 'Escaneie o QR Code ou copie o código Pix para pagar.'}
            </p>
          </div>

          <PixPaymentBox
            orderId={orderId}
            onPaymentConfirmed={() => setIsPaid(true)}
          />

          <div className="pt-2 text-center">
            <Link
              href="/produtos"
              className="inline-flex items-center gap-2 text-xs font-semibold text-tenant-primary hover:underline"
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              <span>Continuar navegando no cardápio</span>
            </Link>
          </div>
        </div>
      </Container>
    </div>
  );
}
