import { createClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { invalidateTenantCache } from '@/lib/tenancy/context';
import { DEFAULT_COMMERCE_SETTINGS, getTenantCommerceSettings } from '@/modules/orders/orders.service';
import { PaymentService } from '@/modules/payments/payment.service';
import type { SiteMode, TenantCommerceSettings } from '@/types/database.types';
import {
  parseStructuredBusinessHours,
  evaluateStoreAvailability,
  evaluateCommercialReadiness,
  getConfiguredScheduleWindows,
  type StructuredBusinessHours,
  type StorePaymentOption,
  type CommercialReadinessResult,
} from './store-config.engine';

export interface SaveStoreCommerceInput {
  siteMode?: SiteMode;
  deliveryEnabled: boolean;
  pickupEnabled: boolean;
  fixedDeliveryFeeCents: number;
  freeDeliveryThresholdCents: number | null;
  minOrderValueCents: number;
  asapEnabled: boolean;
  scheduledEnabled: boolean;
  estimatedDeliveryTimeMin: number;
  estimatedPickupTimeMin: number;
  businessHours: StructuredBusinessHours;
  // Opcionais para configuração do gateway Pix junto na tela da loja
  paymentGateway?: {
    provider: 'mock' | 'asaas';
    isActive: boolean;
    pixEnabled: boolean;
    pixExpirationMinutes: number;
    sandboxMode: boolean;
    apiKey?: string;
    webhookSecret?: string;
  };
}

/**
 * Verifica em tempo real no Supabase se consultas anônimas a `orders` e `order_addresses`
 * estão bloqueadas pela RLS (sem exposição legada de PII).
 */
async function checkAnonOrdersRlsLocked(): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  if (!url || !anonKey || url.includes('placeholder') || anonKey.includes('placeholder')) {
    return true;
  }

  try {
    const anonClient = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const [{ data: ordData, error: ordErr }, { data: addrData, error: addrErr }] = await Promise.all([
      anonClient.from('orders').select('id').limit(1),
      anonClient.from('order_addresses').select('id').limit(1),
    ]);

    const ordSafe = Boolean(ordErr) || (Array.isArray(ordData) && ordData.length === 0);
    const addrSafe = Boolean(addrErr) || (Array.isArray(addrData) && addrData.length === 0);
    return ordSafe && addrSafe;
  } catch {
    return false;
  }
}

export async function checkStoreCommercialReadiness(
  tenantId: string
): Promise<CommercialReadinessResult> {
  const supabase = createAdminClient();

  const [
    rlsAnonOrdersBlocked,
    { data: activeProducts },
    { data: commerceRow },
    { data: settingsRow },
    paymentPublic,
    { data: trackedSettings },
    { data: activeBatches },
  ] = await Promise.all([
    checkAnonOrdersRlsLocked(),
    supabase
      .from('products')
      .select('id, variants:product_variants(id, is_available, price_in_cents)')
      .eq('tenant_id', tenantId)
      .eq('status', 'active'),
    supabase
      .from('tenant_commerce_settings')
      .select('*')
      .eq('tenant_id', tenantId)
      .maybeSingle(),
    supabase
      .from('tenant_settings')
      .select('business_hours')
      .eq('tenant_id', tenantId)
      .maybeSingle(),
    PaymentService.getPublicTenantPaymentSettings(tenantId),
    supabase
      .from('product_variant_stock_settings')
      .select('variant_id')
      .eq('tenant_id', tenantId)
      .eq('track_inventory', true),
    supabase
      .from('inventory_batches')
      .select('variant_id, current_quantity, reserved_quantity')
      .eq('tenant_id', tenantId)
      .eq('batch_type', 'finished_product')
      .eq('status', 'active')
      .gte('expiration_date', new Date().toISOString().split('T')[0]),
  ]);

  const activeProductsWithAvailableVariants = (activeProducts || []).filter((p: any) =>
    (p.variants || []).some((v: any) => v.is_available && Number(v.price_in_cents) > 0)
  ).length;

  const parsedHours = parseStructuredBusinessHours(settingsRow?.business_hours as any);
  const pixGatewayConfigured = Boolean(
    paymentPublic &&
      paymentPublic.isActive &&
      paymentPublic.pixEnabled &&
      paymentPublic.provider !== 'mock' &&
      paymentPublic.hasApiKey
  );

  const trackedVariantIds = new Set((trackedSettings || []).map((t: any) => t.variant_id));
  const variantStockSum = new Map<string, number>();
  for (const b of activeBatches || []) {
    if (!b.variant_id) continue;
    const available = Math.max(0, Number(b.current_quantity) - Number(b.reserved_quantity));
    variantStockSum.set(b.variant_id, (variantStockSum.get(b.variant_id) || 0) + available);
  }
  let trackedVariantsWithAvailableStock = 0;
  for (const vId of trackedVariantIds) {
    if ((variantStockSum.get(vId) || 0) > 0) trackedVariantsWithAvailableStock += 1;
  }

  return evaluateCommercialReadiness({
    rlsAnonOrdersBlocked,
    activeProductsWithAvailableVariants,
    commerceSettings: commerceRow as TenantCommerceSettings | null,
    enabledPaymentMethods: parsedHours.enabled_payment_methods,
    pixGatewayConfigured,
    trackedVariantsCount: trackedVariantIds.size,
    trackedVariantsWithAvailableStock,
  });
}

