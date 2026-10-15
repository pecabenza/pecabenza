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

describe.skipIf(!isConfigured)('Validação Específica — Migration 00006 (Storage & Tenant Assets)', () => {
  let adminClient: SupabaseClient<any, 'public', any>;

  beforeAll(() => {
    adminClient = createClient(supabaseUrl, serviceRoleKey);
  });

  it('1. Deve validar as colunas de conservação e asset_source no banco', async () => {
    // product_information deve aceitar e conter campos de conservação
    const { error: infoErr } = await adminClient
      .from('product_information')
      .select('temp_min, temp_max, shelf_life')
      .limit(1);

    expect(infoErr).toBeNull();

    // products deve conter asset_source e is_mockup
    const { error: prodErr } = await adminClient
      .from('products')
      .select('asset_source, is_mockup')
      .limit(1);

    expect(prodErr).toBeNull();

    // media_assets deve conter asset_source
    const { error: mediaErr } = await adminClient
      .from('media_assets')
      .select('asset_source')
      .limit(1);

    expect(mediaErr).toBeNull();
  });

  it('2. Deve confirmar a existência do bucket tenant-assets no Supabase Storage', async () => {
    const { data: buckets, error } = await adminClient.storage.listBuckets();
    expect(error).toBeNull();

    const tenantBucket = buckets?.find((b: any) => b.id === 'tenant-assets' || b.name === 'tenant-assets');
    expect(tenantBucket).toBeDefined();
    expect(tenantBucket?.public).toBe(true);
  });
});
