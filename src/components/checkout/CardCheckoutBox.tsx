'use client';

import React, { useEffect, useState } from 'react';
import { CreditCard, ExternalLink, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';

interface CardCheckoutBoxProps {
  orderId: string;
  orderNumber: string;
  onPaymentConfirmed?: () => void;
}

export function CardCheckoutBox({
  orderId,
  orderNumber,
  onPaymentConfirmed,
}: CardCheckoutBoxProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [paid, setPaid] = useState(false);

  useEffect(() => {
    let active = true;
    const currentUrl = typeof window !== 'undefined' ? window.location.href : undefined;

    fetch(`/api/orders/${orderId}/pay/card`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ successUrl: currentUrl }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data?.error || 'Não foi possível gerar o link de pagamento por cartão.');
        }
        return data;
      })
      .then((data) => {
        if (!active) return;
        setCheckoutUrl(data.checkoutUrl);
        setPaymentId(data.paymentId);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError((err as { message?: string })?.message || 'Erro ao iniciar checkout Asaas.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [orderId]);

  useEffect(() => {
    if (!paymentId || paid) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/payments/${paymentId}/status`, { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (data.status === 'paid') {
          setPaid(true);
          onPaymentConfirmed?.();
        }
      } catch {
        // Silencioso no polling
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [paymentId, paid, onPaymentConfirmed]);

  if (loading) {
    return (
      <div className="p-5 rounded-2xl border border-tenant-border bg-tenant-background flex items-center justify-center gap-2 text-xs text-tenant-muted">
        <Loader2 className="w-4 h-4 animate-spin text-tenant-primary" />
        <span>Preparando checkout seguro do Asaas para o pedido {orderNumber}...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-700 flex items-start gap-2 text-left">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
        <span>{error}</span>
      </div>
    );
  }

  if (paid) {
    return (
      <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-800 flex items-center justify-center gap-2 font-bold">
        <CheckCircle2 className="w-4 h-4" />
        <span>Pagamento com Cartão confirmado!</span>
      </div>
    );
  }

  return (
    <div className="p-5 rounded-2xl border border-tenant-border bg-tenant-background space-y-3 text-left">
      <div className="flex items-center gap-2 text-sm font-bold text-tenant-text">
        <CreditCard className="w-4 h-4 text-tenant-primary" />
        <span>Pagamento Online com Cartão (Asaas)</span>
      </div>
      <p className="text-xs text-tenant-muted leading-relaxed">
        Clique no botão abaixo para abrir o ambiente seguro do Asaas e concluir o pagamento do pedido{' '}
        <strong>{orderNumber}</strong>. Esta página atualiza automaticamente assim que o pagamento for aprovado.
      </p>
      {checkoutUrl && (
        <a
          href={checkoutUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full inline-flex items-center justify-center gap-2 py-3 px-4 rounded-tenant bg-tenant-primary text-white text-xs font-bold uppercase tracking-wider hover:brightness-110 transition-all shadow-sm"
        >
          <span>Pagar com Cartão no Checkout Asaas</span>
          <ExternalLink className="w-4 h-4" />
        </a>
      )}
    </div>
  );
}

