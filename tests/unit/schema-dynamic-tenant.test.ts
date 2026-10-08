import { describe, it, expect } from 'vitest';
import { generateBusinessJsonLd, generateProductJsonLd } from '../../src/lib/seo/schema';
import type { Tenant, TenantSettings, TenantBranding, Product } from '../../src/types/database.types';

describe('Schema.org Dinâmico e Preciso por Tenant (SEO)', () => {
  const baseTenant: Tenant = {
    id: '00000000-0000-0000-0000-000000000001',
    name: 'BENZA Pratos Congelados',
    slug: 'benza',
    status: 'active',
    site_mode: 'prelaunch',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };

  const baseSettings: TenantSettings = {
    tenant_id: baseTenant.id,
    contact_email: null,
    contact_phone: null,
    contact_whatsapp: null,
    instagram_handle: null,
    address_summary: null,
    prelaunch_banner_text: 'Em breve',
    prelaunch_cta_text: 'Quero novidades',
    business_hours: {},
    seo_defaults: {},
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };

  it('não deve aplicar Restaurant automaticamente para BENZA e deve fazer fallback seguro para Organization se não houver endereço', () => {
    const jsonLd = generateBusinessJsonLd(baseTenant, baseSettings, 'https://benza.com.br');

    expect(jsonLd['@context']).toBe('https://schema.org');
    expect(jsonLd['@type']).toBe('Organization');
    expect(jsonLd.name).toBe('BENZA Pratos Congelados');
    // Não inventar campos inexistentes
    expect(jsonLd.telephone).toBeUndefined();
    expect(jsonLd.email).toBeUndefined();
    expect(jsonLd.address).toBeUndefined();
    expect(jsonLd.servesCuisine).toBeUndefined();
  });

  it('deve fazer fallback para LocalBusiness quando houver endereço físico mas nenhum business_type configurado', () => {
    const settingsWithAddress: TenantSettings = {
      ...baseSettings,
      address_summary: 'Av. Getúlio Vargas, 1000 - Feira de Santana, BA',
      contact_phone: '(75) 99999-0000',
    };

    const jsonLd = generateBusinessJsonLd(baseTenant, settingsWithAddress, 'https://benza.com.br');

    expect(jsonLd['@type']).toBe('LocalBusiness');
    expect(jsonLd.telephone).toBe('(75) 99999-0000');
    expect(jsonLd.address).toEqual({
      '@type': 'PostalAddress',
      streetAddress: 'Av. Getúlio Vargas, 1000 - Feira de Santana, BA',
      addressCountry: 'BR',
    });
    // Não deve conter servesCuisine inventado
    expect(jsonLd.servesCuisine).toBeUndefined();
  });

  it('deve honrar configuração explícita de tipo: FoodEstablishment', () => {
    const settingsFood: TenantSettings = {
      ...baseSettings,
      business_type: 'FoodEstablishment',
      serves_cuisine: 'Comida Congelada Gourmet',
      address_summary: 'Feira de Santana, BA',
    };

    const jsonLd = generateBusinessJsonLd(baseTenant, settingsFood, 'https://benza.com.br');

    expect(jsonLd['@type']).toBe('FoodEstablishment');
    expect(jsonLd.servesCuisine).toBe('Comida Congelada Gourmet');
  });

  it('deve honrar configuração explícita de tipo: Restaurant e Store', () => {
    const settingsRest: TenantSettings = {
      ...baseSettings,
      business_type: 'Restaurant',
      serves_cuisine: 'Brasileira Contemporânea',
    };
    const jsonLdRest = generateBusinessJsonLd(baseTenant, settingsRest, 'https://benza.com.br');
    expect(jsonLdRest['@type']).toBe('Restaurant');
    expect(jsonLdRest.servesCuisine).toBe('Brasileira Contemporânea');

    const settingsStore: TenantSettings = {
      ...baseSettings,
      business_type: 'Store',
    };
    const jsonLdStore = generateBusinessJsonLd(baseTenant, settingsStore, 'https://benza.com.br');
    expect(jsonLdStore['@type']).toBe('Store');
    expect(jsonLdStore.servesCuisine).toBeUndefined();
  });

  it('deve incluir logotipo e redes sociais apenas se definidos', () => {
    const branding: TenantBranding = {
      tenant_id: baseTenant.id,
      logo_url: 'https://cdn.sysfood.com/benza/logo.png',
      favicon_url: null,
      font_family_heading: 'Inter',
      font_family_body: 'Inter',
      color_primary: '#000',
      color_secondary: '#111',
      color_accent: '#222',
      color_background: '#fff',
      color_surface: '#f9f9f9',
      color_text: '#000',
      border_radius: '8px',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };

    const settingsWithSocial: TenantSettings = {
      ...baseSettings,
      instagram_handle: '@benza.gastronomia',
    };

    const jsonLd = generateBusinessJsonLd(baseTenant, settingsWithSocial, 'https://benza.com.br', branding);
    expect(jsonLd.logo).toBe('https://cdn.sysfood.com/benza/logo.png');
    expect(jsonLd.sameAs).toEqual(['https://instagram.com/benza.gastronomia']);
  });

  it('deve gerar Schema.org Product com dados do prato sem campos inexistentes', () => {
    const product: Product = {
      id: 'prod-01',
      tenant_id: baseTenant.id,
      name: 'Feijoada Completa BENZA',
      slug: 'feijoada-completa',
      short_description: 'Porção para 2 pessoas.',
      full_description: 'Feijoada artesanal congelada.',
      status: 'active',
      category_id: null,
      cover_media_id: null,
      is_featured: false,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      variants: [
        {
          id: 'var-01',
          tenant_id: baseTenant.id,
          product_id: 'prod-01',
          name: '700g',
          sku: 'FEIJ-700',
          price_in_cents: 6800,
          unit_type: 'g',
          unit_value: 700,
          display_order: 1,
          is_available: true,
          created_at: '2026-01-01T00:00:00Z',
        },
      ],
    };

    const productJsonLd = generateProductJsonLd(product, baseTenant, 'https://benza.com.br');
    expect(productJsonLd['@type']).toBe('Product');
    expect(productJsonLd.name).toBe('Feijoada Completa BENZA');
    expect(productJsonLd.offers).toBeDefined();
    expect((productJsonLd.offers as any).price).toBe('68.00');
  });
});
