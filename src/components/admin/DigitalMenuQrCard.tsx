'use client';

import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { QrCode, Copy, Check, Download, ExternalLink } from 'lucide-react';

export function DigitalMenuQrCard() {
  const [menuUrl, setMenuUrl] = useState('/cardapio');
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const fullUrl =
      typeof window !== 'undefined' ? `${window.location.origin}/cardapio` : '/cardapio';
    const timer = setTimeout(() => {
      setMenuUrl(fullUrl);
      QRCode.toDataURL(fullUrl, {
        width: 320,
        margin: 2,
        color: { dark: '#1C1917', light: '#FFFFFF' },
      })
        .then((dataUrl) => setQrDataUrl(dataUrl))
        .catch(() => {});
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const handleCopy = () => {
    navigator.clipboard.writeText(menuUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-white rounded-xl border border-stone-200 shadow-sm p-5 space-y-4">
      <div className="border-b border-stone-100 pb-3">
        <h3 className="font-bold text-stone-900 flex items-center gap-2">
          <QrCode className="w-4 h-4 text-amber-600" />
          Link &amp; QR Code do Cardápio Digital (/cardapio)
        </h3>
        <p className="text-xs text-stone-500">
          Versão compacta ideal para compartilhar no WhatsApp, Instagram ou imprimir em embalagens e materiais de divulgação.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
        {qrDataUrl && (
          <div className="p-2.5 rounded-xl border border-stone-200 bg-white shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrDataUrl}
              alt="QR Code do Cardápio Digital"
              className="w-32 h-32 object-contain"
            />
          </div>
        )}

        <div className="flex-1 space-y-3 w-full">
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={menuUrl}
              aria-label="URL do Cardápio Digital"
              className="flex-1 px-3 py-2 rounded-lg border border-stone-300 bg-stone-50 text-xs font-mono text-stone-800"
            />
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-stone-900 hover:bg-stone-800 text-white text-xs font-bold shrink-0"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copiado!' : 'Copiar Link'}</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {qrDataUrl && (
              <a
                href={qrDataUrl}
                download="qrcode-cardapio-digital.png"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Baixar QR Code (PNG)</span>
              </a>
            )}
            <a
              href="/cardapio"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-stone-300 bg-white hover:bg-stone-50 text-stone-800 text-xs font-bold"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Abrir /cardapio</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

