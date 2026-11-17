import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getTenantProducts } from '@/modules/catalog/service';
import {
  hasPromotionalPrice,
  getDiscountPercentage,
  normalizeCompareAtPriceCents,
  getProductDisplayPrice,
} from '@/modules/catalog/pricing';
import {
  validateCartItems,
  createOrderAtomic,
} from '@/modules/orders/orders.service';

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

describe.skipIf(!isConfigured)(
  'Gate Remoto — Migration 00016 (Preço Promocional De/Por e Integridade Financeira)',
  () => {
    const TENANT_BENZA = '00000000-0000-0000-0000-000000000001';
    const TENANT_CACAU = '00000000-0000-0000-0000-000000000002';

    let adminClient: SupabaseClient<any, 'public', any>;
    let anonClient: SupabaseClient<any, 'public', any>;

    const createdOrderIds: string[] = [];
    const createdProductIds: string[] = [];

    beforeAll(() => {
      adminClient = createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false },
      });
      anonClient = createClient(supabaseUrl, anonKey, {
        auth: { persistSession: false },
      });
    });

    afterAll(async () => {
      for (const orderId of createdOrderIds) {
        await adminClient.from('order_deliveries').delete().eq('order_id', orderId);
        await adminClient.from('order_kitchen_steps').delete().eq('order_id', orderId);
        await adminClient.from('order_status_events').delete().eq('order_id', orderId);
        await adminClient.from('order_addresses').delete().eq('order_id', orderId);
        await adminClient.from('order_items').delete().eq('order_id', orderId);
        await adminClient.from('payments').delete().eq('order_id', orderId);
        await adminClient.from('orders').delete().eq('id', orderId);
      }
      if (createdProductIds.length > 0) {
        await adminClient.from('products').delete().in('id', createdProductIds);
      }
    });

    it('1. Deve validar existência de product_variants.compare_at_price_cents, aceitação de NULL e persistência válida', async () => {
      const { error: schemaErr } = await adminClient
        .from('product_variants')
        .select('id, price_in_cents, compare_at_price_cents')
        .limit(1);

      expect(schemaErr).toBeNull();

      const slug = `teste-promo-00016-${Date.now()}`;
      const { data: product, error: prodErr } = await adminClient
        .from('products')
        .insert({
          tenant_id: TENANT_BENZA,
          name: 'Prato Teste Promo 00016',
          slug,
          status: 'active',
          is_featured: false,
        })
        .select('id')
        .single();

      expect(prodErr).toBeNull();
      expect(product?.id).toBeTruthy();
      createdProductIds.push(product!.id);

      const { data: variants, error: varErr } = await adminClient
        .from('product_variants')
        .insert([
          {
            tenant_id: TENANT_BENZA,
            product_id: product!.id,
            name: '500 ml Promocional',
            unit_type: 'ml',
            unit_value: 500,
            price_in_cents: 2990,
            compare_at_price_cents: 3990,
            is_available: true,
            display_order: 1,
          },
          {
            tenant_id: TENANT_BENZA,
            product_id: product!.id,
            name: '1000 ml Normal',
            unit_type: 'ml',
            unit_value: 1000,
            price_in_cents: 4990,
            compare_at_price_cents: null,
            is_available: true,
            display_order: 2,
          },
        ])
        .select('*')
        .order('display_order', { ascending: true });

      expect(varErr).toBeNull();
      expect(variants).toHaveLength(2);
      expect(variants![0].price_in_cents).toBe(2990);
      expect(variants![0].compare_at_price_cents).toBe(3990);
      expect(variants![1].price_in_cents).toBe(4990);
      expect(variants![1].compare_at_price_cents).toBeNull();
    });

    it('2. Regra financeira, snapshot do pedido (order_items.unit_price_cents = 2990) e imutabilidade histórica', async () => {
      const slug = `teste-snapshot-00016-${Date.now()}`;
      const { data: product, error: prodErr } = await adminClient
        .from('products')
        .insert({
          tenant_id: TENANT_BENZA,
          name: 'Prato Snapshot Promo 00016',
          slug,
          status: 'active',
        })
        .select('id')
        .single();

      expect(prodErr).toBeNull();
      createdProductIds.push(product!.id);

      const { data: variant, error: varErr } = await adminClient
        .from('product_variants')
        .insert({
          tenant_id: TENANT_BENZA,
          product_id: product!.id,
          name: '500 ml Oferta',
          unit_type: 'ml',
          unit_value: 500,
          price_in_cents: 2990,
          compare_at_price_cents: 3990,
          is_available: true,
          display_order: 1,
        })
        .select('*')
        .single();

      expect(varErr).toBeNull();

      // Regra de UI derivada (apenas visual)
      expect(hasPromotionalPrice(variant!)).toBe(true);
      expect(getDiscountPercentage(variant!)).toBe(25);

      // Validação do carrinho usa price_in_cents (2990), nunca compare_at_price_cents (3990)
      const cartCheck = await validateCartItems(TENANT_BENZA, [
        {
          productId: product!.id,
          variantId: variant!.id,
          quantity: 2,
          clientPriceInCents: 2990,
        },
      ]);
      expect(cartCheck.isValid).toBe(true);
      expect(cartCheck.subtotalInCents).toBe(5980);

      // Criação do pedido via createOrderAtomic
      const created = await createOrderAtomic(
        TENANT_BENZA,
        {
          items: [
            {
              productId: product!.id,
              variantId: variant!.id,
              quantity: 2,
              clientPriceInCents: 2990,
            },
          ],
          customer: {
            name: 'Cliente Gate 00016',
            phone: '(11) 99999-0016',
          },
          fulfillmentType: 'pickup',
          scheduleType: 'asap',
          paymentMethod: 'cash',
          cashChangeForCents: 10000,
          idempotencyKey: `gate-00016-${Date.now()}`,
        },
        'commerce'
      );

      createdOrderIds.push(created.orderId);

      expect(created.success).toBe(true);
      expect(created.subtotalInCents).toBe(5980);
      expect(created.totalInCents).toBe(5980);

      const { data: orderItemsBefore, error: itemsBeforeErr } = await adminClient
        .from('order_items')
        .select('unit_price_cents, subtotal_cents, quantity')
        .eq('order_id', created.orderId);

      expect(itemsBeforeErr).toBeNull();
      expect(orderItemsBefore).toHaveLength(1);
      expect(orderItemsBefore![0].unit_price_cents).toBe(2990);
      expect(orderItemsBefore![0].subtotal_cents).toBe(5980);

      // Alterar preço da variante após o pedido
      const { error: updateVarErr } = await adminClient
        .from('product_variants')
        .update({
          price_in_cents: 4590,
          compare_at_price_cents: null,
        })
        .eq('id', variant!.id)
        .eq('tenant_id', TENANT_BENZA);

      expect(updateVarErr).toBeNull();

      // Confirmar que o pedido histórico permanece intacto
      const { data: orderAfter } = await adminClient
        .from('orders')
        .select('subtotal_cents, total_cents')
        .eq('id', created.orderId)
        .single();

      const { data: orderItemsAfter, error: itemsAfterErr } = await adminClient
        .from('order_items')
        .select('unit_price_cents, subtotal_cents')
        .eq('order_id', created.orderId);

      expect(itemsAfterErr).toBeNull();
      expect(orderAfter?.subtotal_cents).toBe(5980);
      expect(orderAfter?.total_cents).toBe(5980);
      expect(orderItemsAfter![0].unit_price_cents).toBe(2990);
      expect(orderItemsAfter![0].subtotal_cents).toBe(5980);
    });

    it('3. Normalização: válida (3990/2990), iguais (2990/2990), "De" menor (2490/2990) e sem promoção (NULL)', () => {
      // Válida
      expect(normalizeCompareAtPriceCents(2990, 3990)).toBe(3990);
      expect(hasPromotionalPrice({ price_in_cents: 2990, compare_at_price_cents: 3990 })).toBe(true);

      // Valores iguais -> sem promoção
      expect(normalizeCompareAtPriceCents(2990, 2990)).toBeNull();
      expect(hasPromotionalPrice({ price_in_cents: 2990, compare_at_price_cents: 2990 })).toBe(false);

      // "De" menor que "Por" -> normalizado para null, sem falso desconto
      expect(normalizeCompareAtPriceCents(2990, 2490)).toBeNull();
      expect(hasPromotionalPrice({ price_in_cents: 2990, compare_at_price_cents: 2490 })).toBe(false);
      expect(getDiscountPercentage({ price_in_cents: 2990, compare_at_price_cents: 2490 })).toBeNull();

      // Produto sem promoção (NULL)
      const normalDisplay = getProductDisplayPrice([
        { price_in_cents: 4500, compare_at_price_cents: null, is_available: true },
      ]);
      expect(normalDisplay).toEqual({
        priceInCents: 4500,
        compareAtPriceCents: null,
        hasPromo: false,
        discountPercentage: null,
        hasMultipleVariants: false,
      });
    });

    it('4. Multi-tenant: isolamento entre Tenant 01 e Tenant 02 e bloqueio de escrita anônima', async () => {
      const { data: cacauProduct, error: cpErr } = await adminClient
        .from('products')
        .insert({
          tenant_id: TENANT_CACAU,
          name: 'Produto Cacau Promo Isolado',
          slug: `cacau-promo-${Date.now()}`,
          status: 'active',
        })
        .select('id')
        .single();

      expect(cpErr).toBeNull();
      createdProductIds.push(cacauProduct!.id);

      const { data: cacauVariant, error: cvErr } = await adminClient
        .from('product_variants')
        .insert({
          tenant_id: TENANT_CACAU,
          product_id: cacauProduct!.id,
          name: 'Unidade Cacau',
          unit_type: 'un',
          unit_value: 1,
          price_in_cents: 3990,
          compare_at_price_cents: 4990,
          is_available: true,
          display_order: 1,
        })
        .select('*')
        .single();

      expect(cvErr).toBeNull();

      // Tenant 01 não lista produto/variante do Tenant 02
      const benzaProducts = await getTenantProducts(TENANT_BENZA);
      expect(benzaProducts.some((p) => p.id === cacauProduct!.id)).toBe(false);

      // Tenant 01 não consegue validar carrinho com variante do Tenant 02
      const crossCart = await validateCartItems(TENANT_BENZA, [
        {
          productId: cacauProduct!.id,
          variantId: cacauVariant!.id,
          quantity: 1,
          clientPriceInCents: 3990,
        },
      ]);
      expect(crossCart.isValid).toBe(false);
      expect(crossCart.hasUnavailableItems).toBe(true);

      // Tenant 01 não consegue criar pedido com variante do Tenant 02
      await expect(
        createOrderAtomic(
          TENANT_BENZA,
          {
            items: [
              {
                productId: cacauProduct!.id,
                variantId: cacauVariant!.id,
                quantity: 1,
                clientPriceInCents: 3990,
              },
            ],
            customer: { name: 'Cross Tenant', phone: '(11) 90000-0000' },
            fulfillmentType: 'pickup',
            scheduleType: 'asap',
            paymentMethod: 'cash',
            idempotencyKey: `cross-00016-${Date.now()}`,
          },
          'commerce'
        )
      ).rejects.toThrow();

      // Usuário anônimo não consegue alterar compare_at_price_cents via RLS
      const { data: anonUpdatedRows, error: anonUpdateErr } = await anonClient
        .from('product_variants')
        .update({ compare_at_price_cents: 99999 })
        .eq('id', cacauVariant!.id)
        .select('id');

      expect(Boolean(anonUpdateErr) || (Array.isArray(anonUpdatedRows) && anonUpdatedRows.length === 0)).toBe(true);

      const { data: cacauVariantAfter } = await adminClient
        .from('product_variants')
        .select('compare_at_price_cents')
        .eq('id', cacauVariant!.id)
        .single();

      expect(cacauVariantAfter?.compare_at_price_cents).toBe(4990);
    });
  }
);

