'use client';

import React, { useEffect, useState } from 'react';
import Script from 'next/script';
import { getGoogleConsentDefaultScript, hasAnalyticsConsent } from '@/lib/analytics/consent';

interface GoogleAnalyticsProps {
  measurementId?: string | null;
  gscVerificationTag?: string | null;
}

export function GoogleAnalytics({ measurementId }: GoogleAnalyticsProps) {
  const [hasConsent, setHasConsent] = useState(false);

  useEffect(() => {
    // 1. Verifica preferência inicial armazenada
    if (hasAnalyticsConsent()) {
      setHasConsent(true);
    }

    // 2. Escuta atualizações de consentimento em tempo real na janela
    const handleConsentUpdate = (event: Event) => {
      const customEvent = event as CustomEvent<{ choice: 'all' | 'essential' }>;
      if (customEvent.detail?.choice === 'all') {
        setHasConsent(true);
      } else {
        setHasConsent(false);
      }
    };

    window.addEventListener('sysfood_consent_updated', handleConsentUpdate);
    return () => {
      window.removeEventListener('sysfood_consent_updated', handleConsentUpdate);
    };
  }, []);

  if (!measurementId) {
    return null;
  }

  return (
    <>
      {/* Define o estado de consentimento padrão como negado ANTES de qualquer tag carregar */}
      <Script
        id="google-consent-default"
        strategy="beforeInteractive"
        dangerouslySetInnerHTML={{
          __html: getGoogleConsentDefaultScript(),
        }}
      />

      {/* Script do Google Tag Manager / GA4: Só é carregado se o consentimento foi explicitamente concedido */}
      {hasConsent && (
        <>
          <Script
            id="google-analytics-gtag"
            strategy="afterInteractive"
            src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`}
          />
          <Script
            id="google-analytics-init"
            strategy="afterInteractive"
            dangerouslySetInnerHTML={{
              __html: `
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${measurementId}', {
                  page_path: window.location.pathname,
                  anonymize_ip: true
                });
              `,
            }}
          />
        </>
      )}
    </>
  );
}
