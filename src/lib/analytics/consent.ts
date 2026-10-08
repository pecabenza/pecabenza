/**
 * Suporte a Google Consent Mode v2 e Gestão de Consentimento LGPD
 *
 * Parâmetros regulatórios do Google Consent Mode v2:
 * - analytics_storage: Armazenamento e cookies analíticos (GA4)
 * - ad_storage: Cookies de publicidade
 * - ad_user_data: Envio de dados do usuário para finalidades de anúncios
 * - ad_personalization: Remarketing e anúncios personalizados
 */

export type ConsentValue = 'granted' | 'denied';

export interface GoogleConsentModeState {
  analytics_storage: ConsentValue;
  ad_storage: ConsentValue;
  ad_user_data: ConsentValue;
  ad_personalization: ConsentValue;
  wait_for_update?: number;
}

/**
 * Estado padrão por princípio de privacidade por design:
 * Todos os recursos não essenciais iniciam como negados ('denied') até consentimento explícito.
 */
export const DEFAULT_CONSENT_STATE: GoogleConsentModeState = {
  analytics_storage: 'denied',
  ad_storage: 'denied',
  ad_user_data: 'denied',
  ad_personalization: 'denied',
  wait_for_update: 500,
};

/**
 * Constrói o script inline seguro que define o Consent Mode v2 padrão
 * antes de qualquer carregamento de scripts externos.
 */
export function getGoogleConsentDefaultScript(): string {
  return `
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('consent', 'default', {
      'analytics_storage': 'denied',
      'ad_storage': 'denied',
      'ad_user_data': 'denied',
      'ad_personalization': 'denied',
      'wait_for_update': 500
    });
  `.trim();
}

/**
 * Atualiza o Google Consent Mode v2 em tempo de execução com base na escolha do usuário.
 */
export function updateGoogleConsentMode(choice: 'all' | 'essential'): GoogleConsentModeState {
  if (typeof window === 'undefined') {
    return DEFAULT_CONSENT_STATE;
  }

  const win = window as unknown as {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  };

  win.dataLayer = win.dataLayer || [];
  const gtag = (...args: unknown[]) => {
    if (typeof win.gtag === 'function') {
      win.gtag(...args);
    } else {
      win.dataLayer?.push(args);
    }
  };

  const updatedState: GoogleConsentModeState =
    choice === 'all'
      ? {
          analytics_storage: 'granted',
          ad_storage: 'granted',
          ad_user_data: 'granted',
          ad_personalization: 'granted',
        }
      : {
          analytics_storage: 'denied',
          ad_storage: 'denied',
          ad_user_data: 'denied',
          ad_personalization: 'denied',
        };

  gtag('consent', 'update', updatedState);

  // Disparar evento para a janela para sincronização de componentes clientes
  window.dispatchEvent(
    new CustomEvent('sysfood_consent_updated', {
      detail: { choice, state: updatedState },
    })
  );

  return updatedState;
}

/**
 * Verifica se o usuário consentiu com analytics no localStorage
 */
export function hasAnalyticsConsent(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem('sysfood_privacy_consent') === 'all';
}
