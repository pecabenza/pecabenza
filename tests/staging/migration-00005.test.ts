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
const TENANT_02_ID = '00000000-0000-0000-0000-000000000002';

describe.skipIf(!isConfigured)('Validação Específica — Migration 00005 (Tenant 02 - Cacau & Flor)', () => {
  let adminClient: SupabaseClient<any, 'public', any>;

  beforeAll(() => {
    adminClient = createClient(supabaseUrl, serviceRoleKey);
  });

  it('1. Deve validar a criação do Tenant 02 (Cacau & Flor)', async () => {
    const { data: tenant, error } = await adminClient
      .from('tenants')
      .select('id, name, slug, status')
      .eq('id', TENANT_02_ID)
      .single();

    expect(error).toBeNull();
    expect(tenant?.name).toBe('Cacau & Flor');
    expect(tenant?.slug).toBe('cacau-flor');
  });

  it('2. Deve validar o branding distinto do Tenant 02 (Verde Oliva / Lavanda)', async () => {
    const { data: branding, error } = await adminClient
      .from('tenant_branding')
      .select('*')
      .eq('tenant_id', TENANT_02_ID)
      .single();

    expect(error).toBeNull();
    expect(branding?.color_primary).toBe('#4A583B'); // Verde Oliva
    expect(branding?.color_secondary).toBe('#8B6B88'); // Lavanda
  });

  it('3. Deve validar o catálogo independente do Tenant 02 e separação da BENZA', async () => {
    const { data: t2Products, error: pErr } = await adminClient
      .from('products')
      .select('id, name, slug')
      .eq('tenant_id', TENANT_02_ID);

    expect(pErr).toBeNull();
    expect(t2Products?.length).toBeGreaterThanOrEqual(1);
    expect(t2Products?.some((p: any) => p.slug === 'bolo-de-nozes-baba-de-moca')).toBe(true);

    // Validação de variantes em gramas (g)
    const { data: t2Variants, error: vErr } = await adminClient
      .from('product_variants')
      .select('id, unit_type, unit_value')
      .eq('tenant_id', TENANT_02_ID);

    expect(vErr).toBeNull();
    expect(t2Variants?.some((v: any) => v.unit_type === 'g')).toBe(true);

    // Validação de isolamento total: nenhum ID de produto do Tenant 02 pertence à BENZA
    const { data: benzaProducts } = await adminClient
      .from('products')
      .select('id')
      .eq('tenant_id', TENANT_BENZA_ID);

    const benzaIds = new Set(benzaProducts?.map((p: any) => p.id) || []);
    const overlap = t2Products?.filter((p: any) => benzaIds.has(p.id)) || [];
    expect(overlap.length).toBe(0);
  });
});
