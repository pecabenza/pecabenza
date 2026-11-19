import crypto from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import type { CartItemInput, CreateOrderInput, QuickOrderInput } from './orders.schema';
import type {
  Order,
  OrderItem,
  OrderAddress,
  OrderStatusEvent,
  TenantCommerceSettings,
  SiteMode,
  TenantRole,
  FulfillmentType,
  OrderChannel,
  OrderPaymentMethod,
  ItemPreparationStatus,
  ProductionStation,
  ProductionStationType,
  ProductProductionStep,
  OrderItemProductionStep,
  OrderItemProductionStepStatus,
} from '@/types/database.types';
import { isCommerceEnabled, getCommerceDisabledMessage } from '@/lib/tenancy/site-mode';
import { formatBrl } from '@/modules/cart/cart.utils';
import { validateAndResolveModifiers } from '../catalog/modifiers';
import {
  generateShortTrackingToken,
  generateUniqueShortTrackingToken,
  isValidPublicTrackingToken,
  toShortTrackingToken,
} from './tracking-token';
import {
  DEFAULT_DELIVERED_THANK_YOU_MESSAGE,
  validateScheduledOrderSlot,
} from '@/modules/commerce/store-config.engine';
import {
  computeCanonicalAddressHash,
  computeCanonicalCartHash,
  validateDeliveryQuoteBinding,
} from '@/modules/delivery/delivery-pricing.engine';
import {
  CanonicalOrderStatus,
  CanonicalPaymentStatus,
  StatusEventSource,
  isValidStatusTransition,
  ALLOWED_STATUS_TRANSITIONS,
  ORDER_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  ORDER_CHANNEL_LABELS,
  PAYMENT_METHOD_LABELS,
  FULFILLMENT_TYPE_LABELS,
} from './order-status.machine';
import {
  extractTenantSlaConfig,
  calculatePreparationDueAt,
  calculateOrderSla,
  calculateOperationalPriority,
  calculateStageTimings,
  calculateKdsBottlenecks,
  formatCustomerDisplayNameForKds,
  type KdsOrderCardData,
  type KdsDashboardMetrics,
  type KdsItemChecklist,
  type TenantSlaConfig,
} from './kds.engine';
import {
  calculateStationLoad,
  calculateOrderCriticalPathAndPrediction,
  calculateAdvancedOrderSla,
  calculateRecommendedStartAt,
  calculateMultiStationPriority,
  calculateStationOperationalMetrics,
  calculateProductCalibrationSuggestions,
  type StationLoadMetrics,
  type StationHistoricalPerformance,
  type AdvancedOrderSlaEvaluation,
} from './station-capacity.engine';
import {
  getPublicDeliveryTrackingForOrder,
  type PublicDeliveryTrackingInfo,
} from '@/modules/delivery/delivery.service';
import {
  parseStructuredBusinessHours,
  evaluateStoreAvailability,
  calculateDynamicDeliveryFee,
  type StorePaymentOption,
} from '@/modules/commerce/store-config.engine';
import {
  evaluateCouponApplication,
  normalizeCouponCode,
  type CouponCampaign,
} from '@/modules/commerce/coupon.engine';


export interface ValidatedCartItem {
  productId: string;
  productName: string;
  variantId: string;
  variantName: string;
  unitValue?: number;
  unitType?: string;
  coverImageUrl?: string | null;
  quantity: number;
  unitPriceInCents: number;
  subtotalInCents: number;
}

export interface ValidationIssue {
  type: 'price_change' | 'unavailable' | 'cross_tenant';
  message: string;
  variantId: string;
  productId?: string;
  oldPriceInCents?: number;
  newPriceInCents?: number;
}

export interface CartValidationResult {
  isValid: boolean;
  hasPriceChanges: boolean;
  hasUnavailableItems: boolean;
  validatedItems: ValidatedCartItem[];
  subtotalInCents: number;
  formattedSubtotal: string;
  issues: ValidationIssue[];
}

// Configurações padrão de comércio se a tabela não tiver registro específico
export const DEFAULT_COMMERCE_SETTINGS: Omit<TenantCommerceSettings, 'tenant_id' | 'created_at' | 'updated_at'> = {
  delivery_enabled: true,
  pickup_enabled: true,
  fixed_delivery_fee_cents: 1200, // R$ 12,00
  free_delivery_threshold_cents: null,
  min_order_value_cents: 3000, // R$ 30,00
  asap_enabled: true,
  scheduled_enabled: true,
  estimated_delivery_time_min: 60,
  estimated_pickup_time_min: 30,
  target_confirmation_time_min: 5,
  target_preparation_time_min: 25,
  sla_warning_buffer_min: 5,
  schedule_preparation_buffer_min: 5,
};

// Fallback mock para ambiente local e testes
const MOCK_CATALOG = [
  {
    productId: '00000000-0000-0000-0000-000000000101',
    productName: 'Feijoada BENZA',
    tenantId: '00000000-0000-0000-0000-000000000001',
    status: 'active',
    coverImageUrl: '/assets/brands/benza/products/mockup-feijoada.jpg',
    variants: [
      { id: 'var-01', name: '500 ml (Individual farto)', priceInCents: 4800, isAvailable: true, unitValue: 500, unitType: 'ml' },
      { id: 'var-02', name: '1000 ml (Para compartilhar)', priceInCents: 8900, isAvailable: true, unitValue: 1000, unitType: 'ml' },
    ],
  },
  {
    productId: '00000000-0000-0000-0000-000000000102',
    productName: 'Escondidinho de Carne Seca',
    tenantId: '00000000-0000-0000-0000-000000000001',
    status: 'active',
    coverImageUrl: '/assets/brands/benza/products/mockup-escondidinho.jpg',
    variants: [
      { id: 'var-03', name: '600 g (Individual)', priceInCents: 5400, isAvailable: true, unitValue: 600, unitType: 'g' },
      { id: 'var-04', name: '1200 g (Familiar)', priceInCents: 9800, isAvailable: true, unitValue: 1200, unitType: 'g' },
    ],
  },
  {
    productId: '00000000-0000-0000-0000-000000000201',
    productName: 'Bolo de Cacau Puro',
    tenantId: '00000000-0000-0000-0000-000000000002', // Tenant 02 (Cacau & Flor)
    status: 'active',
    coverImageUrl: null,
    variants: [
      { id: 'var-cacau-01', name: 'Fatia 150g', priceInCents: 2200, isAvailable: true, unitValue: 150, unitType: 'g' },
    ],
  },
];

/**
 * Busca configurações comerciais de um tenant.
 */
