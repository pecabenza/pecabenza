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

describe.skipIf(!isConfigured)('Validação Específica — Migration 00007 (Privacy LGPD & SEO)', () => {
  let adminClient: SupabaseClient<any, 'public', any>;
  let anonClient: SupabaseClient<any, 'public', any>;

  beforeAll(() => {
    adminClient = createClient(supabaseUrl, serviceRoleKey);
    anonClient = createClient(supabaseUrl, anonKey);
  });

  it('1. Deve validar as tabelas de privacidade LGPD', async () => {
    // user_consents
    const { error: consentErr } = await adminClient.from('user_consents').select('id').limit(1);
    expect(consentErr).toBeNull();

    // privacy_requests
    const { error: reqErr } = await adminClient.from('privacy_requests').select('id').limit(1);
    expect(reqErr).toBeNull();
  });

  it('2. Deve validar os campos de auditoria LGPD em site_leads', async () => {
    const { error } = await adminClient
      .from('site_leads')
      .select('consent_ip_hash, consent_user_agent, consent_purpose')
      .limit(1);

    expect(error).toBeNull();
  });

  it('3. Deve validar os campos avançados de SEO em tenant_pages, products e tenant_settings', async () => {
    // tenant_pages SEO
    const { error: pageErr } = await adminClient
      .from('tenant_pages')
      .select('primary_keyword, secondary_keywords, search_intent, canonical_url')
      .limit(1);
    expect(pageErr).toBeNull();

    // products SEO
    const { error: prodErr } = await adminClient
      .from('products')
      .select('primary_keyword, secondary_keywords, search_intent')
      .limit(1);
    expect(prodErr).toBeNull();

    // tenant_settings Analytics/Search Console
    const { error: setErr } = await adminClient
      .from('tenant_settings')
      .select('ga4_measurement_id, gsc_verification_tag, business_type, serves_cuisine, price_range')
      .limit(1);
    expect(setErr).toBeNull();
  });

  it('4. Deve validar RLS de privacidade (inserção pública anônima permitida)', async () => {
    const tempSlug = `test-lgpd-${Date.now()}`;
    const { data: tenant } = await adminClient
      .from('tenants')
      .insert({ name: 'LGPD Tenant', slug: tempSlug, status: 'active' })
      .select('id')
      .single();

    expect(tenant?.id).toBeDefined();

    if (tenant?.id) {
      // Inserção anônima de consentimento
      const { error: cErr } = await anonClient
        .from('user_consents')
        .insert({
          tenant_id: tenant.id,
          consent_type: 'cookies_all',
          purpose: 'analytics_and_marketing',
          ip_hash: 'probe-hash-123',
          user_agent: 'Vitest Automated Agent',
        });
      expect(cErr).toBeNull();

      // Inserção anônima de solicitação de privacidade (titular de dados)
      const { error: pErr } = await anonClient
        .from('privacy_requests')
        .insert({
          tenant_id: tenant.id,
          email: 'titular@exemplo.com',
          request_type: 'access',
          notes: 'Solicitação de acesso aos dados',
        });
      expect(pErr).toBeNull();

      // Anon não deve ler consents de outros
      const { data: anonConsents } = await anonClient
        .from('user_consents')
        .select('id')
        .eq('tenant_id', tenant.id);
      expect(anonConsents?.length || 0).toBe(0);

      // Admin deve ler consents
      const { data: adminConsents, error: adminCErr } = await adminClient
        .from('user_consents')
        .select('id')
        .eq('tenant_id', tenant.id);
      expect(adminCErr).toBeNull();
      expect(adminConsents?.length).toBeGreaterThanOrEqual(1);

      // Cleanup
      await adminClient.from('tenants').delete().eq('id', tenant.id);
    }
  });
});
