import { describe, it, expect, vi, beforeEach } from 'vitest';
import { trackEvent } from '../../src/lib/analytics/events';

describe('Disparo de Eventos de Analytics e Consentimento LGPD', () => {
  beforeEach(() => {
    // Limpa localStorage simulado
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

    // Mock do dataLayer global
    vi.stubGlobal('window', {
      dataLayer: [],
      location: { pathname: '/produtos' },
    });
  });

  it('deve disparar evento para window.dataLayer quando o usuário consentir com todos os cookies', () => {
    localStorage.setItem('sysfood_privacy_consent', 'all');

    trackEvent('product_view', {
      productName: 'Feijoada BENZA',
      productId: 'p-01',
      productPrice: 48.0,
    });

    const win = window as any;
    expect(win.dataLayer.length).toBe(1);
    expect(win.dataLayer[0]).toEqual({
      event: 'product_view',
      productName: 'Feijoada BENZA',
      productId: 'p-01',
      productPrice: 48.0,
    });
  });

  it('NÃO deve disparar evento quando o usuário selecionar apenas cookies essenciais (Respeito à LGPD)', () => {
    localStorage.setItem('sysfood_privacy_consent', 'essential');

    trackEvent('product_view', {
      productName: 'Feijoada BENZA',
    });

    const win = window as any;
    expect(win.dataLayer.length).toBe(0);
  });
});