export async function getTenantCommerceSettings(tenantId: string): Promise<TenantCommerceSettings> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('tenant_commerce_settings')
      .select('*')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (!error && data) {
      return data as TenantCommerceSettings;
    }
  } catch {
    // Silently fall back to defaults
  }

  return {
    tenant_id: tenantId,
    ...DEFAULT_COMMERCE_SETTINGS,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

/**
 * REGRA CRÍTICA — SERVIDOR COMO FONTE DE VERDADE
 * 
 * Revalida todos os itens do carrinho diretamente contra os dados reais do banco Supabase.
 * Preços enviados pelo cliente (localStorage) são IGNORADOS para fins de cálculo financeiro.
 * Se o cliente enviou um preço diferente do preço oficial, gera issue informando a alteração.
 */
export async function validateCartItems(
  tenantId: string,
  items: CartItemInput[]
): Promise<CartValidationResult> {
  const validatedItems: ValidatedCartItem[] = [];
  const issues: ValidationIssue[] = [];

  const supabase = createAdminClient();
  const variantIds = items.map((i) => i.variantId);

  // 1. Tentar buscar variantes e produtos oficiais no Supabase
  let realVariants: any[] = [];
  try {
    const { data, error } = await supabase
      .from('product_variants')
      .select('*, product:products(*)')
      .eq('tenant_id', tenantId)
      .in('id', variantIds);

    if (!error && data && data.length > 0) {
      realVariants = data;
    }
  } catch {
    // fallback para mock local em ambiente dev
  }

  // 1.1 Verificar saldo em estoque exclusivamente para variantes com track_inventory = true (Etapa 3D)
  const trackedStockAvailableMap = new Map<string, number>();
  const strictlyTrackedVariantIds = new Set<string>();
  if (realVariants.length > 0) {
    try {
      const realVarIds = realVariants.map((v: any) => v.id);
      const { data: stockSettings } = await supabase
        .from('product_variant_stock_settings')
        .select('variant_id, track_inventory')
        .eq('tenant_id', tenantId)
        .in('variant_id', realVarIds);

      for (const s of stockSettings || []) {
        if (s.track_inventory === true) {
          strictlyTrackedVariantIds.add(s.variant_id);
        }
      }

      if (strictlyTrackedVariantIds.size > 0) {
        const todayStr = new Date().toISOString().split('T')[0];
        const { data: batches } = await supabase
          .from('inventory_batches')
          .select('variant_id, current_quantity, reserved_quantity')
          .eq('tenant_id', tenantId)
          .eq('batch_type', 'finished_product')
          .eq('status', 'active')
          .gte('expiration_date', todayStr)
          .in('variant_id', Array.from(strictlyTrackedVariantIds));

        for (const b of batches || []) {
          if (!b.variant_id) continue;
          const avail = Math.max(0, Number(b.current_quantity) - Number(b.reserved_quantity));
          trackedStockAvailableMap.set(
            b.variant_id,
            (trackedStockAvailableMap.get(b.variant_id) || 0) + avail
          );
        }
      }
    } catch {
      // Se tabelas de estoque ainda não existirem em mock local, mantém fluxo resiliente
    }
  }

    // 1.2 Carregar grupos de complementos dos produtos reais (se migration 00017 existir)
  const modifierGroupsByProduct = new Map<string, any[]>();
  if (realVariants.length > 0) {
    try {
      const productIds = Array.from(new Set(realVariants.map((v: any) => v.product_id)));
      const { data: modGroups } = await supabase
        .from('product_modifier_groups')
        .select('*, options:product_modifier_options(*)')
        .eq('tenant_id', tenantId)
        .in('product_id', productIds)
        .order('display_order', { ascending: true });

      for (const g of modGroups || []) {
        const list = modifierGroupsByProduct.get(g.product_id) || [];
        list.push(g);
        modifierGroupsByProduct.set(g.product_id, list);
      }
    } catch {
      // Tabelas de complementos opcionais
    }
  }

  // 2. Iterar sobre cada item solicitado pelo cliente
  const cumulativeQtyByVariant = new Map<string, number>();
  for (const item of items) {
    let foundVariant = realVariants.find((v) => v.id === item.variantId);
    let foundProduct = foundVariant?.product;

    // Fallback para mock local se não conectado
    if (!foundVariant) {
      for (const p of MOCK_CATALOG) {
        const v = p.variants.find((variant) => variant.id === item.variantId);
        if (v) {
          // Checagem estrita de tenant isolation
          if (p.tenantId !== tenantId) {
            issues.push({
              type: 'cross_tenant',
              message: `O item solicitado pertence a outro estabelecimento e não pode ser comprado aqui.`,
              variantId: item.variantId,
              productId: p.productId,
            });
            break;
          }

          foundProduct = {
            id: p.productId,
            name: p.productName,
            status: p.status,
            cover_image_url: p.coverImageUrl,
            tenant_id: p.tenantId,
          };
          foundVariant = {
            id: v.id,
            name: v.name,
            price_in_cents: v.priceInCents,
            is_available: v.isAvailable,
            unit_value: v.unitValue,
            unit_type: v.unitType,
            product_id: p.productId,
            tenant_id: p.tenantId,
          };
          break;
        }
      }
    }

    // Se a variante não foi encontrada ou não pertence a este tenant
    if (!foundVariant || !foundProduct) {
      issues.push({
        type: 'unavailable',
        message: 'Porção ou prato não encontrado para este cardápio.',
        variantId: item.variantId,
        productId: item.productId,
      });
      continue;
    }

    // Validação de produto ativo
    if (foundProduct.status !== 'active') {
      issues.push({
        type: 'unavailable',
        message: `O prato "${foundProduct.name}" não está ativo no momento.`,
        variantId: item.variantId,
        productId: foundProduct.id,
      });
      continue;
    }

    // Validação de variante disponível
    if (!foundVariant.is_available) {
      issues.push({
        type: 'unavailable',
        message: `A porção "${foundVariant.name}" de "${foundProduct.name}" está temporariamente esgotada.`,
        variantId: item.variantId,
        productId: foundProduct.id,
      });
      continue;
    }

    // Validação de saldo físico em estoque (somente quando track_inventory = true na Etapa 3D)
    const cumulativeVariantQty =
      (cumulativeQtyByVariant.get(foundVariant.id) || 0) + item.quantity;
    cumulativeQtyByVariant.set(foundVariant.id, cumulativeVariantQty);

    if (strictlyTrackedVariantIds.has(foundVariant.id)) {
      const availableQty = trackedStockAvailableMap.get(foundVariant.id) || 0;
      if (availableQty < cumulativeVariantQty) {
        issues.push({
          type: 'unavailable',
          message:
            availableQty <= 0
              ? `A porção "${foundVariant.name}" de "${foundProduct.name}" está sem saldo disponível no freezer.`
              : `Quantidade insuficiente para "${foundProduct.name} (${foundVariant.name})". Disponível: ${availableQty}.`,
          variantId: item.variantId,
          productId: foundProduct.id,
        });
        continue;
      }
    }

    // Validação de complementos / adicionais (se o produto possuir grupos configurados)
    const productModifierGroups = modifierGroupsByProduct.get(foundProduct.id) || [];
    const modifierValidation = validateAndResolveModifiers(
      productModifierGroups,
      item.selectedModifierOptionIds || []
    );
    if (!modifierValidation.valid) {
      issues.push({
        type: 'unavailable',
        message: modifierValidation.error || `Complementos inválidos para "${foundProduct.name}".`,
        variantId: item.variantId,
        productId: foundProduct.id,
      });
      continue;
    }

    // Preço oficial do banco (servidor como fonte de verdade) + complementos
    const officialPriceInCents =
      Number(foundVariant.price_in_cents) + modifierValidation.extraPriceCents;

    const modifierSummary = modifierValidation.selectedSnapshots
      .map((m) => m.optionName)
      .join(', ');
    const snapshotVariantName = modifierSummary
      ? `${foundVariant.name} (+ ${modifierSummary})`.slice(0, 100)
      : foundVariant.name;

    // Detecção de alteração de preço em relação ao que o navegador tinha em cache
    if (
      item.clientPriceInCents !== undefined &&
      item.clientPriceInCents !== officialPriceInCents
    ) {
      issues.push({
        type: 'price_change',
        message: `O preço de "${foundProduct.name} (${snapshotVariantName})" foi atualizado de ${formatBrl(item.clientPriceInCents)} para ${formatBrl(officialPriceInCents)}. Revise seu pedido.`,
        variantId: item.variantId,
        productId: foundProduct.id,
        oldPriceInCents: item.clientPriceInCents,
        newPriceInCents: officialPriceInCents,
      });
    }

    const itemSubtotal = officialPriceInCents * item.quantity;

    validatedItems.push({
      productId: foundProduct.id,
      productName: foundProduct.name,
      variantId: foundVariant.id,
      variantName: snapshotVariantName,
      unitValue: foundVariant.unit_value,
      unitType: foundVariant.unit_type,
      coverImageUrl: foundProduct.cover_image_url,
      quantity: item.quantity,
      unitPriceInCents: officialPriceInCents,
      subtotalInCents: itemSubtotal,
    });
  }

  const subtotalInCents = validatedItems.reduce((acc, item) => acc + item.subtotalInCents, 0);

  const hasPriceChanges = issues.some((i) => i.type === 'price_change');
  const hasUnavailableItems = issues.some(
    (i) => i.type === 'unavailable' || i.type === 'cross_tenant'
  );

  return {
    isValid: issues.length === 0 && validatedItems.length > 0,
    hasPriceChanges,
    hasUnavailableItems,
    validatedItems,
    subtotalInCents,
    formattedSubtotal: formatBrl(subtotalInCents),
    issues,
  };
}

/**
 * Criação atômica de pedido no banco de dados.
 */
export async function createOrderAtomic(
  tenantId: string,
  input: CreateOrderInput,
  siteMode?: SiteMode | null
) {
  // 1. Bloqueio por Site Mode se o tenant não estiver habilitado para vendas
  if (!isCommerceEnabled(siteMode)) {
    throw new Error(getCommerceDisabledMessage(siteMode));
  }

  // 2. Revalidação estrita do carrinho (Servidor é a única autoridade de preços e itens)
  const validation = await validateCartItems(tenantId, input.items);

  if (!validation.isValid) {
    const errorMsg = validation.issues.map((i) => i.message).join(' | ');
    throw new Error(`Não foi possível confirmar o pedido: ${errorMsg}`);
  }

  // 3. Buscar configurações comerciais e horários do tenant
  const supabase = createAdminClient();
  const [settings, { data: tenantSettingsRow }] = await Promise.all([
    getTenantCommerceSettings(tenantId),
    supabase.from('tenant_settings').select('business_hours').eq('tenant_id', tenantId).maybeSingle(),
  ]);

  const businessHours = parseStructuredBusinessHours(tenantSettingsRow?.business_hours as any);

  // 3.1 Validar loja aberta / horários de atendimento
  const availability = evaluateStoreAvailability(businessHours, settings, input.scheduleType);
  if (!availability.open) {
    throw new Error(availability.reason || 'A loja está temporariamente fechada para novos pedidos.');
  }

  // 3.2 Validar modalidade de pagamento habilitada
  const requestedPaymentMethod = (input.paymentMethod || 'pix') as StorePaymentOption;
  if (!businessHours.enabled_payment_methods.includes(requestedPaymentMethod)) {
    throw new Error(
      `A forma de pagamento "${requestedPaymentMethod}" não está habilitada neste estabelecimento.`
    );
  }

  // 3.3 Idempotência por chave do cliente (evita pedidos duplicados por clique duplo)
  const cleanIdempotencyKey = input.idempotencyKey?.trim() || null;
  if (cleanIdempotencyKey) {
    const { data: existingOrder } = await supabase
      .from('orders')
      .select(
        'id, order_number, public_tracking_token, subtotal_cents, delivery_fee_cents, total_cents, fulfillment_type, payment_method, cash_change_for_cents, scheduled_for'
      )
      .eq('tenant_id', tenantId)
      .eq('idempotency_key', cleanIdempotencyKey)
      .maybeSingle();

    if (existingOrder?.id) {
      return {
        success: true,
        idempotent: true,
        orderId: existingOrder.id,
        orderNumber: existingOrder.order_number,
        publicTrackingToken: existingOrder.public_tracking_token,
        status: 'awaiting_payment' as const,
        paymentMethod: (existingOrder.payment_method || requestedPaymentMethod) as StorePaymentOption,
        cashChangeForCents: existingOrder.cash_change_for_cents ?? null,
        subtotalInCents: existingOrder.subtotal_cents,
        deliveryFeeInCents: existingOrder.delivery_fee_cents,
        totalInCents: existingOrder.total_cents,
        formattedSubtotal: formatBrl(existingOrder.subtotal_cents),
        formattedDeliveryFee: formatBrl(existingOrder.delivery_fee_cents),
        formattedTotal: formatBrl(existingOrder.total_cents),
        fulfillmentType: existingOrder.fulfillment_type,
        customerName: input.customer.name,
        customerPhone: input.customer.phone,
        items: validation.validatedItems,
        scheduledFor: existingOrder.scheduled_for || null,
      };
    }
  }

  // 4. Validar pedido mínimo
  if (validation.subtotalInCents < settings.min_order_value_cents) {
    throw new Error(
      `O valor mínimo para pedidos é de ${formatBrl(settings.min_order_value_cents)}. Seu subtotal atual é ${validation.formattedSubtotal}.`
    );
  }

  // 5. Validar modalidade de recebimento (Entrega vs Retirada) e calcular frete autoritativo
  if (input.fulfillmentType === 'delivery') {
    if (!settings.delivery_enabled) {
      throw new Error('A modalidade de entrega está temporariamente indisponível.');
    }
    if (!input.address) {
      throw new Error('Endereço completo de entrega é obrigatório.');
    }
  } else if (input.fulfillmentType === 'pickup') {
    if (!settings.pickup_enabled) {
      throw new Error('A modalidade de retirada está temporariamente indisponível.');
    }
  }

  let deliveryFeeCents = 0;
  let quoteRpcParams: Record<string, any> = {};
  const pricingMode = ((settings as any).pricing_mode || 'fixed') as string;
  const requiresLinkedDeliveryQuote =
    input.fulfillmentType === 'delivery' &&
    (pricingMode === 'distance' || pricingMode === 'distance_band');

  if (requiresLinkedDeliveryQuote) {
    if (!input.deliveryQuoteId) {
      throw new Error('Cotação de entrega obrigatória não informada. Recalcule o frete antes de confirmar.');
    }

    const { data: quoteRow, error: quoteErr } = await supabase
      .from('delivery_quotes')
      .select(
        'id, tenant_id, checkout_session_id, pricing_rule_version, address_hash, cart_hash, server_subtotal_cents, final_fee_cents, status, used_order_id, expires_at'
      )
      .eq('tenant_id', tenantId)
      .eq('id', input.deliveryQuoteId)
      .maybeSingle();

    if (quoteErr || !quoteRow) {
      throw new Error('Cotação de entrega não localizada para este estabelecimento.');
    }

    const expectedAddressHash = computeCanonicalAddressHash({
      ...input.address!,
      confirmedCoords: input.confirmedPin || null,
    });
    const expectedCartHash = computeCanonicalCartHash(input.items);
    const expectedRuleVersion = Number((settings as any).pricing_rule_version || 1);

    const bindingCheck = validateDeliveryQuoteBinding(
      {
        id: quoteRow.id,
        tenantId: quoteRow.tenant_id,
        status: quoteRow.status,
        usedOrderId: quoteRow.used_order_id,
        expiresAt: quoteRow.expires_at,
        addressHash: quoteRow.address_hash,
        cartHash: quoteRow.cart_hash,
        pricingRuleVersion: quoteRow.pricing_rule_version,
        finalFeeCents: quoteRow.final_fee_cents,
      },
      {
        tenantId,
        addressHash: expectedAddressHash,
        cartHash: expectedCartHash,
        pricingRuleVersion: expectedRuleVersion,
      }
    );
    if (!bindingCheck.valid) {
      throw new Error(bindingCheck.reason || 'Cotação de entrega inválida ou expirada.');
    }

    if (
      quoteRow.checkout_session_id &&
      quoteRow.checkout_session_id !== (input.checkoutSessionId || null)
    ) {
      throw new Error('Sessão de checkout divergente da cotação de entrega.');
    }

    if (Number(quoteRow.server_subtotal_cents) !== validation.subtotalInCents) {
      throw new Error('O subtotal do pedido foi alterado após a cotação de entrega. Recalcule o frete.');
    }

    deliveryFeeCents = Number(quoteRow.final_fee_cents);
    quoteRpcParams = {
      p_delivery_quote_id: quoteRow.id,
      p_quote_address_hash: expectedAddressHash,
      p_quote_cart_hash: expectedCartHash,
      p_quote_pricing_rule_version: expectedRuleVersion,
      p_quote_checkout_session_id: input.checkoutSessionId || null,
    };
  } else {
    deliveryFeeCents = calculateDynamicDeliveryFee(
      validation.subtotalInCents,
      input.fulfillmentType,
      settings
    );
  }

  // 6. Validar agendamento (autoridade no servidor: data, janela, fuso, dia aberto e modalidade)
  if (input.scheduleType === 'scheduled') {
    const slotCheck = validateScheduledOrderSlot(businessHours, settings, {
      scheduledFor: input.scheduledFor,
      scheduledWindow: input.scheduledWindow,
      fulfillmentType: input.fulfillmentType,
    });
    if (!slotCheck.valid) {
      throw new Error(slotCheck.reason || 'Horário de agendamento indisponível.');
    }
  } else if (!settings.asap_enabled) {
    throw new Error('Pedidos imediatos estão desabilitados no momento. Selecione agendamento.');
  }

  const subtotalCents = validation.subtotalInCents;

  // 6b. Validação autoritativa de cupom de desconto (se informado no checkout)
  let discountCents = 0;
  let appliedCoupon: CouponCampaign | null = null;
  if (input.couponCode && input.couponCode.trim()) {
    const couponEval = evaluateCouponApplication(
      businessHours.coupon_campaigns || [],
      input.couponCode,
      subtotalCents
    );
    if (!couponEval.valid || !couponEval.coupon) {
      throw new Error(couponEval.error || 'Cupom de desconto inválido ou expirado.');
    }
    discountCents = couponEval.discountCents;
    appliedCoupon = couponEval.coupon;
  }

  const totalCents = Math.max(0, subtotalCents + deliveryFeeCents - discountCents);

  // 7. Persistência atômica estrita via PostgreSQL RPC (nunca retorna sucesso fictício em falha)
  const orderItemsPayload = validation.validatedItems.map((item) => ({
    product_id: item.productId,
    variant_id: item.variantId,
    snapshot_product_name: item.productName,
    snapshot_variant_name: item.variantName,
    quantity: item.quantity,
    unit_price_cents: item.unitPriceInCents,
    subtotal_cents: item.subtotalInCents,
  }));

  const orderAddressPayload =
    input.fulfillmentType === 'delivery' && input.address
      ? {
          zip_code: input.address.zipCode,
          street: input.address.street,
          number: input.address.number,
          complement: input.address.complement || null,
          neighborhood: input.address.neighborhood,
          city: input.address.city,
          state: input.address.state,
          reference: input.address.reference || null,
        }
      : null;

  let publicTrackingToken = generateShortTrackingToken();

  const noteParts = [
    input.notes?.trim(),
    input.scheduleType === 'scheduled' && input.scheduledWindow
      ? `[Janela agendada: ${input.scheduledWindow}]`
      : null,
    appliedCoupon
      ? `[Cupom ${appliedCoupon.code}: -${formatBrl(discountCents)}]`
      : null,
  ].filter(Boolean);
  const finalNotes = noteParts.length > 0 ? noteParts.join(' | ') : null;

  const useDistanceQuoteRpc =
    input.fulfillmentType === 'delivery' &&
    (pricingMode === 'distance' || pricingMode === 'distance_band');
  const rpcFunctionName = useDistanceQuoteRpc
    ? 'create_order_with_delivery_quote_atomic'
    : 'create_order_atomic';

  const { data: rpcData, error: rpcError } = await supabase.rpc(rpcFunctionName, {
    p_tenant_id: tenantId,
    p_customer_name: input.customer.name,
    p_customer_phone: input.customer.phone,
    p_customer_email: input.customer.email || null,
    p_fulfillment_type: input.fulfillmentType,
    p_schedule_type: input.scheduleType,
    p_scheduled_for: input.scheduledFor || null,
    p_subtotal_cents: subtotalCents,
    p_delivery_fee_cents: deliveryFeeCents,
    p_discount_cents: discountCents,
    p_total_cents: totalCents,
    p_currency: 'BRL',
    p_notes: finalNotes,
    p_items: orderItemsPayload,
    p_address: orderAddressPayload,
    ...(useDistanceQuoteRpc ? quoteRpcParams : {}),
  });

  if (rpcError) {
    throw new Error(`Falha ao registrar pedido no banco de dados: ${rpcError.message}`);
  }

  if (!rpcData || !rpcData.order_id || !rpcData.order_number) {
    throw new Error('Falha de integridade: o banco de dados não retornou um identificador válido para o pedido.');
  }

  const orderId: string = rpcData.order_id;
  const orderNumber: string = rpcData.order_number;

  // Atualiza campos comerciais complementares (token público, método de pagamento, troco e idempotência)
  const updateOrderPayload: Record<string, any> = {
    public_tracking_token: publicTrackingToken,
    payment_method: requestedPaymentMethod,
    cash_change_for_cents:
      requestedPaymentMethod === 'cash' && input.cashChangeForCents ? input.cashChangeForCents : null,
    order_channel: 'website',
  };
  if (cleanIdempotencyKey) {
    updateOrderPayload.idempotency_key = cleanIdempotencyKey;
  }

  const { data: updatedWithToken, error: updErr } = await supabase
    .from('orders')
    .update(updateOrderPayload)
    .eq('tenant_id', tenantId)
    .eq('id', orderId)
    .select('public_tracking_token')
    .maybeSingle();

  if (updErr) {
    throw new Error(`Pedido ${orderNumber} criado, porém falhou ao vincular metadados: ${updErr.message}`);
  }

  if (updatedWithToken?.public_tracking_token) {
    publicTrackingToken = updatedWithToken.public_tracking_token;
  }

  // Incrementa contador de uso da campanha de cupom aplicada
  if (appliedCoupon && tenantSettingsRow?.business_hours) {
    try {
      const rawHours = tenantSettingsRow.business_hours as Record<string, unknown>;
      const updatedCampaigns = (businessHours.coupon_campaigns || []).map((c) =>
        normalizeCouponCode(c.code) === normalizeCouponCode(appliedCoupon!.code)
          ? { ...c, usedCount: c.usedCount + 1 }
          : c
      );
      await supabase
        .from('tenant_settings')
        .update({
          business_hours: {
            ...rawHours,
            coupon_campaigns: updatedCampaigns,
          },
        })
        .eq('tenant_id', tenantId);
    } catch {
      // não interrompe o pedido se a contagem falhar
    }
  }

  // Registra evento inicial imutável em order_status_events
  await supabase.from('order_status_events').insert({
    tenant_id: tenantId,
    order_id: orderId,
    from_status: null,
    to_status: 'pending',
    source: 'system',
    metadata: {
      action: 'order_created',
      fulfillmentType: input.fulfillmentType,
      scheduleType: input.scheduleType,
      paymentMethod: requestedPaymentMethod,
    },
  });

  return {
    success: true,
    idempotent: false,
    orderId,
    orderNumber,
    publicTrackingToken,
    status: 'awaiting_payment' as const,
    paymentMethod: requestedPaymentMethod,
    cashChangeForCents:
      requestedPaymentMethod === 'cash' && input.cashChangeForCents ? input.cashChangeForCents : null,
    subtotalInCents: subtotalCents,
    deliveryFeeInCents: deliveryFeeCents,
    totalInCents: totalCents,
    formattedSubtotal: formatBrl(subtotalCents),
    formattedDeliveryFee: formatBrl(deliveryFeeCents),
    formattedTotal: formatBrl(totalCents),
    fulfillmentType: input.fulfillmentType,
    customerName: input.customer.name,
    customerPhone: input.customer.phone,
    items: validation.validatedItems,
    scheduledFor: input.scheduledFor || null,
  };
}

/**
 * Atualiza o status do pedido validando rigorosamente a máquina de estados (Etapa 2C)
 */
export async function updateOrderStatus(
  tenantId: string,
  orderId: string,
  toStatus: CanonicalOrderStatus,
  source: StatusEventSource,
  actorUserId?: string | null,
  metadata?: Record<string, any>
) {
  const supabase = createAdminClient();

  // 1. Busca pedido e verifica status atual
  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .select('id, status, fulfillment_type, payment_status')
    .eq('tenant_id', tenantId)
    .eq('id', orderId)
    .single();

  if (orderErr || !order) {
    throw new Error('Pedido não localizado.');
  }

  const fromStatus = order.status as CanonicalOrderStatus;

  // 2. Validação da máquina de estados no domínio TypeScript
  const validation = isValidStatusTransition(fromStatus, toStatus, {
    fulfillmentType: order.fulfillment_type as FulfillmentType,
  });

  if (!validation.valid) {
    throw new Error(validation.reason);
  }

  // Se transição idempotente (mesmo status), retorna no-op
  if (fromStatus === toStatus) {
    return {
      success: true,
      idempotent: true,
      orderId,
      status: toStatus,
    };
  }

  // 3. Regra de cancelamento com pagamento já liquidado
  const finalMetadata = { ...(metadata || {}) };
  if (toStatus === 'cancelled' && order.payment_status === 'paid') {
    finalMetadata.requires_manual_refund = true;
    finalMetadata.notice = 'Pedido pago cancelado; estorno manual necessário no gateway.';
  }

  // 4. Execução da RPC atômica no PostgreSQL
  const { data: rpcResult, error: rpcError } = await supabase.rpc('update_order_status_atomic', {
    p_tenant_id: tenantId,
    p_order_id: orderId,
    p_to_status: toStatus,
    p_source: source,
    p_actor_user_id: actorUserId || null,
    p_metadata: finalMetadata,
  });

  if (rpcError) {
    // Fallback direto se a migration RPC ainda não estiver ativa (ex: testes locais com mock)
    await supabase
      .from('orders')
      .update({ status: toStatus, updated_at: new Date().toISOString() })
      .eq('tenant_id', tenantId)
      .eq('id', orderId);

    await supabase.from('order_status_events').insert({
      tenant_id: tenantId,
      order_id: orderId,
      from_status: fromStatus,
      to_status: toStatus,
      source,
      actor_user_id: actorUserId || null,
      metadata: finalMetadata,
    });
  }

  // 5. Integração com Estoque (Etapa 3D): Reserva, Liberação e Baixa Definitiva (FEFO)
  try {
    if (toStatus === 'confirmed') {
      await supabase.rpc('reserve_order_inventory_atomic', {
        p_tenant_id: tenantId,
        p_order_id: orderId,
      });
    } else if (toStatus === 'cancelled') {
      await supabase.rpc('release_order_inventory_reservation_atomic', {
        p_tenant_id: tenantId,
        p_order_id: orderId,
        p_reason: 'Pedido cancelado',
      });
    } else if (toStatus === 'out_for_delivery' || toStatus === 'delivered') {
      await supabase.rpc('commit_order_inventory_deduction_atomic', {
        p_tenant_id: tenantId,
        p_order_id: orderId,
        p_actor_user_id: actorUserId || null,
      });
    }
  } catch (invErr: any) {
    // Resiliente caso RPC de estoque não esteja disponível ou seja mock
  }

  return {
    success: true,
    idempotent: false,
    orderId,
    fromStatus,
    toStatus,
  };
}

/**
 * Consulta pública e segura de acompanhamento de pedido (Sem vazamento de PII)
 */
export async function getPublicOrderTracking(publicToken: string, tenantId: string) {
  if (!tenantId || typeof tenantId !== 'string' || !tenantId.trim()) {
    return null;
  }

  if (!isValidPublicTrackingToken(publicToken)) {
    return null;
  }

  const supabase = createAdminClient();

  const selectCols = `
      id,
      tenant_id,
      order_number,
      public_tracking_token,
      fulfillment_type,
      schedule_type,
      scheduled_for,
      status,
      payment_status,
      subtotal_cents,
      delivery_fee_cents,
      total_cents,
      notes,
      created_at,
      customer_name,
      customer_phone
    `;

  // 1. Busca pedido via token público seguro com isolamento estrito por tenant_id na query
  let { data: order, error: orderErr } = await supabase
    .from('orders')
    .select(selectCols)
    .eq('tenant_id', tenantId)
    .eq('public_tracking_token', publicToken)
    .maybeSingle();

  if (!order && !orderErr && publicToken.length >= 8 && publicToken.length <= 16) {
    try {
      const prefixQuery = supabase
        .from('orders')
        .select(selectCols)
        .eq('tenant_id', tenantId) as any;
      if (typeof prefixQuery?.ilike === 'function') {
        const fallback = await prefixQuery
          .ilike('public_tracking_token', `${publicToken}%`)
          .limit(1)
          .maybeSingle();
        if (fallback?.data) {
          order = fallback.data;
          orderErr = fallback.error;
        }
      }
    } catch {
      // ignora se mock não implementar ilike
    }
  }

  if (orderErr || !order) {
    return null;
  }

  if (order.tenant_id !== tenantId) {
    return null;
  }

  // 2. Busca itens do pedido
  const { data: items } = await supabase
    .from('order_items')
    .select('id, snapshot_product_name, snapshot_variant_name, quantity, unit_price_cents, subtotal_cents')
    .eq('order_id', order.id);

  // 3. Busca endereço de forma segura (sem número ou complemento)
  let safeAddress: { street: string; neighborhood: string; city: string; state: string } | null = null;
  if (order.fulfillment_type === 'delivery') {
    const { data: address } = await supabase
      .from('order_addresses')
      .select('street, neighborhood, city, state')
      .eq('order_id', order.id)
      .maybeSingle();

    if (address) {
      safeAddress = {
        street: address.street,
        neighborhood: address.neighborhood,
        city: address.city,
        state: address.state,
      };
    }
  }

  // 4. Busca histórico de eventos da timeline ordenado cronologicamente
  const { data: events } = await supabase
    .from('order_status_events')
    .select('id, from_status, to_status, source, created_at')
    .eq('order_id', order.id)
    .order('created_at', { ascending: true });

  // 5. Enriquecimento logístico (Etapa 3E — sem exposição de PII do entregador ou rota encerrada)
  let deliveryInfo: PublicDeliveryTrackingInfo | null = null;
  if (order.fulfillment_type === 'delivery') {
    try {
      deliveryInfo = await getPublicDeliveryTrackingForOrder(order.tenant_id, order.id);
    } catch {
      deliveryInfo = null;
    }
  }

  // 5b. Busca nota configurável de agradecimento após entrega
  let deliveredThankYouMessage = DEFAULT_DELIVERED_THANK_YOU_MESSAGE;
  if (order.status === 'delivered') {
    try {
      const { data: commerceSettings } = await supabase
        .from('tenant_commerce_settings')
        .select('business_hours')
        .eq('tenant_id', order.tenant_id)
        .maybeSingle();

      const parsedHours = parseStructuredBusinessHours(
        commerceSettings?.business_hours as Record<string, any> | null
      );
      if (parsedHours.delivered_thank_you_message) {
        deliveredThankYouMessage = parsedHours.delivered_thank_you_message;
      }
    } catch {
      // Fallback para a mensagem padrão
    }
  }

  // 6. Mascaramento estrito de PII
  const rawName = order.customer_name || 'Cliente';
  const nameParts = rawName.trim().split(' ');
  const maskedName = nameParts.length > 1
    ? `${nameParts[0]} ${nameParts[nameParts.length - 1][0]}.`
    : nameParts[0];

  const rawPhone = order.customer_phone || '';
  const maskedPhone = rawPhone.length >= 8
    ? `${rawPhone.slice(0, 4)}****-${rawPhone.slice(-4)}`
    : '****';

  return {
    orderNumber: order.order_number,
    publicTrackingToken: toShortTrackingToken(order.public_tracking_token),
    status: order.status as CanonicalOrderStatus,
    statusLabel: ORDER_STATUS_LABELS[order.status as CanonicalOrderStatus] || order.status,
    paymentStatus: order.payment_status as CanonicalPaymentStatus,
    paymentStatusLabel: PAYMENT_STATUS_LABELS[order.payment_status as CanonicalPaymentStatus] || order.payment_status,
    fulfillmentType: order.fulfillment_type,
    scheduleType: order.schedule_type,
    scheduledFor: order.scheduled_for,
    createdAt: order.created_at,
    totalCents: order.total_cents,
    formattedTotal: formatBrl(order.total_cents),
    formattedDeliveryFee: formatBrl(order.delivery_fee_cents),
    customer: {
      name: maskedName,
      phone: maskedPhone,
    },
    address: safeAddress,
    delivery: deliveryInfo,
    deliveredThankYouMessage: order.status === 'delivered' ? deliveredThankYouMessage : null,
    items: (items || []).map((it) => ({
      name: it.snapshot_product_name,
      variant: it.snapshot_variant_name,
      quantity: it.quantity,
      formattedSubtotal: formatBrl(it.subtotal_cents),
    })),
    timeline: (events || []).map((ev) => ({
      id: ev.id,
      fromStatus: ev.from_status,
      toStatus: ev.to_status,
      statusLabel: ORDER_STATUS_LABELS[ev.to_status as CanonicalOrderStatus] || ev.to_status,
      source: ev.source,
      createdAt: ev.created_at,
    })),
  };
}

/**
 * Consulta administrativa detalhada de um pedido
 */
export async function getAdminOrder(tenantId: string, orderId: string) {
  const supabase = createAdminClient();

  const { data: order, error } = await supabase
    .from('orders')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('id', orderId)
    .single();

  if (error || !order) {
    throw new Error('Pedido não localizado.');
  }

  const { data: items } = await supabase
    .from('order_items')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('order_id', orderId);

  const { data: address } = await supabase
    .from('order_addresses')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('order_id', orderId)
    .maybeSingle();

  const { data: events } = await supabase
    .from('order_status_events')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('order_id', orderId)
    .order('created_at', { ascending: true });

  const { data: payment } = await supabase
    .from('payments')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('order_id', orderId)
    .order('created_at', { ascending: false })
    .maybeSingle();

  return {
    ...order,
    public_tracking_token: toShortTrackingToken(order.public_tracking_token),
    items: items || [],
    address: address || null,
    timeline: events || [],
    payment: payment || null,
  };
}

/**
 * Listagem administrativa de pedidos com filtros e paginação
 */
export async function listAdminOrders(
  tenantId: string,
  options?: {
    status?: CanonicalOrderStatus;
    channel?: OrderChannel;
    limit?: number;
    offset?: number;
  }
) {
  const supabase = createAdminClient();
  const limit = options?.limit || 50;
  const offset = options?.offset || 0;

  let query = supabase
    .from('orders')
    .select(`
      id,
      order_number,
      public_tracking_token,
      order_channel,
      customer_name,
      customer_phone,
      fulfillment_type,
      schedule_type,
      scheduled_for,
      status,
      payment_method,
      payment_status,
      cash_change_for_cents,
      subtotal_cents,
      delivery_fee_cents,
      discount_cents,
      total_cents,
      created_by_user_id,
      created_at
    `)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (options?.status) {
    query = query.eq('status', options.status);
  }

  if (options?.channel) {
    query = query.eq('order_channel', options.channel);
  }

  const { data: orders, error } = await query;

  if (error) {
    throw new Error(`Erro ao listar pedidos: ${error.message}`);
  }

  return (orders || []).map((o) => ({
    ...o,
    public_tracking_token: toShortTrackingToken(o.public_tracking_token),
  }));
}

export interface OperationalOrderItem {
  id: string;
  quantity: number;
  productName: string;
  variantName: string;
  unitPriceCents: number;
  subtotalCents: number;
}

export interface OperationalOrder {
  id: string;
  tenantId: string;
  orderNumber: string;
  publicTrackingToken?: string;
  orderChannel?: OrderChannel;
  customerName: string;
  customerPhone: string;
  customerEmail?: string | null;
  fulfillmentType: FulfillmentType;
  scheduleType: 'asap' | 'scheduled';
  scheduledFor?: string | null;
  preparationDueAt?: string | null;
  status: CanonicalOrderStatus;
  paymentMethod?: OrderPaymentMethod;
  paymentStatus: CanonicalPaymentStatus;
  cashChangeForCents?: number | null;
  subtotalCents: number;
  deliveryFeeCents: number;
  discountCents?: number;
  totalCents: number;
  formattedTotal: string;
  notes?: string | null;
  createdByUserId?: string | null;
  createdAt: string;
  updatedAt: string;
  elapsedMinutes: number;
  statusElapsedMinutes: number;
  isDelayed: boolean;
  isUrgent: boolean;
  items: OperationalOrderItem[];
  itemCount: number;
  address?: {
    street: string;
    number: string;
    complement?: string | null;
    neighborhood: string;
    city: string;
    state: string;
    reference?: string | null;
  } | null;
  nextValidStatuses: CanonicalOrderStatus[];
}

export interface OperationalMetrics {
  totalActive: number;
  inPrep: number;
  ready: number;
  delayed: number;
  scheduled: number;
  deliveredToday: number;
}

export function calculateOperationalMetrics(orders: OperationalOrder[]): OperationalMetrics {
  const activeOrders = orders.filter((o) => !['delivered', 'cancelled'].includes(o.status));
  const todayStr = new Date().toISOString().slice(0, 10);

  return {
    totalActive: activeOrders.length,
    inPrep: activeOrders.filter((o) => o.status === 'preparing').length,
    ready: activeOrders.filter((o) => o.status === 'ready').length,
    delayed: activeOrders.filter((o) => o.isDelayed).length,
    scheduled: activeOrders.filter((o) => o.scheduleType === 'scheduled').length,
    deliveredToday: orders.filter((o) => o.status === 'delivered' && o.createdAt.startsWith(todayStr)).length,
  };
}

/**
 * Consulta de alta performance para a visão operacional da cozinha/balcão
 */
export async function listOperationalOrders(tenantId: string): Promise<{
  orders: OperationalOrder[];
  metrics: OperationalMetrics;
}> {
  const supabase = createAdminClient();
  const now = new Date();

  // 1. Busca pedidos do tenant (ativos ou recentes das últimas 24h)
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  const { data: rawOrders, error: ordersError } = await supabase
    .from('orders')
    .select('*')
    .eq('tenant_id', tenantId)
    .or(`status.in.(pending,confirmed,preparing,ready,out_for_delivery),created_at.gte.${twentyFourHoursAgo}`)
    .order('created_at', { ascending: false })
    .limit(100);

  if (ordersError) {
    throw new Error(`Falha ao buscar pedidos operacionais: ${ordersError.message}`);
  }

  const ordersList = rawOrders || [];
  if (ordersList.length === 0) {
    const emptyMetrics: OperationalMetrics = {
      totalActive: 0,
      inPrep: 0,
      ready: 0,
      delayed: 0,
      scheduled: 0,
      deliveredToday: 0,
    };
    return { orders: [], metrics: emptyMetrics };
  }

  const orderIds = ordersList.map((o) => o.id);

  // 2. Busca itens e endereços em lote para evitar N+1 queries
  const [{ data: rawItems }, { data: rawAddresses }] = await Promise.all([
    supabase
      .from('order_items')
      .select('id, order_id, snapshot_product_name, snapshot_variant_name, quantity, unit_price_cents, subtotal_cents')
      .in('order_id', orderIds),
    supabase
      .from('order_addresses')
      .select('order_id, street, number, complement, neighborhood, city, state, reference')
      .in('order_id', orderIds),
  ]);

  const itemsByOrder = new Map<string, OperationalOrderItem[]>();
  (rawItems || []).forEach((item) => {
    const existing = itemsByOrder.get(item.order_id) || [];
    existing.push({
      id: item.id,
      quantity: item.quantity,
      productName: item.snapshot_product_name,
      variantName: item.snapshot_variant_name,
      unitPriceCents: item.unit_price_cents,
      subtotalCents: item.subtotal_cents,
    });
    itemsByOrder.set(item.order_id, existing);
  });

  const addressByOrder = new Map<string, any>();
  (rawAddresses || []).forEach((addr) => {
    addressByOrder.set(addr.order_id, {
      street: addr.street,
      number: addr.number,
      complement: addr.complement,
      neighborhood: addr.neighborhood,
      city: addr.city,
      state: addr.state,
      reference: addr.reference,
    });
  });

  // 3. Monta objetos operacionais com tempos decorridos e alertas
  const operationalOrders: OperationalOrder[] = ordersList.map((order) => {
    const orderCreated = new Date(order.created_at);
    const orderUpdated = new Date(order.updated_at || order.created_at);
    const elapsedMinutes = Math.max(0, Math.floor((now.getTime() - orderCreated.getTime()) / 60000));
    const statusElapsedMinutes = Math.max(0, Math.floor((now.getTime() - orderUpdated.getTime()) / 60000));

    let preparationDueAt: string | null = null;
    if (order.schedule_type === 'scheduled' && order.scheduled_for) {
      const schedTime = new Date(order.scheduled_for).getTime();
      // Meta de preparo padrão: 35 min antes do horário agendado
      preparationDueAt = new Date(schedTime - 35 * 60000).toISOString();
    }

    const isTerminal = order.status === 'delivered' || order.status === 'cancelled';

    // Atraso operacional por estágio
    let isDelayed = false;
    if (!isTerminal) {
      if (order.status === 'pending' && elapsedMinutes >= 15) isDelayed = true;
      else if (order.status === 'confirmed' && statusElapsedMinutes >= 20) isDelayed = true;
      else if (order.status === 'preparing' && statusElapsedMinutes >= 35) isDelayed = true;
      else if (order.status === 'ready' && statusElapsedMinutes >= 25) isDelayed = true;
      else if (order.schedule_type === 'scheduled' && order.scheduled_for && now.getTime() > new Date(order.scheduled_for).getTime()) {
        isDelayed = true;
      }
    }

    // Urgência
    let isUrgent = false;
    if (!isTerminal) {
      if (isDelayed) {
        isUrgent = true;
      } else if (order.status === 'pending' && elapsedMinutes >= 8) {
        isUrgent = true;
      } else if (order.schedule_type === 'scheduled' && preparationDueAt) {
        const timeUntilPrepDueMin = (new Date(preparationDueAt).getTime() - now.getTime()) / 60000;
        if (timeUntilPrepDueMin <= 15 && ['pending', 'confirmed'].includes(order.status)) {
          isUrgent = true;
        }
      }
    }

    let allowed = [...(ALLOWED_STATUS_TRANSITIONS[order.status as CanonicalOrderStatus] || [])];
    if (order.fulfillment_type === 'pickup' || order.fulfillment_type === 'dine_in') {
      allowed = allowed.filter((s) => s !== 'out_for_delivery');
    }

    const items = itemsByOrder.get(order.id) || [];
    const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

    return {
      id: order.id,
      tenantId: order.tenant_id,
      orderNumber: order.order_number,
      publicTrackingToken: toShortTrackingToken(order.public_tracking_token),
      orderChannel: (order.order_channel || 'website') as OrderChannel,
      customerName: order.customer_name,
      customerPhone: order.customer_phone,
      customerEmail: order.customer_email,
      fulfillmentType: order.fulfillment_type as FulfillmentType,
      scheduleType: order.schedule_type,
      scheduledFor: order.scheduled_for,
      preparationDueAt,
      status: order.status as CanonicalOrderStatus,
      paymentMethod: (order.payment_method || 'pix') as OrderPaymentMethod,
      paymentStatus: order.payment_status as CanonicalPaymentStatus,
      cashChangeForCents: order.cash_change_for_cents ?? null,
      subtotalCents: order.subtotal_cents,
      deliveryFeeCents: order.delivery_fee_cents,
      discountCents: order.discount_cents ?? 0,
      totalCents: order.total_cents,
      formattedTotal: formatBrl(order.total_cents),
      notes: order.notes,
      createdByUserId: order.created_by_user_id ?? null,
      createdAt: order.created_at,
      updatedAt: order.updated_at,
      elapsedMinutes,
      statusElapsedMinutes,
      isDelayed,
      isUrgent,
      items,
      itemCount,
      address: addressByOrder.get(order.id) || null,
      nextValidStatuses: allowed,
    };
  });

  const metrics = calculateOperationalMetrics(operationalOrders);

  return {
    orders: operationalOrders,
    metrics,
  };
}

/**
 * ETAPA 3A — KDS Leve & Motor de Operação de Cozinha
 * Busca apenas pedidos ativos de cozinha ('confirmed', 'preparing', 'ready') sem N+1 queries
 * e sem expor PII desnecessária (endereço completo, e-mail, telefone ou dados financeiros detalhados).
 */
export async function listKdsOrders(tenantId: string): Promise<{
  orders: KdsOrderCardData[];
  metrics: KdsDashboardMetrics;
  slaConfig: TenantSlaConfig;
}> {
  const supabase = createAdminClient();
  const now = new Date();
  const commerceSettings = await getTenantCommerceSettings(tenantId);
  const slaConfig = extractTenantSlaConfig(commerceSettings);

  const startOfToday = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0)
  ).toISOString();

  // 1. Busca apenas pedidos ativos de cozinha e histórico de operações concluídas hoje em paralelo
  const [{ data: rawOrders, error: ordersError }, { data: completedOpsToday }] =
    await Promise.all([
      supabase
        .from('orders')
        .select(
          'id, tenant_id, order_number, order_channel, customer_name, fulfillment_type, schedule_type, scheduled_for, status, payment_status, notes, created_at, updated_at'
        )
        .eq('tenant_id', tenantId)
        .in('status', ['confirmed', 'preparing', 'ready'])
        .order('created_at', { ascending: true })
        .limit(300),
      supabase
        .from('order_item_operations')
        .select('order_id, order_item_id, started_at, completed_at')
        .eq('tenant_id', tenantId)
        .eq('preparation_status', 'ready')
        .gte('completed_at', startOfToday)
        .limit(300),
    ]);

  if (ordersError) {
    throw new Error(`Falha ao carregar fila do KDS: ${ordersError.message}`);
  }

  // Calcula gargalos e tempo médio de preparo hoje a partir dos itens concluídos hoje
  let completedWithNames: Array<{
    productName: string;
    startedAt?: string | null;
    completedAt?: string | null;
  }> = [];

  if (completedOpsToday && completedOpsToday.length > 0) {
    const completedItemIds = Array.from(
      new Set(completedOpsToday.map((op) => op.order_item_id))
    );
    const { data: completedOrderItems } = await supabase
      .from('order_items')
      .select('id, snapshot_product_name')
      .eq('tenant_id', tenantId)
      .in('id', completedItemIds);

    const nameMap = new Map<string, string>();
    (completedOrderItems || []).forEach((it) => {
      nameMap.set(it.id, it.snapshot_product_name);
    });

    completedWithNames = completedOpsToday.map((op) => ({
      productName: nameMap.get(op.order_item_id) || 'Item',
      startedAt: op.started_at,
      completedAt: op.completed_at,
    }));
  }

  const bottlenecks = calculateKdsBottlenecks(completedWithNames, 2);

  // Calcula tempo médio de preparo hoje (em minutos)
  const validTodayDurations: number[] = [];
  for (const op of completedOpsToday || []) {
    if (op.started_at && op.completed_at) {
      const sMs = new Date(op.started_at).getTime();
      const eMs = new Date(op.completed_at).getTime();
      if (!Number.isNaN(sMs) && !Number.isNaN(eMs) && eMs >= sMs) {
        validTodayDurations.push(Math.max(1, Math.round((eMs - sMs) / 60000)));
      }
    }
  }
  const avgPrepTimeTodayMin =
    validTodayDurations.length > 0
      ? Number(
          (
            validTodayDurations.reduce((acc, v) => acc + v, 0) /
            validTodayDurations.length
          ).toFixed(1)
        )
      : null;

  const activeOrders = rawOrders || [];
  if (activeOrders.length === 0) {
    return {
      orders: [],
      metrics: {
        activeOrdersCount: 0,
        confirmedCount: 0,
        preparingCount: 0,
        readyCount: 0,
        delayedCount: 0,
        avgPrepTimeTodayMin,
        bottlenecks,
      },
      slaConfig,
    };
  }

  const orderIds = activeOrders.map((o) => o.id);

  // 2. Busca itens, estado operacional de itens, etapas de produção, estações e eventos em lote (Zero N+1)
  const [
    { data: rawItems },
    { data: rawItemOps },
    { data: rawStatusEvents },
    { data: rawStations },
    { data: rawOrderSteps },
    { data: completedStepsToday },
  ] = await Promise.all([
    supabase
      .from('order_items')
      .select('id, order_id, product_id, variant_id, snapshot_product_name, snapshot_variant_name, quantity')
      .eq('tenant_id', tenantId)
      .in('order_id', orderIds),
    supabase
      .from('order_item_operations')
      .select('order_id, order_item_id, preparation_status, started_at, completed_at')
      .eq('tenant_id', tenantId)
      .in('order_id', orderIds),
    supabase
      .from('order_status_events')
      .select('order_id, to_status, created_at')
      .eq('tenant_id', tenantId)
      .in('order_id', orderIds)
      .order('created_at', { ascending: true }),
    supabase
      .from('production_stations')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .order('display_order', { ascending: true }),
    supabase
      .from('order_item_production_steps')
      .select('*')
      .eq('tenant_id', tenantId)
      .in('order_id', orderIds)
      .order('step_order', { ascending: true }),
    supabase
      .from('order_item_production_steps')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('status', 'ready')
      .gte('completed_at', startOfToday)
      .limit(300),
  ]);

  const activeStations = (rawStations || []) as ProductionStation[];
  const allActiveSteps = (rawOrderSteps || []) as OrderItemProductionStep[];

  // Calcula carga por estação ativa
  const stationLoadsBySlug = new Map<string, StationLoadMetrics>();
  const stationLoads: StationLoadMetrics[] = activeStations.map((st) => {
    const completedTodayForStation = (completedStepsToday || []).filter(
      (cs: any) => cs.station_id === st.id || cs.snapshot_station_slug === st.slug
    ).length;

    const load = calculateStationLoad({
      station: st,
      activeSteps: allActiveSteps,
      completedTodayCount: completedTodayForStation,
      now,
    });
    stationLoadsBySlug.set(st.slug, load);
    return load;
  });

  // Agrupa etapas por order_item_id
  const stepsByOrderItem = new Map<string, OrderItemProductionStep[]>();
  allActiveSteps.forEach((step) => {
    const list = stepsByOrderItem.get(step.order_item_id) || [];
    list.push(step);
    stepsByOrderItem.set(step.order_item_id, list);
  });

  const itemOpsMap = new Map<
    string,
    {
      preparation_status: ItemPreparationStatus;
      started_at: string | null;
      completed_at: string | null;
    }
  >();
  (rawItemOps || []).forEach((op) => {
    itemOpsMap.set(op.order_item_id, {
      preparation_status: op.preparation_status as ItemPreparationStatus,
      started_at: op.started_at,
      completed_at: op.completed_at,
    });
  });

  const itemsByOrder = new Map<string, KdsItemChecklist[]>();
  (rawItems || []).forEach((it) => {
    const op = itemOpsMap.get(it.id);
    const prepStatus: ItemPreparationStatus = op?.preparation_status || 'pending';
    const startedAt = op?.started_at || null;
    const completedAt = op?.completed_at || null;
    let prepDurationMin: number | null = null;
    if (startedAt && completedAt) {
      prepDurationMin = Math.max(
        1,
        Math.round(
          (new Date(completedAt).getTime() - new Date(startedAt).getTime()) / 60000
        )
      );
    }

    const list = itemsByOrder.get(it.order_id) || [];
    list.push({
      orderItemId: it.id,
      productName: it.snapshot_product_name,
      variantName: it.snapshot_variant_name,
      quantity: it.quantity,
      preparationStatus: prepStatus,
      startedAt,
      completedAt,
      prepDurationMin,
    });
    itemsByOrder.set(it.order_id, list);
  });

  const eventsByOrder = new Map<
    string,
    Array<{ to_status: string; created_at: string }>
  >();
  (rawStatusEvents || []).forEach((ev) => {
    const list = eventsByOrder.get(ev.order_id) || [];
    list.push({ to_status: ev.to_status, created_at: ev.created_at });
    eventsByOrder.set(ev.order_id, list);
  });

  // 3. Monta os cards do KDS com Caminho Crítico, SLA Avançado, Prioridade e Checklist
  const kdsOrders: KdsOrderCardData[] = activeOrders.map((order) => {
    const events = eventsByOrder.get(order.id) || [];
    const baseItems = itemsByOrder.get(order.id) || [];

    const confirmedEv = events.find((e) => e.to_status === 'confirmed');
    const preparingEv = events.find((e) => e.to_status === 'preparing');
    const readyEv = events.find((e) => e.to_status === 'ready');

    const confirmedAt = confirmedEv?.created_at || order.created_at;
    const prepStartedAt =
      preparingEv?.created_at ||
      baseItems.find((i) => i.startedAt)?.startedAt ||
      (order.status === 'preparing' ? order.updated_at : null);
    const readyAt =
      readyEv?.created_at || (order.status === 'ready' ? order.updated_at : null);

    const confirmedElapsedMin = Math.max(
      0,
      Math.floor((now.getTime() - new Date(confirmedAt).getTime()) / 60000)
    );
    const prepElapsedMin = prepStartedAt
      ? Math.max(
          0,
          Math.floor(
            ((readyAt ? new Date(readyAt).getTime() : now.getTime()) -
              new Date(prepStartedAt).getTime()) /
              60000
          )
        )
      : 0;

    // Monta entrada para cálculo de caminho crítico por item
    const itemsForCriticalPath = baseItems.map((it) => {
      const existingSteps = stepsByOrderItem.get(it.orderItemId) || [];
      if (existingSteps.length > 0) {
        return {
          orderItemId: it.orderItemId,
          productName: it.productName,
          variantName: it.variantName,
          quantity: it.quantity,
          steps: existingSteps,
        };
      }

      // Fallback em memória para pedidos ainda sem linhas em order_item_production_steps
      const defaultSt = activeStations[0];
      const fallbackStep: OrderItemProductionStep = {
        id: `fallback-${it.orderItemId}`,
        tenant_id: order.tenant_id,
        order_id: order.id,
        order_item_id: it.orderItemId,
        station_id: defaultSt?.id || null,
        snapshot_station_name: defaultSt?.name || 'Cozinha Geral',
        snapshot_station_slug: defaultSt?.slug || 'cozinha-geral',
        snapshot_station_type: defaultSt?.station_type || 'kitchen',
        step_order: 1,
        status:
          it.preparationStatus === 'ready'
            ? 'ready'
            : it.preparationStatus === 'preparing'
            ? 'preparing'
            : 'pending',
        estimated_duration_seconds:
          defaultSt?.default_duration_seconds ||
          slaConfig.targetPreparationTimeMin * 60,
        capacity_weight: Math.max(1, it.quantity),
        started_at: it.startedAt,
        completed_at: it.completedAt,
        created_at: order.created_at,
        updated_at: order.updated_at,
      };

      return {
        orderItemId: it.orderItemId,
        productName: it.productName,
        variantName: it.variantName,
        quantity: it.quantity,
        steps: [fallbackStep],
      };
    });

    const criticalPath = calculateOrderCriticalPathAndPrediction({
      orderId: order.id,
      items: itemsForCriticalPath,
      stationLoadsBySlug,
      now,
    });

    // Enriquecer itens do checklist com dados da estação atual/próxima e previsão
    const itemPredictionMap = new Map(
      criticalPath.items.map((ip) => [ip.orderItemId, ip])
    );

    const items: KdsItemChecklist[] = baseItems.map((it) => {
      const pred = itemPredictionMap.get(it.orderItemId);
      return {
        ...it,
        currentStepOrder: pred?.currentStepOrder ?? null,
        currentStationName: pred?.currentStationName ?? null,
        currentStationSlug: pred?.currentStationSlug ?? null,
        nextStationName: pred?.nextStationName ?? null,
        estimatedItemCompletionAt: pred?.estimatedItemCompletionAt ?? null,
        steps: pred?.steps ?? [],
      };
    });

    const recommendedStartAt =
      order.schedule_type === 'scheduled'
        ? calculateRecommendedStartAt({
            scheduledFor: order.scheduled_for,
            criticalPathDurationSeconds: criticalPath.criticalPathDurationSeconds,
            slaConfig,
          })
        : null;

    const preparationDueAt =
      order.schedule_type === 'scheduled'
        ? recommendedStartAt || calculatePreparationDueAt(order.scheduled_for, slaConfig)
        : null;

    const promisedTimeAt =
      order.schedule_type === 'scheduled' && order.scheduled_for
        ? order.scheduled_for
        : new Date(
            new Date(confirmedAt).getTime() +
              slaConfig.targetPreparationTimeMin * 60000
          ).toISOString();

    const sla = calculateOrderSla(
      {
        status: order.status as CanonicalOrderStatus,
        scheduleType: order.schedule_type,
        scheduledFor: order.scheduled_for,
        preparationDueAt,
        confirmedElapsedMin,
        prepElapsedMin,
      },
      slaConfig,
      now
    );

    const advancedSla = calculateAdvancedOrderSla({
      status: order.status as 'confirmed' | 'preparing' | 'ready',
      promisedTimeAt,
      estimatedOrderReadyAt: criticalPath.estimatedOrderReadyAt,
      slaConfig,
      now,
    });

    // Mantém compatibilidade com OrderPriorityEvaluation da Etapa 3A, enriquecida com risco preditivo
    const priority = calculateOperationalPriority(
      {
        status: order.status as CanonicalOrderStatus,
        fulfillmentType: order.fulfillment_type,
        scheduleType: order.schedule_type,
        scheduledFor: order.scheduled_for,
        preparationDueAt,
        confirmedElapsedMin,
        prepElapsedMin,
        sla:
          advancedSla.state === 'at_risk' && sla.state === 'normal'
            ? { ...sla, state: 'warning', label: 'Atenção' }
            : sla,
      },
      slaConfig,
      now
    );

    const stageTimings = calculateStageTimings({
      createdAt: order.created_at,
      status: order.status as CanonicalOrderStatus,
      events,
      prepStartedAt,
      now,
    });

    const totalItemsCount = items.length;
    const readyItemsCount = items.filter(
      (i) => i.preparationStatus === 'ready'
    ).length;
    const allItemsReady =
      totalItemsCount > 0 &&
      readyItemsCount === totalItemsCount &&
      criticalPath.allMandatoryStepsCompleted;

    return {
      id: order.id,
      tenantId: order.tenant_id,
      orderNumber: order.order_number,
      orderChannel: order.order_channel || 'website',
      customerDisplayName: formatCustomerDisplayNameForKds(order.customer_name),
      fulfillmentType: order.fulfillment_type,
      scheduleType: order.schedule_type,
      scheduledFor: order.scheduled_for || null,
      preparationDueAt,
      recommendedStartAt,
      promisedTimeAt,
      status: order.status as 'confirmed' | 'preparing' | 'ready',
      paymentStatus: order.payment_status as CanonicalPaymentStatus,
      kitchenNotes: order.notes || null,
      createdAt: order.created_at,
      confirmedAt,
      prepStartedAt,
      readyAt,
      confirmedElapsedMin,
      prepElapsedMin,
      items,
      totalItemsCount,
      readyItemsCount,
      allItemsReady,
      sla,
      advancedSla,
      criticalPath,
      priority,
      stageTimings,
    };
  });

  // Ordena por maior prioridade operacional (e mais antigo como desempate)
  kdsOrders.sort((a, b) => {
    if (b.priority.score !== a.priority.score) {
      return b.priority.score - a.priority.score;
    }
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });

  const metrics: KdsDashboardMetrics = {
    activeOrdersCount: kdsOrders.length,
    confirmedCount: kdsOrders.filter((o) => o.status === 'confirmed').length,
    preparingCount: kdsOrders.filter((o) => o.status === 'preparing').length,
    readyCount: kdsOrders.filter((o) => o.status === 'ready').length,
    delayedCount: kdsOrders.filter((o) => o.sla.state === 'delayed').length,
    atRiskCount: kdsOrders.filter((o) => o.advancedSla?.state === 'at_risk').length,
    avgPrepTimeTodayMin,
    bottlenecks,
    stationLoads,
  };

  return {
    orders: kdsOrders,
    metrics,
    slaConfig,
  };
}

