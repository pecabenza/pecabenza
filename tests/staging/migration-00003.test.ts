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

describe.skipIf(!isConfigured)('Validação Específica — Migration 00003 (CMS & Sections)', () => {
  let adminClient: SupabaseClient<any, 'public', any>;
  let anonClient: SupabaseClient<any, 'public', any>;

  beforeAll(() => {
    adminClient = createClient(supabaseUrl, serviceRoleKey);
    anonClient = createClient(supabaseUrl, anonKey);
  });

  it('1. Deve validar que as tabelas do CMS e Leads foram criadas e estão acessíveis', async () => {
    // tenant_pages
    const { error: pagesErr } = await adminClient.from('tenant_pages').select('id').limit(1);
    expect(pagesErr).toBeNull();

    // tenant_page_sections
    const { error: secErr } = await adminClient.from('tenant_page_sections').select('id').limit(1);
    expect(secErr).toBeNull();

    // site_leads
    const { error: leadsErr } = await adminClient.from('site_leads').select('id').limit(1);
    expect(leadsErr).toBeNull();
  });

  it('2. Deve validar o ciclo draft/published e RLS de tenant_pages e seções', async () => {
    const slug = `test-cms-${Date.now()}`;
    const { data: tenant } = await adminClient
      .from('tenants')
      .insert({ name: 'CMS Test Tenant', slug, status: 'active' })
      .select('id')
      .single();

    expect(tenant?.id).toBeDefined();

    if (tenant?.id) {
      // 1. Criar página em DRAFT
      const { data: draftPage } = await adminClient
        .from('tenant_pages')
        .insert({
          tenant_id: tenant.id,
          slug: 'draft-page',
          title: 'Draft Page',
          status: 'draft',
        })
        .select('id')
        .single();

      expect(draftPage?.id).toBeDefined();

      // 2. Criar página PUBLISHED
      const { data: pubPage } = await adminClient
        .from('tenant_pages')
        .insert({
          tenant_id: tenant.id,
          slug: 'published-page',
          title: 'Published Page',
          status: 'published',
        })
        .select('id')
        .single();

      expect(pubPage?.id).toBeDefined();

      // 3. Anon client deve enxergar APENAS a página published
      const { data: anonPages, error: aErr } = await anonClient
        .from('tenant_pages')
        .select('id, slug, status')
        .eq('tenant_id', tenant.id);

      expect(aErr).toBeNull();
      const anonSlugs = anonPages?.map((p: any) => p.slug) || [];
      expect(anonSlugs).toContain('published-page');
      expect(anonSlugs).not.toContain('draft-page');

      // Cleanup
      await adminClient.from('tenants').delete().eq('id', tenant.id);
    }
  });

  it('3. Deve validar a captura pública de site_leads via anon client e leitura restrita a admin', async () => {
    const slug = `test-leads-${Date.now()}`;
    const { data: tenant } = await adminClient
      .from('tenants')
      .insert({ name: 'Leads Test Tenant', slug, status: 'active' })
      .select('id')
      .single();

    expect(tenant?.id).toBeDefined();

    if (tenant?.id) {
      // Anon client consegue registrar lead
      const { error: leadInsertErr } = await anonClient
        .from('site_leads')
        .insert({
          tenant_id: tenant.id,
          name: 'Lead Teste Anon',
          email: 'lead@teste.com',
          phone: '11999999999',
          source_page: 'home',
        });

      expect(leadInsertErr).toBeNull();

      // Anon client NÃO deve conseguir ler leads (protegido por RLS)
      const { data: anonLeads } = await anonClient
        .from('site_leads')
        .select('id, email')
        .eq('tenant_id', tenant.id);

      expect(anonLeads?.length || 0).toBe(0);

      // Admin client DEVE conseguir ler leads
      const { data: adminLeads, error: adminLeadErr } = await adminClient
        .from('site_leads')
        .select('id, email')
        .eq('tenant_id', tenant.id);

      expect(adminLeadErr).toBeNull();
      expect(adminLeads?.some((l: any) => l.email === 'lead@teste.com')).toBe(true);

      // Cleanup
      await adminClient.from('tenants').delete().eq('id', tenant.id);
    }
  });
});
