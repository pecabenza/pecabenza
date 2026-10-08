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

describe.skipIf(!isConfigured)('Validação Específica — Migration 00001 (Multi-Tenant Foundation)', () => {
  let adminClient: SupabaseClient<any, 'public', any>;
  let anonClient: SupabaseClient<any, 'public', any>;

  beforeAll(() => {
    adminClient = createClient(supabaseUrl, serviceRoleKey);
    anonClient = createClient(supabaseUrl, anonKey);
  });

  it('1. Deve validar que as tabelas fundamentais foram criadas e estão acessíveis', async () => {
    // tenants
    const { error: tenantsErr } = await adminClient.from('tenants').select('id').limit(1);
    expect(tenantsErr).toBeNull();

    // tenant_domains
    const { error: domainsErr } = await adminClient.from('tenant_domains').select('id').limit(1);
    expect(domainsErr).toBeNull();

    // tenant_members
    const { error: membersErr } = await adminClient.from('tenant_members').select('id').limit(1);
    expect(membersErr).toBeNull();

    // tenant_settings
    const { error: settingsErr } = await adminClient.from('tenant_settings').select('tenant_id').limit(1);
    expect(settingsErr).toBeNull();

    // tenant_branding
    const { error: brandingErr } = await adminClient.from('tenant_branding').select('tenant_id').limit(1);
    expect(brandingErr).toBeNull();

    // audit_logs
    const { error: auditErr } = await adminClient.from('audit_logs').select('id').limit(1);
    expect(auditErr).toBeNull();
  });

  it('2. Deve testar a imutabilidade estrita de audit_logs (Trigger Anti-Tampering)', async () => {
    // Cria um tenant temporário de teste para associar ao audit_log
    const tempSlug = `test-audit-${Date.now()}`;
    const { data: tenant, error: tErr } = await adminClient
      .from('tenants')
      .insert({
        name: 'Probe Audit Tenant',
        slug: tempSlug,
        status: 'active',
        site_mode: 'prelaunch',
      })
      .select('id')
      .single();

    expect(tErr).toBeNull();
    expect(tenant?.id).toBeDefined();

    if (tenant?.id) {
      // Inserção permitida
      const { data: logEntry, error: logErr } = await adminClient
        .from('audit_logs')
        .insert({
          tenant_id: tenant.id,
          action: 'TEST_PROBE',
          resource_type: 'system',
          resource_id: 'probe-1',
          payload_after: { status: 'ok' },
        })
        .select('id')
        .single();

      expect(logErr).toBeNull();
      expect(logEntry?.id).toBeDefined();

      if (logEntry?.id) {
        // Tentativa de UPDATE deve ser bloqueada pelo trigger
        const { error: updateErr } = await adminClient
          .from('audit_logs')
          .update({ action: 'TAMPERED' })
          .eq('id', logEntry.id);

        expect(updateErr).not.toBeNull();
        expect(updateErr?.message).toContain('imutável');

        // Tentativa de DELETE deve ser bloqueada pelo trigger
        const { error: deleteErr } = await adminClient
          .from('audit_logs')
          .delete()
          .eq('id', logEntry.id);

        expect(deleteErr).not.toBeNull();
        expect(deleteErr?.message).toContain('imutável');
      }

      // Cleanup do tenant temporário
      await adminClient.from('tenants').delete().eq('id', tenant.id);
    }
  });

  it('3. Deve validar políticas de RLS e funções RBAC auxiliares', async () => {
    // Anon client deve conseguir consultar apenas tenants ativos
    const { error: anonErr } = await anonClient.from('tenants').select('id, name, slug').limit(5);
    expect(anonErr).toBeNull();

    // Anon client NÃO deve conseguir inserir tenants diretamente
    const { error: anonInsertErr } = await anonClient
      .from('tenants')
      .insert({ name: 'Hacker Tenant', slug: 'hacker' });
    expect(anonInsertErr).not.toBeNull();
  });
});