/**
 * Inicia o preparo do pedido e de seus itens pendentes atomicamente via RPC.
 */
export async function startOrderPreparation(
  tenantId: string,
  orderId: string,
  actorUserId?: string
) {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc('start_order_preparation_atomic', {
    p_tenant_id: tenantId,
    p_order_id: orderId,
    p_actor_user_id: actorUserId || null,
  });

  if (error) {
    throw new Error(`Falha ao iniciar preparo: ${error.message}`);
  }

  if (data && data.success === false) {
    throw new Error(data.error || 'Não foi possível iniciar o preparo do pedido.');
  }

  return data;
}

/**
 * Atualiza o status operacional de um item do pedido (pending -> preparing -> ready) atomicamente.
 * Não altera o status comercial do pedido automaticamente sem confirmação explícita do operador.
 */
export async function updateOrderItemOperationStatus(
  tenantId: string,
  orderId: string,
  orderItemId: string,
  toStatus: ItemPreparationStatus,
  actorUserId?: string
) {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc('update_order_item_operation_atomic', {
    p_tenant_id: tenantId,
    p_order_id: orderId,
    p_order_item_id: orderItemId,
    p_to_status: toStatus,
    p_actor_user_id: actorUserId || null,
  });

  if (error) {
    throw new Error(`Falha ao atualizar item do pedido: ${error.message}`);
  }

  if (data && data.success === false) {
    throw new Error(data.error || 'Não foi possível atualizar o status do item.');
  }

  return data;
}

