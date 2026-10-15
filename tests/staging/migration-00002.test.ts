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

describe.skipIf(!isConfigured)('Validação Específica — Migration 00002 (Catalog & Media)', () => {
  let adminClient: SupabaseClient<any, 'public', any>;
  let anonClient: SupabaseClient<any, 'public', any>;

  beforeAll(() => {
    adminClient = createClient(supabaseUrl, serviceRoleKey);
    anonClient = createClient(supabaseUrl, anonKey);
  });

  it('1. Deve validar que as tabelas de catálogo e mídia foram criadas e estão acessíveis', async () => {
    // media_assets
    const { error: mediaErr } = await adminClient.from('media_assets').select('id').limit(1);
    expect(mediaErr).toBeNull();

    // product_categories
    const { error: catErr } = await adminClient.from('product_categories').select('id').limit(1);
    expect(catErr).toBeNull();

    // products
    const { error: prodErr } = await adminClient.from('products').select('id').limit(1);
    expect(prodErr).toBeNull();

    // product_variants
    const { error: varErr } = await adminClient.from('product_variants').select('id').limit(1);
    expect(varErr).toBeNull();

    // product_information
    const { error: infoErr } = await adminClient.from('product_information').select('id').limit(1);
    expect(infoErr).toBeNull();
  });

  it('2. Deve testar integridade referencial composta cross-tenant (composite foreign keys)', async () => {
    // Cria dois tenants de teste
    const slug1 = `test-t1-${Date.now()}`;
    const slug2 = `test-t2-${Date.now()}`;

    const { data: t1 } = await adminClient
      .from('tenants')
      .insert({ name: 'T1 Test', slug: slug1, status: 'active' })
      .select('id')
      .single();

    const { data: t2 } = await adminClient
      .from('tenants')
      .insert({ name: 'T2 Test', slug: slug2, status: 'active' })
      .select('id')
      .single();

    expect(t1?.id).toBeDefined();
    expect(t2?.id).toBeDefined();

    if (t1?.id && t2?.id) {
      // Cria categoria no Tenant 1
      const { data: cat1 } = await adminClient
        .from('product_categories')
        .insert({ tenant_id: t1.id, name: 'Cat T1', slug: 'cat-t1' })
        .select('id')
        .single();

      expect(cat1?.id).toBeDefined();

      if (cat1?.id) {
        // Tentativa de criar produto no Tenant 2 referenciando categoria do Tenant 1 deve violar composite FK
        const { error: crossFkErr } = await adminClient
          .from('products')
          .insert({
            tenant_id: t2.id,
            category_id: cat1.id, // ID do Tenant 1 sendo usado pelo Tenant 2
            name: 'Produto Ilegítimo Cross-Tenant',
            slug: 'prod-cross-test',
          });

        expect(crossFkErr).not.toBeNull();
        expect(crossFkErr?.code).toBe('23503'); // foreign_key_violation
      }

      // Cleanup
      await adminClient.from('tenants').delete().eq('id', t1.id);
      await adminClient.from('tenants').delete().eq('id', t2.id);
    }
  });

  it('3. Deve validar políticas de RLS do catálogo', async () => {
    // Anon client não deve conseguir inserir produtos
    const { error: anonInsertErr } = await anonClient
      .from('products')
      .insert({ name: 'Hacker Product', slug: 'hacker-prod' });
    expect(anonInsertErr).not.toBeNull();

    // Anon client deve conseguir consultar produtos sem erro de sintaxe/permissão
    const { error: anonReadErr } = await anonClient.from('products').select('id, name, slug').limit(5);
    expect(anonReadErr).toBeNull();
  });
});
