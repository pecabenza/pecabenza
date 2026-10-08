import { describe, it, expect } from 'vitest';
import { buildContentSecurityPolicy, buildHstsHeader } from '../../src/lib/security/csp';

describe('Segurança de Cabeçalhos: Content-Security-Policy (CSP) & HSTS', () => {
  describe('Content-Security-Policy (Princípio do Menor Privilégio)', () => {
    it('deve gerar CSP restrito sem o uso de curingas amplos (*) e sem serviços não utilizados (Cloudinary, Stripe, Mercado Pago)', () => {
      const csp = buildContentSecurityPolicy({ isProduction: true });

      // Não deve conter curinga '*' isolado em diretivas críticas
      expect(csp).not.toContain("script-src *");
      expect(csp).not.toContain("connect-src *");
      expect(csp).not.toContain("frame-src *");
      expect(csp).not.toContain("img-src *");
      expect(csp).not.toContain("img-src 'self' https:");

      // Provedores não integrados atualmente NÃO devem estar na whitelist
      expect(csp).not.toContain("cloudinary.com");
      expect(csp).not.toContain("stripe.com");
      expect(csp).not.toContain("mercadopago.com");

      // Deve conter diretivas obrigatórias de contenção
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).toContain("object-src 'none'");
      expect(csp).toContain("base-uri 'self'");
    });

    it('deve incluir domínios homologados de Google Analytics e Supabase', () => {
      const csp = buildContentSecurityPolicy({
        includeGoogleAnalytics: true,
        includeSupabase: true,
        isProduction: true,
      });

      expect(csp).toContain('https://www.googletagmanager.com');
      expect(csp).toContain('https://www.google-analytics.com');
      expect(csp).toContain('https://*.supabase.co');
      expect(csp).toContain('wss://*.supabase.co');
    });

    it('deve estender CSP estritamente para Cloudinary apenas quando explicitamente habilitado', () => {
      const cspWithCloudinary = buildContentSecurityPolicy({
        includeCloudinary: true,
        isProduction: true,
      });

      expect(cspWithCloudinary).toContain('https://res.cloudinary.com');
    });

    it('deve estender CSP estritamente para gateways de pagamento homologados apenas quando configurado', () => {
      const cspWithGateways = buildContentSecurityPolicy({
        paymentGateways: ['stripe', 'mercadopago'],
        isProduction: true,
      });

      expect(cspWithGateways).toContain('https://js.stripe.com');
      expect(cspWithGateways).toContain('https://api.stripe.com');
      expect(cspWithGateways).toContain('https://sdk.mercadopago.com');
      expect(cspWithGateways).toContain('https://api.mercadopago.com');
      expect(cspWithGateways).toContain('https://www.mercadopago.com');
    });
  });

  describe('Strict-Transport-Security (HSTS)', () => {
    it('NÃO deve ativar HSTS em ambiente de desenvolvimento local ou teste', () => {
      const devHsts = buildHstsHeader({ appEnv: 'development' });
      expect(devHsts).toBeNull();

      const testHsts = buildHstsHeader({ appEnv: 'test' });
      expect(testHsts).toBeNull();
    });

    it('em Staging, NÃO deve conter "preload" para não bloquear domínios temporários', () => {
      const stagingHsts = buildHstsHeader({ appEnv: 'staging', enablePreload: false });
      expect(stagingHsts).toBe('max-age=86400; includeSubDomains');
      expect(stagingHsts).not.toContain('preload');

      // Mesmo se enablePreload fosse passado por engano em staging:
      const stagingWithPreloadFlag = buildHstsHeader({ appEnv: 'staging', enablePreload: true });
      expect(stagingWithPreloadFlag).toBe('max-age=86400; includeSubDomains');
      expect(stagingWithPreloadFlag).not.toContain('preload');
    });

    it('em Produção sem flag de preload, deve enviar max-age longo SEM preload', () => {
      const prodHsts = buildHstsHeader({ appEnv: 'production', enablePreload: false });
      expect(prodHsts).toBe('max-age=31536000; includeSubDomains');
      expect(prodHsts).not.toContain('preload');
    });

    it('em Produção com flag explícita, deve incluir "preload" conscientemente', () => {
      const prodPreloadHsts = buildHstsHeader({ appEnv: 'production', enablePreload: true });
      expect(prodPreloadHsts).toBe('max-age=63072000; includeSubDomains; preload');
    });
  });
});