/**
 * Conclui o preparo do pedido (preparing -> ready) após confirmação do operador,
 * exigindo que todos os itens estejam marcados como 'ready'.
 */
export async function completeOrderPreparation(
  tenantId: string,
  orderId: string,
  actorUserId?: string
) {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc('complete_order_preparation_atomic', {
    p_tenant_id: tenantId,
    p_order_id: orderId,
    p_actor_user_id: actorUserId || null,
  });

  if (error) {
    throw new Error(`Falha ao concluir preparo do pedido: ${error.message}`);
  }

  if (data && data.success === false) {
    throw new Error(data.error || 'Não foi possível concluir o preparo do pedido.');
  }

  return data;
}

// ==============================================================================
// ETAPA 3B — Multiestação, Etapas Sequenciais e Capacidade Operacional
// ==============================================================================

export interface KdsStationStepCardData {
  stepId: string;
  orderId: string;
  orderNumber: string;
  orderItemId: string;
  productName: string;
  variantName: string;
  quantity: number;
  stepOrder: number;
  totalStepsForItem: number;
  stationId: string | null;
  stationName: string;
  stationSlug: string;
  stationType: ProductionStationType;
  status: OrderItemProductionStepStatus;
  estimatedDurationSeconds: number;
  capacityWeight: number;
  startedAt: string | null;
  completedAt: string | null;
  queueElapsedMin: number;
  execElapsedMin: number;
  nextStationName: string | null;
  customerDisplayName: string;
  fulfillmentType: FulfillmentType;
  scheduleType: 'asap' | 'scheduled';
  scheduledFor: string | null;
  kitchenNotes: string | null;
  advancedSla: AdvancedOrderSlaEvaluation;
  priorityScore: number;
  priorityLevel: 'normal' | 'high' | 'critical';
}