export async function getAdminStoreConfiguration(tenantId: string) {
  const supabase = createAdminClient();

  const [
    { data: tenant },
    { data: commerceRow },
    { data: settingsRow },
    paymentSettings,
    readiness,
  ] = await Promise.all([
    supabase.from('tenants').select('id, name, slug, site_mode, status').eq('id', tenantId).single(),
    supabase.from('tenant_commerce_settings').select('*').eq('tenant_id', tenantId).maybeSingle(),
    supabase.from('tenant_settings').select('*').eq('tenant_id', tenantId).maybeSingle(),
    PaymentService.getPublicTenantPaymentSettings(tenantId),
    checkStoreCommercialReadiness(tenantId),
  ]);

  const commerceSettings: Omit<TenantCommerceSettings, 'tenant_id' | 'created_at' | 'updated_at'> =
    commerceRow
      ? (commerceRow as TenantCommerceSettings)
      : DEFAULT_COMMERCE_SETTINGS;

  const businessHours = parseStructuredBusinessHours(settingsRow?.business_hours as any);
  const availability = evaluateStoreAvailability(businessHours, commerceSettings, 'asap');

  return {
    tenant,
    hasSavedCommerceRow: Boolean(commerceRow),
    commerceSettings,
    businessHours,
    paymentSettings: paymentSettings || {
      tenantId,
      provider: 'mock' as const,
      isActive: true,
      pixEnabled: true,
      pixExpirationMinutes: 15,
      sandboxMode: true,
      hasApiKey: false,
      hasWebhookSecret: false,
      updatedAt: new Date().toISOString(),
    },
    availability,
    readiness,
  };
}

