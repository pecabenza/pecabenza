import { describe, it, expect, beforeAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const isConfigured = Boolean(
  supabaseUrl &&
  !supabaseUrl.includes('placeholder') &&
  !supabaseUrl.includes('[') &&
  anonKey &&
  !anonKey.includes('placeholder') &&
  !anonKey.includes('[') &&
  serviceRoleKey &&
  !serviceRoleKey.includes('[')
);

const TENANT_BENZA_ID = '00000000-0000-0000-0000-000000000001';

describe.skipIf(!isConfigured)('Validação Específica — Migration 00004 (Seed BENZA - Tenant 01)', () => {
  let adminClient: SupabaseClient<any, 'public', any>;

  beforeAll(() => {
    adminClient = createClient(supabaseUrl, serviceRoleKey);
  });

  it('1. Deve validar que a BENZA foi criada como Tenant 01 com site_mode prelaunch', async () => {
    const { data: tenant, error } = await adminClient
      .from('tenants')
      .select('id, name, slug, status, site_mode')
      .eq('id', TENANT_BENZA_ID)
      .single();

    expect(error).toBeNull();
    expect(tenant?.name).toBe('BENZA');
    expect(tenant?.slug).toBe('benza');
    expect(tenant?.status).toBe('active');
    expect(tenant?.site_mode).toBe('prelaunch');
  });

  it('2. Deve validar o branding e configurações da BENZA (sem logo fictício)', async () => {
    const { data: branding, error: bErr } = await adminClient
      .from('tenant_branding')
      .select('*')
      .eq('tenant_id', TENANT_BENZA_ID)
      .single();

    expect(bErr).toBeNull();
    expect(branding?.color_primary).toBe('#A84B2C'); // Terracota
    expect(branding?.logo_url).toBeNull(); // Sem logo fictício

    const { data: settings, error: sErr } = await adminClient
      .from('tenant_settings')
      .select('*')
      .eq('tenant_id', TENANT_BENZA_ID)
      .single();

    expect(sErr).toBeNull();
    expect(settings?.prelaunch_cta_text).toBe('Em breve');
    expect(settings?.contact_email).toBe('contato@benza.com.br');
  });

  it('3. Deve validar as páginas institucionais da BENZA', async () => {
    const { data: pages, error } = await adminClient
      .from('tenant_pages')
      .select('slug, title, status')
      .eq('tenant_id', TENANT_BENZA_ID);

    expect(error).toBeNull();
    expect(pages?.length).toBeGreaterThanOrEqual(4);
    const slugs = pages?.map((p: any) => p.slug);
    expect(slugs).toContain('home');
    expect(slugs).toContain('sobre');
    expect(slugs).toContain('produtos');
    expect(slugs).toContain('contato');
  });

  it('4. Deve validar os produtos e variantes oficiais da BENZA', async () => {
    const { data: products, error: pErr } = await adminClient
      .from('products')
      .select('id, name, slug, status')
      .eq('tenant_id', TENANT_BENZA_ID);

    expect(pErr).toBeNull();
    expect(products?.length).toBeGreaterThanOrEqual(2);

    const slugs = products?.map((p: any) => p.slug);
    expect(slugs).toContain('feijoada-benza');
    expect(slugs).toContain('lasanha-tradicional');

    // Validação de variantes
    const { data: variants, error: vErr } = await adminClient
      .from('product_variants')
      .select('id, name, unit_type, unit_value, price_in_cents')
      .eq('tenant_id', TENANT_BENZA_ID);

    expect(vErr).toBeNull();
    expect(variants?.length).toBeGreaterThanOrEqual(4);
    const unitTypes = variants?.map((v: any) => v.unit_type);
    expect(unitTypes?.every((u: string) => u === 'ml')).toBe(true);
  });
});