export interface ExpeditionOrderSummary {
  orderId: string;
  orderNumber: string;
  customerDisplayName: string;
  fulfillmentType: FulfillmentType;
  scheduleType: 'asap' | 'scheduled';
  scheduledFor: string | null;
  status: 'confirmed' | 'preparing' | 'ready';
  kitchenNotes: string | null;
  readyItems: Array<{
    orderItemId: string;
    productName: string;
    variantName: string;
    quantity: number;
  }>;
  missingItems: Array<{
    orderItemId: string;
    productName: string;
    variantName: string;
    quantity: number;
    currentStationName: string | null;
  }>;
  allItemsReady: boolean;
}

export async function initializeOrderProductionSteps(
  tenantId: string,
  orderId: string,
  actorUserId?: string
) {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc('initialize_order_production_steps_atomic', {
    p_tenant_id: tenantId,
    p_order_id: orderId,
    p_actor_user_id: actorUserId || null,
  });

  if (error) {
    throw new Error(`Falha ao inicializar etapas de produção: ${error.message}`);
  }
  if (data && data.success === false) {
    throw new Error(data.error || 'Não foi possível inicializar etapas.');
  }
  return data;
}

export async function startProductionStep(
  tenantId: string,
  stepId: string,
  actorUserId?: string
) {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc('start_production_step_atomic', {
    p_tenant_id: tenantId,
    p_step_id: stepId,
    p_actor_user_id: actorUserId || null,
  });

  if (error) {
    throw new Error(`Falha ao iniciar etapa na estação: ${error.message}`);
  }
  if (data && data.success === false) {
    throw new Error(data.error || 'Não foi possível iniciar a etapa.');
  }
  return data;
}

