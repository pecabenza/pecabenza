'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { ShieldCheck, Check, X } from 'lucide-react';
import { updateGoogleConsentMode } from '@/lib/analytics/consent';

export function CookieConsentBanner() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem('sysfood_privacy_consent') as 'all' | 'essential' | null;
    if (!consent) {
      // Pequeno atraso para não causar layout shift imediato no primeiro carregamento
      const timer = setTimeout(() => setIsVisible(true), 800);
      return () => clearTimeout(timer);
    } else {
      // Sincroniza Consent Mode v2 com a escolha anterior
      updateGoogleConsentMode(consent);
    }
  }, []);

  const handleConsent = async (type: 'all' | 'essential') => {
    localStorage.setItem('sysfood_privacy_consent', type);
    updateGoogleConsentMode(type);
    setIsVisible(false);

    try {
      await fetch('/api/privacy/consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          consent_type: type === 'all' ? 'cookies_analytics' : 'essential_only',
          purpose: type === 'all' ? 'analytics_and_preferences' : 'essential_functionality',
          consent_given: true,
        }),
      });
    } catch {
      // Ignora falhas de gravação em dev offline
    }
  };

  if (!isVisible) return null;

  return (
    <aside
      aria-label="Consentimento de Cookies e Privacidade"
      className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:max-w-md z-50 animate-in fade-in slide-in-from-bottom-4 duration-300"
    >
      <div className="bg-white/95 dark:bg-stone-900/95 backdrop-blur-md p-5 rounded-2xl border border-stone-200 dark:border-stone-800 shadow-xl space-y-3.5 text-xs text-stone-700 dark:text-stone-300">
        <div className="flex items-center gap-2 font-semibold text-stone-900 dark:text-white">
          <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0" />
          <span>Privacidade e Cookies</span>
        </div>

        <p className="leading-relaxed">
          Utilizamos cookies essenciais para o funcionamento seguro da plataforma e, com seu consentimento, cookies de análise para aprimorar sua experiência. Saiba mais em nossa{' '}
          <Link href="/privacidade" className="underline font-medium hover:text-amber-700 transition-colors">
            Política de Privacidade
          </Link>
          .
        </p>

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={() => handleConsent('essential')}
            className="px-3 py-1.5 rounded-lg border border-stone-300 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-600 dark:text-stone-300 transition-colors"
          >
            Apenas Essenciais
          </button>
          <button
            type="button"
            onClick={() => handleConsent('all')}
            className="px-3.5 py-1.5 rounded-lg bg-stone-900 dark:bg-white text-white dark:text-stone-900 font-medium hover:opacity-90 transition-opacity flex items-center gap-1.5"
          >
            <Check className="w-3.5 h-3.5" />
            Aceitar Todos
          </button>
        </div>
      </div>
    </aside>
  );
}
