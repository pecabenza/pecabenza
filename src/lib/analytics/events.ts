/**
 * Módulo de Eventos e Analytics Multi-Tenant da Plataforma SaaS SysFood
 * Encapsula o envio de telemetria para GA4 e banco interno respeitando consentimento LGPD.
 */

export type AnalyticsEventName =
  | 'page_view'
  | 'product_view'
  | 'contact_click'
  | 'whatsapp_click'
  | 'lead_submit'
  // Eventos futuros preparados para a fase da Loja Virtual:
  | 'add_to_cart'
  | 'begin_checkout'
  | 'purchase'
  | 'coupon_apply'
  | 'delivery_selected';

export interface AnalyticsEventParams {
  tenantId?: string;
  tenantSlug?: string;
  pagePath?: string;
  pageTitle?: string;
  productId?: string;
  productName?: string;
  productPrice?: number;
  contactChannel?: 'email' | 'phone' | 'whatsapp' | 'form';
  [key: string]: unknown;
}

/**
 * Dispara evento analítico client-side no DataLayer do Google Analytics (se consentido)
 */
export function trackEvent(name: AnalyticsEventName, params?: AnalyticsEventParams): void {
  if (typeof window === 'undefined') return;

  // 1. Respeito ao Consentimento LGPD
  const consent = localStorage.getItem('sysfood_privacy_consent');
  if (consent === 'essential') {
    // Usuário optou por cookies apenas essenciais; não envia telemetria de marketing/análise
    return;
  }

  // 2. Disparo para Google Tag / GA4 se presente na janela
  const win = window as unknown as { gtag?: (...args: unknown[]) => void; dataLayer?: unknown[] };
  if (typeof win.gtag === 'function') {
    win.gtag('event', name, params);
  } else if (Array.isArray(win.dataLayer)) {
    win.dataLayer.push({ event: name, ...params });
  }

  // 3. Em desenvolvimento, logar no console
  if (process.env.NODE_ENV !== 'production') {
    console.debug(`[Analytics Event] ${name}:`, params);
  }
}