export async function completeProductionStep(
  tenantId: string,
  stepId: string,
  actorUserId?: string
) {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc('complete_production_step_atomic', {
    p_tenant_id: tenantId,
    p_step_id: stepId,
    p_actor_user_id: actorUserId || null,
  });

  if (error) {
    throw new Error(`Falha ao concluir etapa na estação: ${error.message}`);
  }
  if (data && data.success === false) {
    throw new Error(data.error || 'Não foi possível concluir a etapa.');
  }
  return data;
}

export async function overrideProductionStep(
  tenantId: string,
  stepId: string,
  action: 'skip' | 'force_complete',
  reason: string,
  actorUserId?: string
) {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc('override_production_step_atomic', {
    p_tenant_id: tenantId,
    p_step_id: stepId,
    p_action: action,
    p_reason: reason,
    p_actor_user_id: actorUserId || null,
  });

  if (error) {
    throw new Error(`Falha no override de etapa: ${error.message}`);
  }
  if (data && data.success === false) {
    throw new Error(data.error || 'Não foi possível aplicar override na etapa.');
  }
  return data;
}

/**
 * Consulta a fila operacional específica de uma estação (/admin/kds/[stationSlug])
 */
export async function getStationKdsQueue(
  tenantId: string,
  stationSlug: string
): Promise<{
  station: ProductionStation;
  allStations: ProductionStation[];
  stationLoad: StationLoadMetrics;
  stationPerformance: StationHistoricalPerformance;
  pendingSteps: KdsStationStepCardData[];
  preparingSteps: KdsStationStepCardData[];
  blockedSteps: KdsStationStepCardData[];
  expeditionOrders: ExpeditionOrderSummary[];
}> {
  const supabase = createAdminClient();
  const now = new Date();
  const kdsSnapshot = await listKdsOrders(tenantId);

  const { data: stationsData, error: stErr } = await supabase
    .from('production_stations')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .order('display_order', { ascending: true });

  if (stErr) {
    throw new Error(`Erro ao carregar estações: ${stErr.message}`);
  }

  const allStations = (stationsData || []) as ProductionStation[];
  const station = allStations.find((s) => s.slug === stationSlug);
  if (!station) {
    throw new Error(`Estação "${stationSlug}" não encontrada ou inativa.`);
  }

  // Garante que pedidos ativos em 'confirmed' ou 'preparing' que tenham itens possuam etapas inicializadas (em paralelo)
  const ordersNeedingInit = kdsSnapshot.orders.filter((ord) => {
    if (ord.status !== 'confirmed' && ord.status !== 'preparing') return false;
    if (ord.items.length === 0) return false;
    const hasRealStep = ord.items.some(
      (it) =>
        it.steps &&
        it.steps.length > 0 &&
        !it.steps[0].stepId.startsWith('fallback-')
    );
    return !hasRealStep;
  });

  if (ordersNeedingInit.length > 0) {
    await Promise.all(
      ordersNeedingInit.map((ord) =>
        initializeOrderProductionSteps(tenantId, ord.id).catch(() => null)
      )
    );
  }

  const activeOrderIds = kdsSnapshot.orders.map((o) => o.id);
  const startOfToday = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0)
  ).toISOString();

  const [{ data: rawSteps }, { data: completedToday }] = await Promise.all([
    activeOrderIds.length > 0
      ? supabase
          .from('order_item_production_steps')
          .select('*')
          .eq('tenant_id', tenantId)
          .in('order_id', activeOrderIds)
          .order('step_order', { ascending: true })
      : Promise.resolve({ data: [] as any[] }),
    supabase
      .from('order_item_production_steps')
      .select('station_id, snapshot_station_slug, started_at, completed_at')
      .eq('tenant_id', tenantId)
      .eq('status', 'ready')
      .gte('completed_at', startOfToday)
      .limit(300),
  ]);

  const allSteps = (rawSteps || []) as OrderItemProductionStep[];
  const completedForStationCount = (completedToday || []).filter(
    (s: any) => s.station_id === station.id || s.snapshot_station_slug === station.slug
  ).length;

  const stationLoad = calculateStationLoad({
    station,
    activeSteps: allSteps,
    completedTodayCount: completedForStationCount,
    now,
  });

  const [stationPerformance] = calculateStationOperationalMetrics({
    stations: [station],
    completedSteps: completedToday || [],
    minSampleRequired: 3,
  });

  const orderMap = new Map(kdsSnapshot.orders.map((o) => [o.id, o]));
  const stepsByOrderItem = new Map<string, OrderItemProductionStep[]>();
  allSteps.forEach((s) => {
    const arr = stepsByOrderItem.get(s.order_item_id) || [];
    arr.push(s);
    stepsByOrderItem.set(s.order_item_id, arr);
  });

  const stationStepCards: KdsStationStepCardData[] = [];
  for (const step of allSteps) {
    const matchesStation =
      step.station_id === station.id ||
      (!step.station_id && step.snapshot_station_slug === station.slug);
    if (!matchesStation) continue;
    if (!['pending', 'preparing', 'blocked'].includes(step.status)) continue;

    const orderCard = orderMap.get(step.order_id);
    if (!orderCard || orderCard.status === 'ready') continue;

    const orderItem = orderCard.items.find((i) => i.orderItemId === step.order_item_id);
    if (!orderItem) continue;

    const itemSteps = (stepsByOrderItem.get(step.order_item_id) || []).sort(
      (a, b) => a.step_order - b.step_order
    );
    const nextStep = itemSteps.find((s) => s.step_order > step.step_order);

    const queueStartMs = new Date(step.updated_at || step.created_at).getTime();
    const queueElapsedMin = Math.max(
      0,
      Math.floor((now.getTime() - queueStartMs) / 60000)
    );
    const execElapsedMin = step.started_at
      ? Math.max(
          0,
          Math.floor((now.getTime() - new Date(step.started_at).getTime()) / 60000)
        )
      : 0;

    stationStepCards.push({
      stepId: step.id,
      orderId: orderCard.id,
      orderNumber: orderCard.orderNumber,
      orderItemId: orderItem.orderItemId,
      productName: orderItem.productName,
      variantName: orderItem.variantName,
      quantity: orderItem.quantity,
      stepOrder: step.step_order,
      totalStepsForItem: itemSteps.length,
      stationId: step.station_id || null,
      stationName: step.snapshot_station_name,
      stationSlug: step.snapshot_station_slug,
      stationType: step.snapshot_station_type,
      status: step.status,
      estimatedDurationSeconds: step.estimated_duration_seconds,
      capacityWeight: step.capacity_weight,
      startedAt: step.started_at || null,
      completedAt: step.completed_at || null,
      queueElapsedMin,
      execElapsedMin,
      nextStationName: nextStep ? nextStep.snapshot_station_name : null,
      customerDisplayName: orderCard.customerDisplayName,
      fulfillmentType: orderCard.fulfillmentType,
      scheduleType: orderCard.scheduleType,
      scheduledFor: orderCard.scheduledFor,
      kitchenNotes: orderCard.kitchenNotes,
      advancedSla:
        orderCard.advancedSla || {
          state:
            orderCard.sla.state === 'delayed'
              ? 'delayed'
              : orderCard.sla.state === 'warning'
              ? 'at_risk'
              : 'on_time',
          legacyState: orderCard.sla.state,
          label:
            orderCard.sla.state === 'delayed'
              ? 'Atrasado'
              : orderCard.sla.state === 'warning'
              ? 'Em Risco'
              : 'No Prazo',
          promisedTimeAt: orderCard.promisedTimeAt,
          estimatedOrderReadyAt: orderCard.promisedTimeAt,
          predictedDelayMin: 0,
          remainingToPromiseMin: orderCard.sla.remainingMin,
          isPredictedToDelay: false,
        },
      priorityScore: orderCard.priority.score,
      priorityLevel: orderCard.priority.level,
    });
  }

  stationStepCards.sort((a, b) => {
    if (b.priorityScore !== a.priorityScore) {
      return b.priorityScore - a.priorityScore;
    }
    return b.queueElapsedMin - a.queueElapsedMin;
  });

  // Visão de Expedição (Seção 27): mostra itens concluídos e itens faltantes por pedido
  const expeditionOrders: ExpeditionOrderSummary[] = kdsSnapshot.orders.map((ord) => {
    const readyItems = ord.items
      .filter((i) => i.preparationStatus === 'ready')
      .map((i) => ({
        orderItemId: i.orderItemId,
        productName: i.productName,
        variantName: i.variantName,
        quantity: i.quantity,
      }));

    const missingItems = ord.items
      .filter((i) => i.preparationStatus !== 'ready')
      .map((i) => ({
        orderItemId: i.orderItemId,
        productName: i.productName,
        variantName: i.variantName,
        quantity: i.quantity,
        currentStationName: i.currentStationName || null,
      }));

    return {
      orderId: ord.id,
      orderNumber: ord.orderNumber,
      customerDisplayName: ord.customerDisplayName,
      fulfillmentType: ord.fulfillmentType,
      scheduleType: ord.scheduleType,
      scheduledFor: ord.scheduledFor,
      status: ord.status,
      kitchenNotes: ord.kitchenNotes,
      readyItems,
      missingItems,
      allItemsReady: ord.allItemsReady,
    };
  });

  return {
    station,
    allStations,
    stationLoad,
    stationPerformance,
    pendingSteps: stationStepCards.filter((s) => s.status === 'pending'),
    preparingSteps: stationStepCards.filter((s) => s.status === 'preparing'),
    blockedSteps: stationStepCards.filter((s) => s.status === 'blocked'),
    expeditionOrders,
  };
}

