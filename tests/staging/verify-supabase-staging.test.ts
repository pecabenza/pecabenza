/**
 * Script de Verificação e Homologação de Staging Real do Supabase
 * Executa testes reais contra a instância de Staging configurada em variáveis de ambiente.
 * 
 * Uso:
 *   $env:NEXT_PUBLIC_SUPABASE_URL="https://seu-projeto.supabase.co"
 *   $env:SUPABASE_SERVICE_ROLE_KEY="sua-service-key"
 *   $env:NEXT_PUBLIC_SUPABASE_ANON_KEY="sua-anon-key"
 *   pnpm vitest run tests/staging/verify-supabase-staging.test.ts
 */

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
  !anonKey.includes('[')
);

describe.skipIf(!isConfigured)('Validação em Supabase Staging Real', () => {
  let adminClient: SupabaseClient<any, 'public', any>;
  let anonClient: SupabaseClient<any, 'public', any>;

  const TENANT_BENZA_ID = '00000000-0000-0000-0000-000000000001';
  const TENANT_02_ID = 'a2222222-2222-2222-2222-222222222222';

  beforeAll(() => {
    adminClient = createClient(supabaseUrl, serviceRoleKey || anonKey);
    anonClient = createClient(supabaseUrl, anonKey);
  });

  it('deve confirmar a presença do Tenant 01 (BENZA) no banco de staging', async () => {
    const { data, error } = await adminClient
      .from('tenants')
      .select('id, name, slug, site_mode')
      .eq('id', TENANT_BENZA_ID)
      .single();

    expect(error).toBeNull();
    expect(data?.name).toBe('BENZA');
    expect(data?.site_mode).toBe('prelaunch');
  });

  it('deve confirmar a presença do Tenant 02 (Cacau & Flor) no banco de staging', async () => {
    const { data, error } = await adminClient
      .from('tenants')
      .select('id, name, slug')
      .eq('id', TENANT_02_ID)
      .single();

    expect(error).toBeNull();
    expect(data?.name).toContain('Cacau & Flor');
  });

  it('deve verificar o catálogo isolado da BENZA', async () => {
    const { data, error } = await adminClient
      .from('products')
      .select('id, name, slug')
      .eq('tenant_id', TENANT_BENZA_ID);

    expect(error).toBeNull();
    expect(data?.length).toBeGreaterThanOrEqual(2);
    const slugs = data?.map((p: any) => p.slug);
    expect(slugs).toContain('feijoada-benza');
    expect(slugs).toContain('lasanha-tradicional');
  });

  it('deve validar que produtos do Tenant 02 não pertencem à BENZA', async () => {
    const { data: benzaProducts } = await adminClient
      .from('products')
      .select('id')
      .eq('tenant_id', TENANT_BENZA_ID);

    const { data: tenant02Products } = await adminClient
      .from('products')
      .select('id')
      .eq('tenant_id', TENANT_02_ID);

    const benzaIds = new Set(benzaProducts?.map((p: any) => p.id));
    const overlaps = tenant02Products?.filter((p: any) => benzaIds.has(p.id));
    expect(overlaps?.length).toBe(0);
  });

  it('deve testar a imutabilidade da tabela audit_logs (bloqueio de UPDATE/DELETE)', async () => {
    // Inserir um log de teste via service role
    const { data: inserted, error: insertError } = await adminClient
      .from('audit_logs')
      .insert({
        tenant_id: TENANT_BENZA_ID,
        entity_name: 'test_homologation',
        entity_id: '00000000-0000-0000-0000-000000000000',
        action: 'HOMOLOGATION_PROBE',
        payload_after: { stage: '1B_staging' },
      })
      .select()
      .single();

    expect(insertError).toBeNull();

    if (inserted?.id) {
      // Tentativa de UPDATE deve falhar devido ao trigger imutável
      const { error: updateError } = await adminClient
        .from('audit_logs')
        .update({ action: 'TAMPERED_ACTION' })
        .eq('id', inserted.id);

      expect(updateError).not.toBeNull();

      // Tentativa de DELETE deve falhar devido ao trigger imutável
      const { error: deleteError } = await adminClient
        .from('audit_logs')
        .delete()
        .eq('id', inserted.id);

      expect(deleteError).not.toBeNull();
    }
  });

  it('deve confirmar a existência do bucket de storage "tenant-assets"', async () => {
    const { data: buckets, error } = await adminClient.storage.listBuckets();
    expect(error).toBeNull();
    const tenantAssetsBucket = buckets?.find((b: any) => b.name === 'tenant-assets');
    expect(tenantAssetsBucket).toBeDefined();
  });
});
