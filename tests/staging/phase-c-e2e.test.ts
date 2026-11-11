import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getTenantProducts } from '@/modules/catalog/service';
import {
  getPublicStorefrontConfig,
  checkStoreCommercialReadiness,
} from '@/modules/commerce/store-config.service';
import {
  validateCartItems,
  createOrderAtomic,
  listAdminOrders,
  getAdminOrder,
  confirmManualOrderPayment,
  updateOrderStatus,
  getPublicOrderTracking,
} from '@/modules/orders/orders.service';
import { getTenantSalesDashboardSummary } from '@/modules/orders/sales-dashboard.service';
import { mapOrderDetailToOperationalOrder } from '@/components/admin/orders/order-print-adapter';

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
  'Fase C (C5) — Homologação Ponta a Ponta Controlada no Staging BENZA',
  () => {
    const TENANT_BENZA = '00000000-0000-0000-0000-000000000001';
    let adminClient: SupabaseClient<any, 'public', any>;
    let realActorUserId = '';
    const createdOrderIds: string[] = [];

    beforeAll(async () => {
      adminClient = createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false },
      });
      const { data: tu } = await adminClient
        .from('tenant_members')
        .select('user_id')
        .eq('tenant_id', TENANT_BENZA)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();
      realActorUserId = tu?.user_id || '';
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
    });

    it('C1 + B5: configurações comerciais, pagamentos presenciais (Pix off) e prontidão comercial aprovada mantendo site_mode=prelaunch', async () => {
      const { data: tenantRow } = await adminClient
        .from('tenants')
        .select('site_mode')
        .eq('id', TENANT_BENZA)
        .single();

      expect(tenantRow?.site_mode).toBe('prelaunch');

      const cfg = await getPublicStorefrontConfig(TENANT_BENZA, tenantRow!.site_mode);
      expect(cfg.siteMode).toBe('prelaunch');
      expect(cfg.commerceSettings.deliveryEnabled).toBe(true);
      expect(cfg.commerceSettings.pickupEnabled).toBe(true);
      expect(cfg.commerceSettings.fixedDeliveryFeeCents).toBe(1200);
      expect(cfg.commerceSettings.minOrderValueCents).toBe(3500);
      expect(cfg.enabledPaymentMethods).toEqual(['cash', 'card_on_delivery']);

      const readiness = await checkStoreCommercialReadiness(TENANT_BENZA);
      expect(readiness.canActivate).toBe(true);
      expect(readiness.blockers).toHaveLength(0);
    });

    it('C2: cardápio oficial BENZA possui os 4 pratos ativos com foto via media_assets e variantes limpas', async () => {
      const products = await getTenantProducts(TENANT_BENZA);
      const slugs = products.map((p) => p.slug);

      expect(slugs).toContain('feijoada-benza');
      expect(slugs).toContain('lasanha-tradicional');
      expect(slugs).toContain('rabada-benza');
      expect(slugs).toContain('escondidinho-benza');
      expect(products).toHaveLength(4);

      for (const p of products) {
        expect(p.cover_image_url).toBeTruthy();
        expect(p.cover_image_url).toContain('tenant-assets');
        expect((p.variants || []).length).toBeGreaterThanOrEqual(2);
        for (const v of p.variants || []) {
          expect(v.is_available).toBe(true);
          expect(v.name).not.toMatch(/FEFO|Descarte|Retorno 3E|Teste/i);
        }
      }
    });

    it('C5: fluxo real completo — Cardápio → Carrinho → Checkout → Painel → Impressão → Expedição → Registro da Venda', async () => {
      const products = await getTenantProducts(TENANT_BENZA);
      const feijoada = products.find((p) => p.slug === 'feijoada-benza')!;
      const rabada = products.find((p) => p.slug === 'rabada-benza')!;
      const varFeijoada = feijoada.variants![0];
      const varRabada = rabada.variants![0];

      // 1. Validação do Carrinho (preço oficial + estoque ativo)
      const cartResult = await validateCartItems(TENANT_BENZA, [
        {
          productId: feijoada.id,
          variantId: varFeijoada.id,
          quantity: 1,
          clientPriceInCents: varFeijoada.price_in_cents,
        },
        {
          productId: rabada.id,
          variantId: varRabada.id,
          quantity: 1,
          clientPriceInCents: varRabada.price_in_cents,
        },
      ]);

      expect(cartResult.isValid).toBe(true);
      expect(cartResult.hasUnavailableItems).toBe(false);
      expect(cartResult.subtotalInCents).toBe(varFeijoada.price_in_cents + varRabada.price_in_cents);

      // 2. Checkout controlado (simula modo 'commerce' sem abrir site público no banco)
      const idempotencyKey = `phase-c-e2e-${Date.now()}`;
      const orderPayload = {
        items: [
          {
            productId: feijoada.id,
            variantId: varFeijoada.id,
            quantity: 1,
            clientPriceInCents: varFeijoada.price_in_cents,
          },
          {
            productId: rabada.id,
            variantId: varRabada.id,
            quantity: 1,
            clientPriceInCents: varRabada.price_in_cents,
          },
        ],
        customer: {
          name: 'Cliente Piloto Fase C',
          phone: '(11) 98765-4321',
          email: 'piloto@benza.com.br',
        },
        fulfillmentType: 'delivery' as const,
        scheduleType: 'asap' as const,
        paymentMethod: 'cash' as const,
        cashChangeForCents: 15000,
        idempotencyKey,
        address: {
          zipCode: '01310-100',
          street: 'Avenida Paulista',
          number: '1000',
          neighborhood: 'Bela Vista',
          city: 'São Paulo',
          state: 'SP',
          reference: 'Portaria',
        },
        notes: 'Teste controlado Fase C',
      };

      const created = await createOrderAtomic(TENANT_BENZA, orderPayload, 'commerce');
      createdOrderIds.push(created.orderId);

      expect(created.success).toBe(true);
      expect(created.paymentMethod).toBe('cash');
      expect(created.cashChangeForCents).toBe(15000);
      expect(created.deliveryFeeInCents).toBe(1200);
      expect(created.totalInCents).toBe(cartResult.subtotalInCents + 1200);

      // Verifica idempotência no segundo envio
      const duplicate = await createOrderAtomic(TENANT_BENZA, orderPayload, 'commerce');
      expect(duplicate.idempotent).toBe(true);
      expect(duplicate.orderId).toBe(created.orderId);

      // 3. Painel de Pedidos & Adaptador de Impressão Térmica (C3)
      const adminList = await listAdminOrders(TENANT_BENZA, { limit: 15 });
      expect(adminList.some((o: any) => o.id === created.orderId)).toBe(true);

      const detail = await getAdminOrder(TENANT_BENZA, created.orderId);
      const printable = mapOrderDetailToOperationalOrder(detail);
      expect(printable.orderNumber).toBe(created.orderNumber);
      expect(printable.itemCount).toBe(2);
      expect(printable.paymentMethod).toBe('cash');
      expect(printable.cashChangeForCents).toBe(15000);
      expect(printable.address?.street).toBe('Avenida Paulista');

      // 4. Confirmação de Pagamento & Avanço Operacional até Entrega/Expedição
      await confirmManualOrderPayment(
        TENANT_BENZA,
        created.orderId,
        { paymentMethod: 'cash', notes: 'Recebido na entrega piloto C5' },
        { userId: realActorUserId, role: 'tenant_admin', email: 'piloto@benza.com.br' }
      );

      await updateOrderStatus(TENANT_BENZA, created.orderId, 'confirmed', 'admin');
      await updateOrderStatus(TENANT_BENZA, created.orderId, 'preparing', 'admin');
      await updateOrderStatus(TENANT_BENZA, created.orderId, 'ready', 'admin');
      await updateOrderStatus(TENANT_BENZA, created.orderId, 'out_for_delivery', 'admin');
      await updateOrderStatus(TENANT_BENZA, created.orderId, 'delivered', 'admin');

      const tracking = await getPublicOrderTracking(created.publicTrackingToken);
      expect(tracking).not.toBeNull();
      expect(tracking?.status).toBe('delivered');
      expect(tracking?.paymentStatus).toBe('paid');

      // 5. Registro no Painel Gerencial de Vendas (C4)
      const sales = await getTenantSalesDashboardSummary(TENANT_BENZA);
      expect(sales.todayCount).toBeGreaterThanOrEqual(1);
      expect(sales.paidRevenueCents).toBeGreaterThanOrEqual(created.totalInCents);
      expect(sales.byChannel.some((c) => c.channel === 'website')).toBe(true);
      expect(sales.byPaymentMethod.some((m) => m.method === 'cash')).toBe(true);
    }, 30000);
  }
);

