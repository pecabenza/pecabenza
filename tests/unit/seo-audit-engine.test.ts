import { describe, it, expect } from 'vitest';
import { auditPageSeo, auditTenantSeoConfig } from '../../src/lib/seo/audit';
import type { Tenant, TenantSettings, TenantBranding } from '../../src/types/database.types';

describe('Motor de Auditoria SEO Automática do SaaS', () => {
  it('deve atribuir score 100 e status excelente a uma página perfeitamente otimizada', () => {
    const report = auditPageSeo({
      url: 'https://benza.com.br/produtos/feijoada-benza',
      slug: 'feijoada-benza',
      title: 'Feijoada Completa Pronta para Aquecer | BENZA',
      metaDescription: 'Feijoada tradicional preparada com carnes selecionadas e temperos clássicos. Embalagens de 500 ml e 1000 ml para consumo prático.',
      canonicalUrl: 'https://benza.com.br/produtos/feijoada-benza',
      h1: 'Feijoada BENZA',
      content:
        'A feijoada benza é preparada com feijão preto cozido lentamente e carnes nobres dessalgadas com tempero tradicional. Nosso processo de congelamento cuidadoso logo após o cozimento preserva o aroma e a textura dos ingredientes frescos. Cada porção vem pronta para aquecer no fogão ou no forno em minutos, proporcionando uma refeição farta e acolhedora.',
      primaryKeyword: 'feijoada benza',
      images: [{ src: '/feijoada.jpg', alt: 'Prato de feijoada servido em cerâmica' }],
    });

    expect(report.score).toBe(100);
    expect(report.status).toBe('excelente');
    expect(report.issues.length).toBe(0);
    expect(report.metrics.imagesMissingAlt).toBe(0);
  });

  it('deve penalizar páginas com Title e Meta Description ausentes (Problemas Críticos)', () => {
    const report = auditPageSeo({
      url: 'https://benza.com.br/incompleta',
      slug: 'incompleta',
      title: '',
      metaDescription: '',
      h1: '',
    });

    expect(report.score).toBeLessThanOrEqual(50);
    expect(report.status).toBe('critico');

    const issueIds = report.issues.map((i) => i.id);
    expect(issueIds).toContain('title-missing');
    expect(issueIds).toContain('desc-missing');
    expect(issueIds).toContain('h1-missing');
  });

  it('deve identificar imagens sem Alt Text e atribuir severidade adequada', () => {
    const report = auditPageSeo({
      url: 'https://benza.com.br/cardapio',
      slug: 'cardapio',
      title: 'Cardápio de Pratos Prontos e Porções | BENZA Gastronomia',
      metaDescription: 'Confira as opções preparadas com ingredientes tradicionais, embalagens forneáveis e congelamento cuidadoso.',
      canonicalUrl: 'https://benza.com.br/cardapio',
      h1: 'Cardápio de Pratos',
      images: [
        { src: '/img1.jpg', alt: 'Prato 1' },
        { src: '/img2.jpg', alt: '' },
        { src: '/img3.jpg', alt: null },
      ],
    });

    expect(report.metrics.imagesMissingAlt).toBe(2);
    const altIssue = report.issues.find((i) => i.id === 'images-missing-alt');
    expect(altIssue).toBeDefined();
    expect(altIssue?.severity).toBe('importante');
  });

  it('deve alertar sobre risco de Keyword Stuffing quando a densidade exceder o limite aceitável', () => {
    const stuffingContent =
      'feijoada feijoada feijoada deliciosa feijoada feijoada para você comer feijoada no almoço feijoada';
    const report = auditPageSeo({
      url: 'https://benza.com.br/teste-stuffing',
      slug: 'teste-stuffing',
      title: 'Feijoada Artesanal Tradicional | BENZA',
      metaDescription: 'Feijoada tradicional preparada com carnes selecionadas.',
      canonicalUrl: 'https://benza.com.br/teste-stuffing',
      h1: 'Feijoada Especial',
      content: stuffingContent,
      primaryKeyword: 'feijoada',
    });

    const stuffingIssue = report.issues.find((i) => i.id === 'keyword-stuffing');
    expect(stuffingIssue).toBeDefined();
    expect(stuffingIssue?.severity).toBe('critico');
    expect(report.metrics.primaryKeywordDensity).toBeGreaterThan(4.5);
  });

  describe('Auditoria de Configuração de SEO do Tenant', () => {
    const mockTenant: Tenant = {
      id: 'tenant-01',
      name: 'BENZA Pratos Congelados',
      slug: 'benza',
      status: 'active',
      site_mode: 'prelaunch',
      created_at: '2026-01-01',
      updated_at: '2026-01-01',
    };

    const mockSettings: TenantSettings = {
      tenant_id: 'tenant-01',
      business_type: 'FoodEstablishment',
      contact_phone: '(75) 99999-0000',
      contact_whatsapp: '(75) 99999-0000',
      contact_email: 'contato@benza.com.br',
      address_summary: 'Feira de Santana, BA',
      instagram_handle: '@benza.gastronomia',
      prelaunch_banner_text: 'Em breve',
      prelaunch_cta_text: 'Avise-me',
      business_hours: { seg_sex: '08:00 - 18:00' },
      seo_defaults: {},
      created_at: '2026-01-01',
      updated_at: '2026-01-01',
    };

    const mockBranding: TenantBranding = {
      tenant_id: 'tenant-01',
      logo_url: 'https://cdn.benza.com.br/logo.png',
      favicon_url: null,
      font_family_heading: 'Inter',
      font_family_body: 'Inter',
      color_primary: '#000',
      color_secondary: '#111',
      color_accent: '#222',
      color_background: '#fff',
      color_surface: '#fafafa',
      color_text: '#111',
      border_radius: '8px',
      created_at: '2026-01-01',
      updated_at: '2026-01-01',
    };

    it('deve conceder pontuação 100 para tenant com dados de negócio e local completos', () => {
      const report = auditTenantSeoConfig(mockTenant, mockSettings, mockBranding);
      expect(report.score).toBe(100);
      expect(report.status).toBe('excelente');
      expect(report.configuredType).toBe('FoodEstablishment');
      expect(report.issues.length).toBe(0);
    });

    it('deve apontar issues quando contatos, logotipo e endereço estiverem ausentes', () => {
      const incompleteSettings: TenantSettings = {
        ...mockSettings,
        contact_phone: null,
        contact_whatsapp: null,
        address_summary: null,
      };

      const report = auditTenantSeoConfig(mockTenant, incompleteSettings, { ...mockBranding, logo_url: null });
      expect(report.score).toBeLessThan(70);

      const issueIds = report.issues.map((i) => i.id);
      expect(issueIds).toContain('tenant-contact-missing');
      expect(issueIds).toContain('tenant-address-missing');
      expect(issueIds).toContain('tenant-logo-missing');
    });
  });
});
