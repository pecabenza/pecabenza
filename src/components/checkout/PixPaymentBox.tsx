'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  QrCode,
  Copy,
  Check,
  Clock,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { PixPaymentResult } from '@/modules/payments/types';

interface PixPaymentBoxProps {
  orderId: string;
  orderNumber?: string;
  onPaymentConfirmed?: () => void;
}

export function PixPaymentBox({
  orderId,
  orderNumber,
  onPaymentConfirmed,
}: PixPaymentBoxProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pixData, setPixData] = useState<PixPaymentResult | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<'pending' | 'paid' | 'expired' | 'failed'>('pending');
  const [copied, setCopied] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState<number>(900); // 15 min default
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // 1. Gera ou recupera cobrança Pix
  const fetchOrGeneratePix = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/orders/${orderId}/pay/pix`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Não foi possível gerar a cobrança Pix.');
      }

      const data: PixPaymentResult = await res.json();
      setPixData(data);
      setPaymentStatus(data.status as any);

      // Calcula tempo restante
      const expiresAt = new Date(data.pixExpiresAt).getTime();
      const diffSeconds = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
      setSecondsRemaining(diffSeconds);
    } catch (err: any) {
      setError(err.message || 'Falha de conexão.');
    } finally {
      setIsLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    if (orderId) {
      fetchOrGeneratePix();
    }
  }, [orderId, fetchOrGeneratePix]);

  // 2. Countdown Timer
  useEffect(() => {
    if (paymentStatus !== 'pending' || secondsRemaining <= 0) return;

    const timer = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setPaymentStatus('expired');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [paymentStatus, secondsRemaining]);

  // 3. Polling de verificação de status a cada 3.5 segundos
  useEffect(() => {
    if (!pixData?.paymentId || paymentStatus !== 'pending') {
      if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
      return;
    }

    const checkStatus = async () => {
      try {
        const res = await fetch(`/api/payments/${pixData.paymentId}/status`);
        if (!res.ok) return;

        const data = await res.json();
        if (data.status === 'paid') {
          setPaymentStatus('paid');
          if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
          if (onPaymentConfirmed) onPaymentConfirmed();
        } else if (data.status === 'expired') {
          setPaymentStatus('expired');
          if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
        }
      } catch {
        // Polling silencioso
      }
    };

    pollingIntervalRef.current = setInterval(checkStatus, 3500);

    return () => {
      if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
    };
  }, [pixData?.paymentId, paymentStatus, onPaymentConfirmed]);

  // 4. Copiar código Pix Copia e Cola
  const handleCopyPix = async () => {
    if (!pixData?.pixQrCodeText) return;

    try {
      await navigator.clipboard.writeText(pixData.pixQrCodeText);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      // Fallback
      const textArea = document.createElement('textarea');
      textArea.value = pixData.pixQrCodeText;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    }
  };

  const formatCountdown = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  // Estado 1: Carregando
  if (isLoading) {
    return (
      <div className="p-8 text-center bg-tenant-surface rounded-2xl border border-tenant-border/60 shadow-sm space-y-4">
        <RefreshCw className="w-8 h-8 text-tenant-primary mx-auto animate-spin" />
        <p className="text-sm font-semibold text-tenant-text">
          Gerando seu QR Code Pix seguro...
        </p>
        <p className="text-xs text-tenant-muted">
          Aguarde um momento enquanto conectamos à câmara de pagamentos.
        </p>
      </div>
    );
  }

  // Estado 2: Erro ao gerar
  if (error) {
    return (
      <div className="p-6 text-center bg-red-500/5 rounded-2xl border border-red-500/20 space-y-3">
        <AlertCircle className="w-8 h-8 text-red-500 mx-auto" />
        <h3 className="text-sm font-bold text-red-600">Erro ao carregar pagamento</h3>
        <p className="text-xs text-tenant-muted">{error}</p>
        <button
          onClick={fetchOrGeneratePix}
          className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-tenant-primary text-white text-xs font-semibold hover:brightness-110 transition-all shadow-sm"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Tentar Novamente</span>
        </button>
      </div>
    );
  }

  // Estado 3: Pagamento Confirmado (Sucesso em Tempo Real)
  if (paymentStatus === 'paid') {
    return (
      <div className="p-8 text-center bg-emerald-500/10 rounded-2xl border border-emerald-500/30 shadow-sm space-y-4 animate-in fade-in duration-500">
        <div className="w-16 h-16 rounded-full bg-emerald-500 text-white mx-auto flex items-center justify-center shadow-md">
          <CheckCircle2 className="w-9 h-9 stroke-[2.5]" />
        </div>
        <div className="space-y-1">
          <h3 className="font-heading text-xl font-bold text-emerald-800">
            Pagamento Pix Confirmado!
          </h3>
          <p className="text-sm text-emerald-700">
            Identificamos seu pagamento instantaneamente. Seu pedido {orderNumber || ''} foi enviado para a cozinha!
          </p>
        </div>
        <div className="pt-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-600/15 text-emerald-800 text-xs font-semibold">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Transação Liquidada com Segurança</span>
          </span>
        </div>
      </div>
    );
  }

  // Estado 4: Expirado
  if (paymentStatus === 'expired') {
    return (
      <div className="p-8 text-center bg-amber-500/5 rounded-2xl border border-amber-500/20 shadow-sm space-y-4">
        <Clock className="w-10 h-10 text-amber-500 mx-auto" />
        <div className="space-y-1">
          <h3 className="text-base font-bold text-tenant-text">
            Este código Pix expirou
          </h3>
          <p className="text-xs text-tenant-muted max-w-sm mx-auto">
            Por segurança bancária, os códigos Pix dinâmicos têm validade de 15 minutos. Clique abaixo para gerar um novo código.
          </p>
        </div>
        <button
          onClick={fetchOrGeneratePix}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-tenant bg-tenant-primary text-white text-xs font-semibold hover:brightness-110 transition-all shadow-sm"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Gerar Novo Pix</span>
        </button>
      </div>
    );
  }

  // Estado 5: Pagamento Pendente com QR Code + Copia e Cola
  return (
    <div className="p-6 sm:p-8 bg-tenant-surface rounded-3xl border border-tenant-border shadow-md space-y-6">
      {/* Header do Pix */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-tenant-border/60 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-teal-500/10 text-teal-600 flex items-center justify-center">
            <QrCode className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-tenant-text">Pague com Pix</h3>
            <p className="text-xs text-tenant-muted">Aprovação imediata em qualquer banco</p>
          </div>
        </div>

        {/* Contador Regressivo */}
        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/10 text-amber-700 text-xs font-medium self-start sm:self-auto border border-amber-500/20">
          <Clock className="w-3.5 h-3.5 animate-pulse text-amber-600" />
          <span>Expira em: <strong>{formatCountdown(secondsRemaining)}</strong></span>
        </div>
      </div>

      {/* QR Code Imagem */}
      {pixData?.pixQrCodeBase64 && (
        <div className="flex flex-col items-center justify-center p-4 bg-white rounded-2xl border border-slate-200/80 max-w-[280px] mx-auto shadow-sm">
          <img
            src={pixData.pixQrCodeBase64}
            alt="QR Code Pix"
            className="w-56 h-56 object-contain"
          />
          <p className="mt-2 text-[11px] font-medium text-slate-500 text-center">
            Abra o app do seu banco e aponte a câmera
          </p>
        </div>
      )}

      {/* Copia e Cola */}
      <div className="space-y-2">
        <label className="block text-xs font-semibold text-tenant-text text-left">
          Ou use o Pix Copia e Cola:
        </label>
        <div className="relative">
          <input
            type="text"
            readOnly
            value={pixData?.pixQrCodeText || ''}
            className="w-full pl-3 pr-28 py-3 rounded-xl bg-tenant-background border border-tenant-border text-xs text-tenant-muted font-mono truncate focus:outline-none focus:border-tenant-primary select-all"
          />
          <button
            type="button"
            onClick={handleCopyPix}
            className={`absolute right-1.5 top-1.5 bottom-1.5 px-3.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 shadow-sm ${
              copied
                ? 'bg-emerald-600 text-white'
                : 'bg-tenant-primary text-white hover:brightness-110'
            }`}
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>Copiado!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copiar código</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Status da Transação em Tempo Real */}
      <div className="p-3.5 rounded-xl bg-tenant-background border border-tenant-border/60 flex items-center justify-between text-xs">
        <span className="text-tenant-muted flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
          Aguardando confirmação do banco...
        </span>
        <span className="font-semibold text-tenant-primary">Tempo real</span>
      </div>
    </div>
  );
}