export async function saveAdminStoreConfiguration(
  tenantId: string,
  input: SaveStoreCommerceInput,
  actorUserId?: string | null
) {
  const supabase = createAdminClient();

  if (!input.deliveryEnabled && !input.pickupEnabled) {
    throw new Error('Habilite pelo menos Entrega ou Retirada para configurar a operação da loja.');
  }

  if (!input.businessHours.enabled_payment_methods || input.businessHours.enabled_payment_methods.length === 0) {
    throw new Error('Selecione pelo menos uma forma de pagamento (Pix, Dinheiro ou Cartão na entrega).');
  }

  // 1. Atualiza ou cria tenant_commerce_settings
  const { error: commErr } = await supabase
    .from('tenant_commerce_settings')
    .upsert({
      tenant_id: tenantId,
      delivery_enabled: input.deliveryEnabled,
      pickup_enabled: input.pickupEnabled,
      fixed_delivery_fee_cents: Math.max(0, Math.round(input.fixedDeliveryFeeCents)),
      free_delivery_threshold_cents:
        input.freeDeliveryThresholdCents && input.freeDeliveryThresholdCents > 0
          ? Math.round(input.freeDeliveryThresholdCents)
          : null,
      min_order_value_cents: Math.max(0, Math.round(input.minOrderValueCents)),
      asap_enabled: input.asapEnabled,
      scheduled_enabled: input.scheduledEnabled,
      estimated_delivery_time_min: Math.max(5, Math.round(input.estimatedDeliveryTimeMin)),
      estimated_pickup_time_min: Math.max(5, Math.round(input.estimatedPickupTimeMin)),
      updated_at: new Date().toISOString(),
    });

  if (commErr) {
    throw new Error(`Falha ao salvar configurações comerciais: ${commErr.message}`);
  }

  // 2. Atualiza tenant_settings.business_hours preservando campos descritivos legados
  const { data: existingSettings } = await supabase
    .from('tenant_settings')
    .select('business_hours')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  const mergedHours = {
    ...(existingSettings?.business_hours && typeof existingSettings.business_hours === 'object'
      ? existingSettings.business_hours
      : {}),
    ...input.businessHours,
  };

  const { error: setErr } = await supabase
    .from('tenant_settings')
    .upsert({
      tenant_id: tenantId,
      business_hours: mergedHours,
      updated_at: new Date().toISOString(),
    });

  if (setErr) {
    throw new Error(`Falha ao salvar horários e meios de pagamento: ${setErr.message}`);
  }

  // 3. Atualiza gateway Pix caso enviado
  if (input.paymentGateway) {
    await PaymentService.updateTenantPaymentSettings(tenantId, {
      provider: input.paymentGateway.provider,
      isActive: input.paymentGateway.isActive,
      pixEnabled: input.paymentGateway.pixEnabled,
      pixExpirationMinutes: input.paymentGateway.pixExpirationMinutes,
      sandboxMode: input.paymentGateway.sandboxMode,
      apiKey: input.paymentGateway.apiKey,
      webhookSecret: input.paymentGateway.webhookSecret,
    });
  }

  // 4. Atualização de site_mode com trava obrigatória de prontidão para 'commerce'
  if (input.siteMode) {
    const { data: currentTenant } = await supabase
      .from('tenants')
      .select('site_mode')
      .eq('id', tenantId)
      .single();

    if (input.siteMode === 'commerce') {
      const readiness = await checkStoreCommercialReadiness(tenantId);
      if (!readiness.canActivate) {
        throw new Error(
          `Não foi possível ativar as vendas online. Pendências: ${readiness.blockers.join(' | ')}`
        );
      }
    }

    if (currentTenant?.site_mode !== input.siteMode) {
      const { error: modeErr } = await supabase
        .from('tenants')
        .update({ site_mode: input.siteMode, updated_at: new Date().toISOString() })
        .eq('id', tenantId);

      if (modeErr) {
        throw new Error(`Falha ao alterar modo do site: ${modeErr.message}`);
      }
    }
  }

  // 5. Auditoria e limpeza de cache
  await supabase.from('audit_logs').insert({
    tenant_id: tenantId,
    actor_id: actorUserId || null,
    action: 'UPDATE_COMMERCE_SETTINGS',
    resource_type: 'tenant_commerce_settings',
    resource_id: tenantId,
    payload_after: {
      siteMode: input.siteMode,
      deliveryEnabled: input.deliveryEnabled,
      pickupEnabled: input.pickupEnabled,
      isStoreOpen: input.businessHours.is_store_open,
      enabledPaymentMethods: input.businessHours.enabled_payment_methods,
    },
  });

  invalidateTenantCache(tenantId);

  return getAdminStoreConfiguration(tenantId);
}

/**
 * Consulta segura de configurações comerciais para o storefront (/api/store/config e checkout).
 */
export async function getPublicStorefrontConfig(tenantId: string, siteMode: SiteMode) {
  const supabase = createAdminClient();
  const [commerceSettings, { data: settingsRow }] = await Promise.all([
    getTenantCommerceSettings(tenantId),
    supabase.from('tenant_settings').select('business_hours').eq('tenant_id', tenantId).maybeSingle(),
  ]);

  const businessHours = parseStructuredBusinessHours(settingsRow?.business_hours as any);
  const availability = evaluateStoreAvailability(businessHours, commerceSettings, 'asap');

  return {
    siteMode,
    availability,
    commerceSettings: {
      deliveryEnabled: commerceSettings.delivery_enabled,
      pickupEnabled: commerceSettings.pickup_enabled,
      fixedDeliveryFeeCents: commerceSettings.fixed_delivery_fee_cents,
      freeDeliveryThresholdCents: commerceSettings.free_delivery_threshold_cents ?? null,
      minOrderValueCents: commerceSettings.min_order_value_cents,
      asapEnabled: commerceSettings.asap_enabled,
      scheduledEnabled: commerceSettings.scheduled_enabled,
      estimatedDeliveryTimeMin: commerceSettings.estimated_delivery_time_min,
      estimatedPickupTimeMin: commerceSettings.estimated_pickup_time_min,
      pricingMode: ((commerceSettings as any).pricing_mode || 'fixed') as
        | 'fixed'
        | 'distance'
        | 'distance_band'
        | 'external_quote',
      maxDeliveryDistanceKm: Number((commerceSettings as any).max_delivery_distance_km ?? 10),
    },
    enabledPaymentMethods: businessHours.enabled_payment_methods as StorePaymentOption[],
    businessHoursSummary: {
      producao: businessHours.producao || null,
      entregas: businessHours.entregas || null,
      enforceSchedule: businessHours.enforce_schedule,
      timezone: businessHours.timezone,
      minScheduleLeadMinutes: businessHours.min_schedule_lead_minutes || 0,
      scheduleWindows: getConfiguredScheduleWindows(businessHours),
      weeklyHours: businessHours.weekly_hours,
    },
  };
}