/**
 * CRUD de Estações de Produção do Tenant (/admin/configuracoes/operacao)
 */
export async function listProductionStations(
  tenantId: string,
  includeInactive = true
): Promise<ProductionStation[]> {
  const supabase = createAdminClient();
  let query = supabase
    .from('production_stations')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (!includeInactive) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Erro ao listar estações de produção: ${error.message}`);
  }
  return (data || []) as ProductionStation[];
}

export async function saveProductionStation(
  tenantId: string,
  input: {
    id?: string;
    name: string;
    slug: string;
    description?: string | null;
    display_order: number;
    station_type: ProductionStationType;
    is_active: boolean;
    default_capacity: number;
    default_duration_seconds: number;
  }
): Promise<ProductionStation> {
  const supabase = createAdminClient();
  const now = new Date().toISOString();

  if (input.id) {
    const { data, error } = await supabase
      .from('production_stations')
      .update({
        name: input.name.trim(),
        slug: input.slug.trim().toLowerCase(),
        description: input.description || null,
        display_order: input.display_order,
        station_type: input.station_type,
        is_active: input.is_active,
        default_capacity: Math.max(1, input.default_capacity),
        default_duration_seconds: Math.max(10, input.default_duration_seconds),
        updated_at: now,
      })
      .eq('tenant_id', tenantId)
      .eq('id', input.id)
      .select('*')
      .single();

    if (error || !data) {
      throw new Error(`Erro ao atualizar estação: ${error?.message || 'Não encontrada'}`);
    }
    return data as ProductionStation;
  }

  const { data, error } = await supabase
    .from('production_stations')
    .insert({
      tenant_id: tenantId,
      name: input.name.trim(),
      slug: input.slug.trim().toLowerCase(),
      description: input.description || null,
      display_order: input.display_order,
      station_type: input.station_type,
      is_active: input.is_active,
      default_capacity: Math.max(1, input.default_capacity),
      default_duration_seconds: Math.max(10, input.default_duration_seconds),
    })
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(`Erro ao criar estação: ${error?.message}`);
  }
  return data as ProductionStation;
}

/**
 * Lista produtos, variantes e seus fluxos de produção configurados
 */
export async function listProductsWithProductionSteps(tenantId: string) {
  const supabase = createAdminClient();
  const [{ data: products }, { data: variants }, { data: steps }] = await Promise.all([
    supabase
      .from('products')
      .select('id, name, slug, status')
      .eq('tenant_id', tenantId)
      .order('name', { ascending: true }),
    supabase
      .from('product_variants')
      .select('id, product_id, name, sku, is_available')
      .eq('tenant_id', tenantId)
      .order('display_order', { ascending: true }),
    supabase
      .from('product_production_steps')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('step_order', { ascending: true }),
  ]);

  return {
    products: products || [],
    variants: variants || [],
    steps: (steps || []) as ProductProductionStep[],
  };
}

/**
 * Salva o fluxo sequencial de etapas de um produto ou variante específica
 * Garantindo step_order sequencial 1..N e sem duplicação.
 */
export async function saveProductProductionSteps(
  tenantId: string,
  productId: string,
  variantId: string | null,
  steps: Array<{
    station_id: string;
    estimated_duration_seconds: number;
    capacity_weight?: number;
    is_active?: boolean;
  }>
): Promise<ProductProductionStep[]> {
  const supabase = createAdminClient();

  // Remove etapas anteriores do mesmo escopo (produto geral vs variante específica)
  let deleteQuery = supabase
    .from('product_production_steps')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('product_id', productId);

  if (variantId) {
    deleteQuery = deleteQuery.eq('variant_id', variantId);
  } else {
    deleteQuery = deleteQuery.is('variant_id', null);
  }

  const { error: delErr } = await deleteQuery;
  if (delErr) {
    throw new Error(`Erro ao limpar etapas anteriores: ${delErr.message}`);
  }

  if (steps.length === 0) {
    return [];
  }

  const rowsToInsert = steps.map((s, idx) => ({
    tenant_id: tenantId,
    product_id: productId,
    variant_id: variantId || null,
    station_id: s.station_id,
    step_order: idx + 1,
    estimated_duration_seconds: Math.max(5, s.estimated_duration_seconds),
    capacity_weight: Math.max(1, s.capacity_weight || 1),
    is_active: s.is_active ?? true,
  }));

  const { data, error } = await supabase
    .from('product_production_steps')
    .insert(rowsToInsert)
    .select('*')
    .order('step_order', { ascending: true });

  if (error) {
    throw new Error(`Erro ao salvar fluxo de produção: ${error.message}`);
  }

  return (data || []) as ProductProductionStep[];
}

// ==============================================================================
// ETAPA 3C — Pedido Rápido e Atendimento Multicanal (WhatsApp, Telefone, Balcão)
// ==============================================================================

export interface QuickOrderActor {
  userId: string;
  role: TenantRole;
  email?: string;
}

export interface QuickOrderCreationResult {
  success: boolean;
  idempotent: boolean;
  orderId: string;
  orderNumber: string;
  publicTrackingToken: string;
  orderChannel: OrderChannel;
  status: CanonicalOrderStatus;
  paymentMethod: OrderPaymentMethod;
  paymentStatus: CanonicalPaymentStatus;
  cashChangeForCents: number | null;
  cashChangeAmountCents: number | null;
  subtotalInCents: number;
  deliveryFeeInCents: number;
  discountInCents: number;
  totalInCents: number;
  formattedSubtotal: string;
  formattedDeliveryFee: string;
  formattedDiscount: string;
  formattedTotal: string;
  fulfillmentType: FulfillmentType;
  scheduleType: 'asap' | 'scheduled';
  scheduledFor: string | null;
  customerName: string;
  customerPhone: string;
  notes: string | null;
  items: ValidatedCartItem[];
  address: {
    zipCode: string;
    street: string;
    number: string;
    complement?: string | null;
    neighborhood: string;
    city: string;
    state: string;
    reference?: string | null;
  } | null;
  whatsappSummaryText: string;
}

export interface TenantCustomerHistoryItem {
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  lastOrderNumber: string;
  lastOrderAt: string;
  orderCount: number;
  lastAddress: {
    zipCode: string;
    street: string;
    number: string;
    complement?: string | null;
    neighborhood: string;
    city: string;
    state: string;
    reference?: string | null;
  } | null;
}

/**
 * Gera resumo formatado para envio rápido no WhatsApp com link público de rastreamento (/pedido/[token])
 */
export function formatWhatsAppOrderSummary(params: {
  tenantName: string;
  orderNumber: string;
  publicTrackingToken: string;
  customerName: string;
  fulfillmentType: FulfillmentType;
  scheduleType: 'asap' | 'scheduled';
  scheduledFor?: string | null;
  paymentMethod: OrderPaymentMethod;
  paymentStatus: CanonicalPaymentStatus;
  cashChangeForCents?: number | null;
  subtotalInCents: number;
  deliveryFeeInCents: number;
  discountInCents: number;
  totalInCents: number;
  items: Array<{
    productName: string;
    variantName: string;
    quantity: number;
    subtotalInCents: number;
  }>;
  baseUrl?: string;
}): string {
  const lines: string[] = [];
  const base = (params.baseUrl || '').replace(/\/$/, '');
  const trackingPath = `/pedido/${params.publicTrackingToken}`;
  const trackingUrl = base ? `${base}${trackingPath}` : trackingPath;

  lines.push(`*${params.tenantName} — Pedido ${params.orderNumber}*`);
  lines.push(`Olá, *${params.customerName}*! Seu pedido foi registrado.`);
  lines.push('');
  lines.push('*Itens do Pedido:*');
  for (const item of params.items) {
    lines.push(
      `• ${item.quantity}x ${item.productName} (${item.variantName}) — ${formatBrl(item.subtotalInCents)}`
    );
  }

  lines.push('');
  lines.push(`Subtotal: ${formatBrl(params.subtotalInCents)}`);
  if (params.fulfillmentType === 'delivery') {
    lines.push(`Taxa de Entrega: ${formatBrl(params.deliveryFeeInCents)}`);
  }
  if (params.discountInCents > 0) {
    lines.push(`Desconto: -${formatBrl(params.discountInCents)}`);
  }
  lines.push(`*Total: ${formatBrl(params.totalInCents)}*`);

  lines.push('');
  const fulfillmentLabel = FULFILLMENT_TYPE_LABELS[params.fulfillmentType] || params.fulfillmentType;
  lines.push(`Modalidade: *${fulfillmentLabel}*`);

  if (params.scheduleType === 'scheduled' && params.scheduledFor) {
    lines.push(`Agendado para: *${new Date(params.scheduledFor).toLocaleString('pt-BR')}*`);
  }

  const paymentLabel = PAYMENT_METHOD_LABELS[params.paymentMethod] || params.paymentMethod;
  const statusLabel = params.paymentStatus === 'paid' ? 'Pago ✅' : 'Aguardando pagamento';
  lines.push(`Pagamento: *${paymentLabel}* (${statusLabel})`);

  if (
    params.paymentMethod === 'cash' &&
    params.cashChangeForCents &&
    params.cashChangeForCents > params.totalInCents
  ) {
    const changeCents = params.cashChangeForCents - params.totalInCents;
    lines.push(
      `Troco para: ${formatBrl(params.cashChangeForCents)} (Troco: *${formatBrl(changeCents)}*)`
    );
  }

  lines.push('');
  lines.push(`Acompanhe seu pedido em tempo real:`);
  lines.push(trackingUrl);

  return lines.join('\n');
}

/**
 * Busca rápida de clientes recorrentes do próprio tenant por telefone ou nome
 * para auto-preenchimento de dados e último endereço de entrega no Pedido Rápido.
 */
export async function searchTenantCustomers(
  tenantId: string,
  searchQuery: string
): Promise<TenantCustomerHistoryItem[]> {
  const trimmed = (searchQuery || '').trim();
  if (trimmed.length < 3) {
    return [];
  }

  const supabase = createAdminClient();
  const cleanDigits = trimmed.replace(/\D/g, '');

  let query = supabase
    .from('orders')
    .select(
      'id, order_number, customer_name, customer_phone, customer_email, created_at, fulfillment_type'
    )
    .eq('tenant_id', tenantId)
    .neq('customer_phone', '')
    .order('created_at', { ascending: false })
    .limit(40);

  if (cleanDigits.length >= 3) {
    query = query.ilike('customer_phone', `%${cleanDigits}%`);
  } else {
    query = query.ilike('customer_name', `%${trimmed}%`);
  }

  const { data: recentOrders, error } = await query;
  if (error || !recentOrders || recentOrders.length === 0) {
    return [];
  }

  const orderIds = recentOrders.map((o) => o.id);
  const { data: addresses } = await supabase
    .from('order_addresses')
    .select('order_id, zip_code, street, number, complement, neighborhood, city, state, reference')
    .eq('tenant_id', tenantId)
    .in('order_id', orderIds);

  const addrByOrder = new Map<string, any>();
  (addresses || []).forEach((a) => {
    addrByOrder.set(a.order_id, {
      zipCode: a.zip_code,
      street: a.street,
      number: a.number,
      complement: a.complement,
      neighborhood: a.neighborhood,
      city: a.city,
      state: a.state,
      reference: a.reference,
    });
  });

  const groupedByPhone = new Map<string, TenantCustomerHistoryItem>();
  for (const ord of recentOrders) {
    const phoneKey = (ord.customer_phone || '').replace(/\D/g, '') || ord.customer_name.toLowerCase();
    const existing = groupedByPhone.get(phoneKey);
    const ordAddress = addrByOrder.get(ord.id) || null;

    if (!existing) {
      groupedByPhone.set(phoneKey, {
        customerName: ord.customer_name,
        customerPhone: ord.customer_phone,
        customerEmail: ord.customer_email || null,
        lastOrderNumber: ord.order_number,
        lastOrderAt: ord.created_at,
        orderCount: 1,
        lastAddress: ordAddress,
      });
    } else {
      existing.orderCount += 1;
      if (!existing.lastAddress && ordAddress) {
        existing.lastAddress = ordAddress;
      }
    }
  }

  return Array.from(groupedByPhone.values()).slice(0, 8);
}

/**
 * Cria um Pedido Rápido Multicanal (WhatsApp, Telefone, Balcão) com validação autoritativa no servidor:
 * - Nunca confia em preços, totais ou tenant_id vindos do cliente;
 * - Mantém status operacional ('confirmed' / 'pending') estritamente separado de payment_status ('pending' / 'paid');
 * - Não permite confirmação automática falsa de Pix (Pix nasce com payment_status = 'pending');
 * - Valida permissão para descontos e registra auditoria.
 */
export async function createQuickOrder(
  tenantId: string,
  input: QuickOrderInput,
  actor: QuickOrderActor,
  options?: { tenantName?: string; baseUrl?: string }
): Promise<QuickOrderCreationResult> {
  // 1. Revalida itens e calcula preços autoritativos diretamente no banco do tenant
  const validation = await validateCartItems(tenantId, input.items);

  const crossTenantOrUnavailable = validation.issues.filter(
    (issue) => issue.type === 'cross_tenant' || issue.type === 'unavailable'
  );
  if (crossTenantOrUnavailable.length > 0) {
    throw new Error(crossTenantOrUnavailable[0].message);
  }

  if (validation.validatedItems.length === 0) {
    throw new Error('O pedido rápido deve conter pelo menos 1 item válido.');
  }

  // 2. Busca configurações comerciais do tenant para taxa de entrega padrão
  const settings = await getTenantCommerceSettings(tenantId);

  let deliveryFeeCents = 0;
  if (input.fulfillmentType === 'delivery') {
    if (!input.address) {
      throw new Error('Endereço completo é obrigatório para pedidos de entrega.');
    }

    if (
      typeof input.deliveryFeeCentsOverride === 'number' &&
      input.deliveryFeeCentsOverride >= 0
    ) {
      deliveryFeeCents = input.deliveryFeeCentsOverride;
    } else if (
      settings.free_delivery_threshold_cents &&
      validation.subtotalInCents >= settings.free_delivery_threshold_cents
    ) {
      deliveryFeeCents = 0;
    } else {
      deliveryFeeCents = settings.fixed_delivery_fee_cents;
    }
  } else {
    // pickup ou dine_in nunca cobram taxa de entrega
    deliveryFeeCents = 0;
  }

  // 3. Valida desconto e alçada de permissão
  const subtotalCents = validation.subtotalInCents;
  const discountCents = Math.max(0, Math.floor(input.discountCents || 0));
  const maxAllowedTotalBeforeDiscount = subtotalCents + deliveryFeeCents;

  if (discountCents > maxAllowedTotalBeforeDiscount) {
    throw new Error('O desconto não pode ser maior que o valor total do pedido.');
  }

  // Descontos acima de 20% do subtotal exigem perfil tenant_admin
  const maxManagerDiscountCents = Math.round(subtotalCents * 0.2);
  if (discountCents > maxManagerDiscountCents && actor.role !== 'tenant_admin') {
    throw new Error(
      'Descontos superiores a 20% exigem permissão de Administrador do Restaurante (tenant_admin).'
    );
  }

  const totalCents = Math.max(0, subtotalCents + deliveryFeeCents - discountCents);

  // 4. Valida troco quando pagamento em dinheiro
  let cashChangeForCents: number | null = null;
  let cashChangeAmountCents: number | null = null;
  if (input.paymentMethod === 'cash' && input.cashChangeForCents && input.cashChangeForCents > 0) {
    if (input.cashChangeForCents < totalCents) {
      throw new Error(
        `O valor para troco (${formatBrl(input.cashChangeForCents)}) deve ser maior ou igual ao total do pedido (${formatBrl(totalCents)}).`
      );
    }
    cashChangeForCents = input.cashChangeForCents;
    cashChangeAmountCents = input.cashChangeForCents - totalCents;
  }

  // 5. Separação estrita entre Status do Pedido e Status Financeiro
  // Regra de segurança financeira:
  // - Pix NUNCA nasce como 'paid' automaticamente sem webhook ou confirmação separada auditada.
  // - Cartão na entrega ('card_on_delivery') nasce sempre 'pending' (será cobrado na entrega).
  // - Dinheiro ('cash') ou Maquininha POS ('pos_card'/'credit_card') só nascem 'paid' quando recebidos presencialmente no balcão (markAsPaidNow = true).
  let initialPaymentStatus: CanonicalPaymentStatus = 'pending';
  if (
    input.markAsPaidNow &&
    (input.paymentMethod === 'cash' ||
      input.paymentMethod === 'pos_card' ||
      input.paymentMethod === 'credit_card')
  ) {
    initialPaymentStatus = 'paid';
  }

  const initialOrderStatus: CanonicalOrderStatus = input.confirmImmediately
    ? 'confirmed'
    : 'pending';

  const supabase = createAdminClient();

  let customOrderNumber: string | null = null;
  if (input.orderNumberOverride && input.orderNumberOverride.trim()) {
    const trimmedOrderNumber = input.orderNumberOverride.trim().slice(0, 30);
    customOrderNumber = /^\d+$/.test(trimmedOrderNumber)
      ? `#${trimmedOrderNumber}`
      : trimmedOrderNumber;

    const { data: existingOrderNumber } = await supabase
      .from('orders')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('order_number', customOrderNumber)
      .maybeSingle();

    if (existingOrderNumber) {
      throw new Error(
        `Já existe um pedido com o número "${customOrderNumber}". Escolha outro número ou deixe em branco para gerar automaticamente.`
      );
    }
  }

  const rpcItemsPayload = validation.validatedItems.map((it) => ({
    product_id: it.productId,
    variant_id: it.variantId,
    snapshot_product_name: it.productName,
    snapshot_variant_name: it.variantName,
    quantity: it.quantity,
    unit_price_cents: it.unitPriceInCents,
    subtotal_cents: it.subtotalInCents,
  }));

  const rpcAddressPayload =
    input.fulfillmentType === 'delivery' && input.address
      ? {
          zip_code: input.address.zipCode,
          street: input.address.street,
          number: input.address.number,
          complement: input.address.complement || null,
          neighborhood: input.address.neighborhood,
          city: input.address.city,
          state: input.address.state,
          reference: input.address.reference || null,
        }
      : null;

  let orderId = crypto.randomUUID();
  let orderNumber = `#${String(Math.floor(100000 + Math.random() * 900000)).slice(0, 6)}`;
  let publicTrackingToken = await generateUniqueShortTrackingToken(supabase);
  let isIdempotent = false;

  const { data: rpcData, error: rpcError } = await supabase.rpc('create_quick_order_atomic', {
    p_tenant_id: tenantId,
    p_order_channel: input.orderChannel,
    p_customer_name: input.customer.name,
    p_customer_phone: input.customer.phone || '',
    p_customer_email: input.customer.email || null,
    p_fulfillment_type: input.fulfillmentType,
    p_schedule_type: input.scheduleType,
    p_scheduled_for: input.scheduledFor || null,
    p_payment_method: input.paymentMethod,
    p_payment_status: initialPaymentStatus,
    p_initial_status: initialOrderStatus,
    p_delivery_fee_cents: deliveryFeeCents,
    p_discount_cents: discountCents,
    p_cash_change_for_cents: cashChangeForCents,
    p_notes: input.notes || null,
    p_items: rpcItemsPayload,
    p_address: rpcAddressPayload,
    p_created_by_user_id: actor.userId || null,
    p_idempotency_key: input.idempotencyKey || null,
  });

  if (rpcError) {
    throw new Error(`Falha ao registrar pedido rápido: ${rpcError.message}`);
  }

  if (rpcData && rpcData.success === false) {
    throw new Error(rpcData.error || 'Não foi possível criar o pedido rápido.');
  }

  if (rpcData?.order_id) {
    orderId = rpcData.order_id;
    orderNumber = rpcData.order_number;
    const rpcToken = typeof rpcData.public_tracking_token === 'string' ? rpcData.public_tracking_token : '';
    isIdempotent = Boolean(rpcData.idempotent);

    if (isIdempotent && rpcToken) {
      publicTrackingToken = rpcToken;
    } else {
      // Padroniza token curto também nos pedidos rápidos criados via RPC
      try {
        const ordersTable = supabase.from('orders') as any;
        if (typeof ordersTable?.update === 'function') {
          const { error: updateTokenErr } = await ordersTable
            .update({ public_tracking_token: publicTrackingToken })
            .eq('id', orderId)
            .eq('tenant_id', tenantId);
          if (updateTokenErr && rpcToken) {
            publicTrackingToken = rpcToken;
          }
        } else if (rpcToken && rpcToken.length <= 16) {
          publicTrackingToken = rpcToken;
        }
      } catch {
        if (rpcToken && rpcToken.length <= 16) {
          publicTrackingToken = rpcToken;
        }
      }
    }

    if (customOrderNumber && !isIdempotent) {
      const { error: updateOrderNumErr } = await supabase
        .from('orders')
        .update({ order_number: customOrderNumber })
        .eq('id', orderId)
        .eq('tenant_id', tenantId);

      if (updateOrderNumErr) {
        throw new Error(
          `Não foi possível definir o número do pedido "${customOrderNumber}": ${updateOrderNumErr.message}`
        );
      }
      orderNumber = customOrderNumber;
    }

    // Integração Estoque (Etapa 3D): Reserva no pedido rápido confirmado
    if (initialOrderStatus === 'confirmed' && !isIdempotent) {
      try {
        await supabase.rpc('reserve_order_inventory_atomic', {
          p_tenant_id: tenantId,
          p_order_id: rpcData.order_id,
        });
      } catch (invErr) {
        // Resiliente caso RPC de estoque ainda não esteja no banco
      }
    }
  }

  const whatsappSummaryText = formatWhatsAppOrderSummary({
    tenantName: options?.tenantName || 'BENZA',
    orderNumber,
    publicTrackingToken,
    customerName: input.customer.name,
    fulfillmentType: input.fulfillmentType,
    scheduleType: input.scheduleType,
    scheduledFor: input.scheduledFor || null,
    paymentMethod: input.paymentMethod,
    paymentStatus: initialPaymentStatus,
    cashChangeForCents,
    subtotalInCents: subtotalCents,
    deliveryFeeInCents: deliveryFeeCents,
    discountInCents: discountCents,
    totalInCents: totalCents,
    items: validation.validatedItems.map((i) => ({
      productName: i.productName,
      variantName: i.variantName,
      quantity: i.quantity,
      subtotalInCents: i.subtotalInCents,
    })),
    baseUrl: options?.baseUrl,
  });

  return {
    success: true,
    idempotent: isIdempotent,
    orderId,
    orderNumber,
    publicTrackingToken,
    orderChannel: input.orderChannel,
    status: initialOrderStatus,
    paymentMethod: input.paymentMethod,
    paymentStatus: initialPaymentStatus,
    cashChangeForCents,
    cashChangeAmountCents,
    subtotalInCents: subtotalCents,
    deliveryFeeInCents: deliveryFeeCents,
    discountInCents: discountCents,
    totalInCents: totalCents,
    formattedSubtotal: formatBrl(subtotalCents),
    formattedDeliveryFee: formatBrl(deliveryFeeCents),
    formattedDiscount: formatBrl(discountCents),
    formattedTotal: formatBrl(totalCents),
    fulfillmentType: input.fulfillmentType,
    scheduleType: input.scheduleType,
    scheduledFor: input.scheduledFor || null,
    customerName: input.customer.name,
    customerPhone: input.customer.phone || '',
    notes: input.notes || null,
    items: validation.validatedItems,
    address: input.fulfillmentType === 'delivery' && input.address ? input.address : null,
    whatsappSummaryText,
  };
}

/**
 * Confirmação manual e auditada de recebimento de pagamento (Dinheiro, POS, Cartão na Entrega ou Pix conferido)
 */
export async function confirmManualOrderPayment(
  tenantId: string,
  orderId: string,
  input: {
    paymentMethod?: OrderPaymentMethod;
    notes?: string;
  },
  actor: QuickOrderActor
) {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc('confirm_manual_order_payment_atomic', {
    p_tenant_id: tenantId,
    p_order_id: orderId,
    p_payment_method: input.paymentMethod || null,
    p_actor_user_id: actor.userId || null,
    p_notes: input.notes || null,
  });

  if (error) {
    throw new Error(`Falha ao confirmar pagamento manual: ${error.message}`);
  }

  if (data && data.success === false) {
    throw new Error(data.error || 'Não foi possível confirmar o pagamento.');
  }

  return data;
}






