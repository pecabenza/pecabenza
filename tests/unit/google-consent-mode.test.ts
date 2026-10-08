import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  DEFAULT_CONSENT_STATE,
  getGoogleConsentDefaultScript,
  updateGoogleConsentMode,
} from '../../src/lib/analytics/consent';

describe('Google Consent Mode v2 & LGPD Compliance', () => {
  beforeEach(() => {
    const store: Record<string, string> = {};
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store[key] || null,
      setItem: (key: string, value: string) => {
        store[key] = value;
      },
      clear: () => {
        for (const k in store) delete store[k];
      },
    });

    const listeners: Record<string, EventListener[]> = {};
    const win = {
      dataLayer: [] as unknown[],
      addEventListener: vi.fn((event: string, cb: EventListener) => {
        listeners[event] = listeners[event] || [];
        listeners[event].push(cb);
      }),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    };

    vi.stubGlobal('window', win);
  });

  it('deve ter estado padrão com todos os recursos não necessários como "denied"', () => {
    expect(DEFAULT_CONSENT_STATE.analytics_storage).toBe('denied');
    expect(DEFAULT_CONSENT_STATE.ad_storage).toBe('denied');
    expect(DEFAULT_CONSENT_STATE.ad_user_data).toBe('denied');
    expect(DEFAULT_CONSENT_STATE.ad_personalization).toBe('denied');
  });

  it('o script padrão inline deve configurar gtag consent default com parâmetros negados', () => {
    const script = getGoogleConsentDefaultScript();
    expect(script).toContain("gtag('consent', 'default'");
    expect(script).toContain("'analytics_storage': 'denied'");
    expect(script).toContain("'ad_storage': 'denied'");
    expect(script).toContain("'ad_user_data': 'denied'");
    expect(script).toContain("'ad_personalization': 'denied'");
  });

  it('deve atualizar Consent Mode para "granted" quando usuário aceitar todos os cookies', () => {
    const state = updateGoogleConsentMode('all');

    expect(state.analytics_storage).toBe('granted');
    expect(state.ad_storage).toBe('granted');
    expect(state.ad_user_data).toBe('granted');
    expect(state.ad_personalization).toBe('granted');

    const win = window as any;
    expect(win.dispatchEvent).toHaveBeenCalled();
  });

  it('deve atualizar Consent Mode para "denied" quando usuário escolher apenas essenciais', () => {
    const state = updateGoogleConsentMode('essential');

    expect(state.analytics_storage).toBe('denied');
    expect(state.ad_storage).toBe('denied');
    expect(state.ad_user_data).toBe('denied');
    expect(state.ad_personalization).toBe('denied');
  });
});
