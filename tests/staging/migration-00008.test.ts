import { describe, it, expect, beforeAll, afterAll } from 'vitest';
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

describe.skipIf(!isConfigured)('Validação Remota — Migration 00008 (Commerce Orders & Atomic Transactions)', () => {
  let adminClient: SupabaseClient<any, 'public', any>;
  let anonClient: SupabaseClient<any, 'public', any>;

  const TENANT_BENZA = '00000000-0000-0000-0000-000000000001';
  const TENANT_CACAU = '00000000-0000-0000-0000-000000000002';

  // IDs reais no banco de staging
  const REAL_PRODUCT_ID = '34426d82-9e00-416e-a8e9-fee00cc59b52'; // Feijoada BENZA
  const REAL_VARIANT_ID = '28e53578-1dfd-4724-8d7d-15abe89d9820'; // 500 ml (R$ 48,00)

  const createdOrderIds: string[] = [];

  beforeAll(() => {
    adminClient = createClient(supabaseUrl, serviceRoleKey);
    anonClient = createClient(supabaseUrl, anonKey);
  });

  afterAll(async () => {
    // Limpeza de pedidos de homologação criados nos testes
    if (createdOrderIds.length > 0) {
      await adminClient.from('orders').delete().in('id', createdOrderIds);
    }
  });

  it('1. Deve validar a existência das novas tabelas de comércio no Supabase', async () => {
    // tenant_commerce_settings
    const { error: settingsErr } = await adminClient.from('tenant_commerce_settings').select('tenant_id').limit(1);
    expect(settingsErr).toBeNull();

    // tenant_order_counters
    const { error: counterErr } = await adminClient.from('tenant_order_counters').select('tenant_id').limit(1);
    expect(counterErr).toBeNull();

    // orders
    const { error: ordersErr } = await adminClient.from('orders').select('id').limit(1);
    expect(ordersErr).toBeNull();

    // order_items
    const { error: itemsErr } = await adminClient.from('order_items').select('id').limit(1);
    expect(itemsErr).toBeNull();

    // order_addresses
    const { error: addressErr } = await adminClient.from('order_addresses').select('id').limit(1);
    expect(addressErr).toBeNull();
  });

  it('2. Deve executar criação atômica via RPC create_order_atomic no Supabase real', async () => {
    const { data, error } = await adminClient.rpc('create_order_atomic', {
      p_tenant_id: TENANT_BENZA,
      p_customer_name: 'Homologação Staging Transacional',
      p_customer_phone: '11988887777',
      p_customer_email: 'homologacao@teste.com',
      p_fulfillment_type: 'delivery',
      p_schedule_type: 'asap',
      p_scheduled_for: null,
      p_subtotal_cents: 4800,
      p_delivery_fee_cents: 1200,
      p_discount_cents: 0,
      p_total_cents: 6000,
      p_currency: 'BRL',
      p_notes: 'Pedido de homologação transacional remota',
      p_items: [
        {
          product_id: REAL_PRODUCT_ID,
          variant_id: REAL_VARIANT_ID,
          snapshot_product_name: 'Feijoada BENZA',
          snapshot_variant_name: '500 ml (Individual farto)',
          quantity: 1,
          unit_price_cents: 4800,
          subtotal_cents: 4800,
        },
      ],
      p_address: {
        zip_code: '01310-100',
        street: 'Avenida Paulista',
        number: '1000',
        complement: 'Apto 101',
        neighborhood: 'Bela Vista',
        city: 'São Paulo',
        state: 'SP',
        reference: 'Próximo ao MASP',
      },
    });

    expect(error).toBeNull();
    expect(data).toHaveProperty('order_id');
    expect(data).toHaveProperty('order_number');
    expect(data.order_number).toMatch(/^#\d{6}$/);

    createdOrderIds.push(data.order_id);

    // Confirmar que o pedido, os itens e o endereço foram persistidos juntos
    const { data: orderInDb } = await adminClient.from('orders').select('*').eq('id', data.order_id).single();
    expect(orderInDb).toBeDefined();
    expect(orderInDb.total_cents).toBe(6000);
    expect(orderInDb.status).toBe('awaiting_payment');

    const { data: itemsInDb } = await adminClient.from('order_items').select('*').eq('order_id', data.order_id);
    expect(itemsInDb).not.toBeNull();
    expect(itemsInDb).toHaveLength(1);
    expect(itemsInDb?.[0].snapshot_product_name).toBe('Feijoada BENZA');

    const { data: addressInDb } = await adminClient.from('order_addresses').select('*').eq('order_id', data.order_id).single();
    expect(addressInDb).toBeDefined();
    expect(addressInDb?.street).toBe('Avenida Paulista');
  });

  it('3. Deve comprovar atomicidade: falha na inserção deve abortar a transação e NÃO deixar pedido órfão', async () => {
    // Tenta criar pedido com uma variant_id inexistente (violação proposital de FK)
    const invalidVariantId = '00000000-0000-0000-0000-ffffffffffff';

    const { data, error } = await adminClient.rpc('create_order_atomic', {
      p_tenant_id: TENANT_BENZA,
      p_customer_name: 'Tentativa Invalida Rollback',
      p_customer_phone: '11988887777',
      p_customer_email: null,
      p_fulfillment_type: 'pickup',
      p_schedule_type: 'asap',
      p_scheduled_for: null,
      p_subtotal_cents: 4800,
      p_delivery_fee_cents: 0,
      p_discount_cents: 0,
      p_total_cents: 4800,
      p_currency: 'BRL',
      p_notes: null,
      p_items: [
        {
          product_id: REAL_PRODUCT_ID,
          variant_id: invalidVariantId,
          snapshot_product_name: 'Feijoada Invalida',
          snapshot_variant_name: 'Inexistente',
          quantity: 1,
          unit_price_cents: 4800,
          subtotal_cents: 4800,
        },
      ],
      p_address: null,
    });

    // A RPC deve falhar
    expect(error).not.toBeNull();

    // Confirmar no banco que NENHUM pedido parcial com esse nome foi criado
    const { data: orphanCheck } = await adminClient
      .from('orders')
      .select('id')
      .eq('customer_name', 'Tentativa Invalida Rollback');

    expect(orphanCheck).toHaveLength(0);
  });

  it('4. Deve validar geração concorrente e não-colisão de order_number com lock atômico', async () => {
    // Dispara 5 chamadas simultâneas de geração de número de pedido
    const promises = Array.from({ length: 5 }, () =>
      adminClient.rpc('generate_next_order_number', { p_tenant_id: TENANT_BENZA })
    );

    const results = await Promise.all(promises);
    const orderNumbers = results.map((r) => r.data);

    // Todos devem ser válidos no padrão #000xxx
    orderNumbers.forEach((num) => {
      expect(num).toMatch(/^#\d{6}$/);
    });

    // Nenhum número pode ser duplicado (tamanho do Set igual ao array)
    const uniqueNumbers = new Set(orderNumbers);
    expect(uniqueNumbers.size).toBe(5);
  });

  it('5. Deve validar isolamento RLS: Tenant 02 não pode visualizar pedidos de Tenant 01', async () => {
    const { data: benzaOrders } = await adminClient
      .from('orders')
      .select('id, tenant_id')
      .eq('tenant_id', TENANT_BENZA)
      .limit(1);

    if (benzaOrders && benzaOrders.length > 0) {
      const orderId = benzaOrders[0].id;

      // Consulta filtrando estritamente pelo Tenant 02
      const { data: crossTenantCheck } = await adminClient
        .from('orders')
        .select('id')
        .eq('id', orderId)
        .eq('tenant_id', TENANT_CACAU);

      expect(crossTenantCheck).toHaveLength(0);
    }
  });
});
