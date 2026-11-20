'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ShoppingBag,
  Truck,
  Store,
  Clock,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  Trash2,
  Plus,
  Minus,
  ShieldCheck,
  Loader2,
  QrCode,
  Banknote,
  CreditCard,
  MapPin,
} from 'lucide-react';
import { useCart, formatBrl } from '@/modules/cart/CartContext';
import { LocationPinPicker } from '@/components/maps/LocationPinPicker';
import { Container } from '@/components/ui/Container';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { trackEvent } from '@/lib/analytics/events';
import {
  calculateDynamicDeliveryFee,
  DEFAULT_SCHEDULE_WINDOWS,
  getAvailableScheduleWindowsForDate,
  parseStructuredBusinessHours,
  zonedDateTimeToIso,
  type DaySchedule,
  type ScheduleWindowConfig,
  type StorePaymentOption,
  type WeekdayKey,
} from '@/modules/commerce/store-config.engine';

interface ValidatedItem {
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

interface ValidationResponse {
  isValid: boolean;
  hasPriceChanges: boolean;
  hasUnavailableItems: boolean;
  validatedItems: ValidatedItem[];
  subtotalInCents: number;
  formattedSubtotal: string;
  issues: Array<{
    type: string;
    message: string;
    variantId: string;
    oldPriceInCents?: number;
    newPriceInCents?: number;
  }>;
  commerceDisabled?: boolean;
  error?: string;
}

interface StoreConfigResponse {
  siteMode: 'prelaunch' | 'catalog' | 'commerce' | 'paused';
  availability: {
    open: boolean;
    allowsScheduled: boolean;
    reason?: string;
  };
  commerceSettings: {
    deliveryEnabled: boolean;
    pickupEnabled: boolean;
    fixedDeliveryFeeCents: number;
    freeDeliveryThresholdCents: number | null;
    minOrderValueCents: number;
    asapEnabled: boolean;
    scheduledEnabled: boolean;
    estimatedDeliveryTimeMin: number;
    estimatedPickupTimeMin: number;
    pricingMode?: 'fixed' | 'distance' | 'distance_band' | 'external_quote';
    maxDeliveryDistanceKm?: number;
  };
  enabledPaymentMethods: StorePaymentOption[];
  businessHoursSummary?: {
    producao: string | null;
    entregas: string | null;
    enforceSchedule: boolean;
    timezone?: string;
    minScheduleLeadMinutes?: number;
    scheduleWindows?: ScheduleWindowConfig[];
    weeklyHours?: Record<WeekdayKey, DaySchedule>;
  };
}

export default function CheckoutPage() {
  const router = useRouter();
  const { items, updateQuantity, removeItem, clearCart } = useCart();

  // Configurações comerciais reais do servidor
  const [storeConfig, setStoreConfig] = useState<StoreConfigResponse | null>(null);
  const [isLoadingConfig, setIsLoadingConfig] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);

  // Estados de revalidação server-side
  const [isValidating, setIsValidating] = useState(true);
  const [validationData, setValidationData] = useState<ValidationResponse | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Estados do formulário de dados do cliente
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');

  // Modalidade de entrega
  const [fulfillmentType, setFulfillmentType] = useState<'delivery' | 'pickup'>('delivery');

  // Pagamento e idempotência
  const [paymentMethod, setPaymentMethod] = useState<StorePaymentOption>('pix');
  const [cashChangeForReais, setCashChangeForReais] = useState('');
  const [idempotencyKey] = useState(() =>
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  );

  // Endereço
  const [zipCode, setZipCode] = useState('');
  const [street, setStreet] = useState('');
  const [number, setNumber] = useState('');
  const [complement, setComplement] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [reference, setReference] = useState('');
  const [isLoadingCep, setIsLoadingCep] = useState(false);

  // Agendamento
  const [scheduleType, setScheduleType] = useState<'asap' | 'scheduled'>('asap');
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledWindow, setScheduledWindow] = useState('11:30 - 13:30');

  // Observações e Cupom de Desconto
  const [notes, setNotes] = useState('');
  const [couponInput, setCouponInput] = useState('');
  const [isApplyingCoupon, setIsApplyingCoupon] = useState(false);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [appliedCoupon, setAppliedCoupon] = useState<{
    code: string;
    name: string;
    discountCents: number;
  } | null>(null);

  // Submissão
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Cotação inteligente de frete (usada apenas quando pricingMode === 'distance')
  const [checkoutSessionId] = useState(() =>
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `chk-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  );
  const [confirmedPin, setConfirmedPin] = useState<{ lat: number; lng: number } | null>(null);
  const [pinAdjustedManually, setPinAdjustedManually] = useState(false);
  const [deliveryQuote, setDeliveryQuote] = useState<{
    quoteId: string | null;
    expiresAt: string | null;
    serverSubtotalCents: number;
    addressHash: string;
    cartHash: string;
    ambiguousAddress: boolean;
    destinationFormattedAddress?: string;
    destinationPrecision?: string;
    destinationCoords?: { lat: number; lng: number };
    quote: {
      eligible: boolean;
      pricingMode: string;
      deliveryFeeCents: number;
      distanceKm?: number;
      durationMin?: number;
      isFreeDelivery?: boolean;
      freeDeliveryThresholdCents?: number | null;
      reason?: string;
      errorCode?: string;
      provider?: string;
      usedNeighborhoodFallback?: boolean;
      appliedRuleSummary?: string;
    };
  } | null>(null);
  const [isQuotingDelivery, setIsQuotingDelivery] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  // 1. Revalidação autoritativa do carrinho contra o servidor
  const revalidateCart = useCallback(async () => {
    if (items.length === 0) {
      setIsValidating(false);
      return;
    }

    setIsValidating(true);
    setValidationError(null);

    try {
      const payload = {
        items: items.map((i) => ({
          productId: i.productId,
          variantId: i.variantId,
          quantity: i.quantity,
          clientPriceInCents: i.unitPriceInCents,
          selectedModifierOptionIds: (i.selectedModifiers || []).map((m) => m.optionId),
        })),
      };

      const res = await fetch('/api/checkout/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        setValidationError(data.error || 'Não foi possível validar os itens no servidor.');
      } else {
        setValidationData(data);
      }
    } catch {
      setValidationError('Falha de conexão ao revalidar valores com o servidor.');
    } finally {
      setIsValidating(false);
    }
  }, [items]);

  const loadStoreConfig = useCallback(async () => {
    setIsLoadingConfig(true);
    setConfigError(null);
    try {
      const res = await fetch('/api/store/config', { cache: 'no-store' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Não foi possível carregar as regras de atendimento da loja.');
      }
      const cfg: StoreConfigResponse = await res.json();
      setStoreConfig(cfg);

      if (!cfg.commerceSettings.deliveryEnabled && cfg.commerceSettings.pickupEnabled) {
        setFulfillmentType('pickup');
      } else if (cfg.commerceSettings.deliveryEnabled) {
        setFulfillmentType('delivery');
      }

      if (!cfg.commerceSettings.asapEnabled && cfg.commerceSettings.scheduledEnabled) {
        setScheduleType('scheduled');
      } else if (!cfg.availability.open && cfg.availability.allowsScheduled && cfg.commerceSettings.scheduledEnabled) {
        setScheduleType('scheduled');
      }

      if (cfg.enabledPaymentMethods.length > 0) {
        setPaymentMethod(cfg.enabledPaymentMethods[0]);
      }
    } catch (err: unknown) {
      setStoreConfig(null);
      setConfigError(
        (err as { message?: string })?.message ||
          'Erro de conexão ao consultar horários e formas de pagamento da loja.'
      );
    } finally {
      setIsLoadingConfig(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void loadStoreConfig(), 0);
    return () => clearTimeout(t);
  }, [loadStoreConfig]);

  useEffect(() => {
    revalidateCart();
    trackEvent('begin_checkout', { itemsCount: items.length });
  }, [revalidateCart, items.length]);

  // Busca automática de CEP (ViaCEP com fallback BrasilAPI)
  const lastFetchedCepRef = React.useRef<string>('');
  const lookupCep = useCallback(async (cleanCep: string) => {
    if (cleanCep.length !== 8 || lastFetchedCepRef.current === cleanCep) return;
    lastFetchedCepRef.current = cleanCep;
    setIsLoadingCep(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
      const data = await res.json();
      if (res.ok && !data.erro && (data.logradouro || data.localidade)) {
        setStreet(data.logradouro || '');
        setNeighborhood(data.bairro || '');
        setCity(data.localidade || '');
        setState((data.uf || '').toUpperCase());
        return;
      }
      throw new Error('ViaCEP sem resultado');
    } catch {
      try {
        const resBr = await fetch(`https://brasilapi.com.br/api/cep/v1/${cleanCep}`);
        if (resBr.ok) {
          const dataBr = await resBr.json();
          setStreet(dataBr.street || '');
          setNeighborhood(dataBr.neighborhood || '');
          setCity(dataBr.city || '');
          setState((dataBr.state || '').toUpperCase());
          return;
        }
      } catch {
        // Fallback silencioso para preenchimento manual
      }
      lastFetchedCepRef.current = '';
    } finally {
      setIsLoadingCep(false);
    }
  }, []);

  const handleCepBlur = () => {
    const cleanCep = zipCode.replace(/\D/g, '');
    if (cleanCep.length === 8) {
      void lookupCep(cleanCep);
    }
  };

  // Cálculo autoritativo de frete, pedido mínimo e totais sincronizado com o servidor
  const subtotalCents = validationData?.subtotalInCents || 0;
  const effectiveSettings = storeConfig?.commerceSettings ?? {
    deliveryEnabled: true,
    pickupEnabled: true,
    fixedDeliveryFeeCents: 1200,
    freeDeliveryThresholdCents: null,
    minOrderValueCents: 0,
    asapEnabled: true,
    scheduledEnabled: true,
    estimatedDeliveryTimeMin: 45,
    estimatedPickupTimeMin: 30,
    pricingMode: 'fixed' as const,
  };
  const pricingMode = effectiveSettings.pricingMode || 'fixed';
  const isDistanceDelivery =
    (pricingMode === 'distance' || pricingMode === 'distance_band') &&
    fulfillmentType === 'delivery';
  const cleanCepDigits = zipCode.replace(/\D/g, '');
  const hasCompleteAddress =
    cleanCepDigits.length === 8 &&
    street.trim().length >= 2 &&
    number.trim().length >= 1 &&
    neighborhood.trim().length >= 2 &&
    city.trim().length >= 2 &&
    state.trim().length === 2;
  const addressSignature = `${cleanCepDigits}|${street.trim()}|${number.trim()}|${complement.trim()}|${neighborhood.trim()}|${city.trim()}|${state.trim().toUpperCase()}`;
  const cartSignature = JSON.stringify(
    items.map((i) => ({
      productId: i.productId,
      variantId: i.variantId,
      quantity: i.quantity,
      selectedModifierOptionIds: (i.selectedModifiers || []).map((m) => m.optionId),
    }))
  );

  // Invalida pino e cotação ao alterar endereço
  useEffect(() => {
    setConfirmedPin(null);
    setPinAdjustedManually(false);
    setDeliveryQuote(null);
    setQuoteError(null);
  }, [addressSignature]);

  // Dinheiro disponível apenas para retirada no local
  useEffect(() => {
    if (fulfillmentType === 'delivery' && paymentMethod === 'cash') {
      const fallbackMethod =
        (storeConfig?.enabledPaymentMethods || []).find((m) => m !== 'cash') || 'pix';
      setPaymentMethod(fallbackMethod);
      setCashChangeForReais('');
    }
  }, [fulfillmentType, paymentMethod, storeConfig]);

  // Invalida cotação ao alterar sacola ou modalidade
  useEffect(() => {
    setDeliveryQuote(null);
    setQuoteError(null);
  }, [cartSignature, fulfillmentType]);

  // Recalcula cotação de frete no servidor quando pricingMode === 'distance'
  useEffect(() => {
    if (!isDistanceDelivery || !hasCompleteAddress || items.length === 0) {
      setIsQuotingDelivery(false);
      return;
    }
    if (isValidating || validationError || !validationData || validationData.hasUnavailableItems) {
      return;
    }

    let active = true;
    const timer = setTimeout(async () => {
      setIsQuotingDelivery(true);
      setQuoteError(null);
      try {
        const res = await fetch('/api/checkout/delivery-quote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fulfillmentType,
            items: items.map((i) => ({
              productId: i.productId,
              variantId: i.variantId,
              quantity: i.quantity,
              clientPriceInCents: i.unitPriceInCents,
              selectedModifierOptionIds: (i.selectedModifiers || []).map((m) => m.optionId),
            })),
            address: {
              zipCode: zipCode.trim(),
              street: street.trim(),
              number: number.trim(),
              complement: complement.trim() || undefined,
              neighborhood: neighborhood.trim(),
              city: city.trim(),
              state: state.trim().toUpperCase(),
              reference: reference.trim() || undefined,
            },
            confirmedPin: confirmedPin ?? undefined,
            checkoutSessionId,
          }),
        });
        const data = await res.json();
        if (!active) return;

        if (!res.ok) {
          setDeliveryQuote(null);
          setQuoteError(data?.error || 'Não foi possível calcular a entrega para este endereço.');
          return;
        }

        setDeliveryQuote(data);
        if (!data.quote?.eligible) {
          setQuoteError(data.quote?.reason || 'Endereço fora da área de entrega.');
        }
      } catch {
        if (!active) return;
        setDeliveryQuote(null);
        setQuoteError('Erro de conexão ao calcular a taxa de entrega.');
      } finally {
        if (active) setIsQuotingDelivery(false);
      }
    }, 450);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [
    isDistanceDelivery,
    hasCompleteAddress,
    addressSignature,
    cartSignature,
    confirmedPin,
    checkoutSessionId,
    isValidating,
    validationError,
    validationData,
  ]);

  const deliveryFeeCents = isDistanceDelivery
    ? deliveryQuote?.quote?.eligible
      ? deliveryQuote.quote.deliveryFeeCents
      : 0
    : calculateDynamicDeliveryFee(subtotalCents, fulfillmentType, {
        fixed_delivery_fee_cents: effectiveSettings.fixedDeliveryFeeCents,
        free_delivery_threshold_cents: effectiveSettings.freeDeliveryThresholdCents,
      });
  const discountCents = appliedCoupon ? Math.min(subtotalCents, appliedCoupon.discountCents) : 0;
  const totalCents = Math.max(0, subtotalCents + deliveryFeeCents - discountCents);

  const appliedCouponCode = appliedCoupon?.code;

  // Revalida o cupom automaticamente sempre que o subtotal dos itens mudar
  useEffect(() => {
    if (!appliedCouponCode || subtotalCents <= 0) return;
    let active = true;
    fetch('/api/checkout/coupon', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: appliedCouponCode,
        subtotalInCents: subtotalCents,
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (!active) return;
        if (!data.valid) {
          setAppliedCoupon(null);
          setCouponError(data.error || 'Cupom removido após alteração da sacola.');
        } else {
          setAppliedCoupon((prev) =>
            prev ? { ...prev, discountCents: data.discountCents } : null
          );
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [appliedCouponCode, subtotalCents]);

  const handleApplyCoupon = async () => {
    const clean = couponInput.trim().toUpperCase();
    if (!clean) {
      setCouponError('Digite o código do cupom.');
      return;
    }
    setIsApplyingCoupon(true);
    setCouponError(null);
    try {
      const res = await fetch('/api/checkout/coupon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: clean,
          subtotalInCents: subtotalCents,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.valid) {
        setAppliedCoupon(null);
        setCouponError(data.error || 'Cupom inválido ou expirado.');
        return;
      }
      setAppliedCoupon({
        code: data.code,
        name: data.name,
        discountCents: data.discountCents,
      });
      setCouponInput(data.code);
      trackEvent('coupon_apply', { code: data.code, discountCents: data.discountCents });
    } catch {
      setCouponError('Erro de conexão ao validar cupom.');
    } finally {
      setIsApplyingCoupon(false);
    }
  };

  const isStoreCommerce = !storeConfig || storeConfig.siteMode === 'commerce';
  const isStoreOpenNow = storeConfig ? storeConfig.availability.open : true;
  const allowsScheduledWhenClosed = storeConfig ? storeConfig.availability.allowsScheduled : true;
  const isBelowMinOrder =
    effectiveSettings.minOrderValueCents > 0 && subtotalCents < effectiveSettings.minOrderValueCents;
  const enabledPaymentMethods: StorePaymentOption[] =
    storeConfig && storeConfig.enabledPaymentMethods.length > 0
      ? storeConfig.enabledPaymentMethods
      : ['pix'];
  const isBlockedByStoreAvailability =
    !isStoreCommerce ||
    (!isStoreOpenNow && (!allowsScheduledWhenClosed || scheduleType !== 'scheduled'));

  // Submissão do pedido
  const handleConfirmOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (!storeConfig || configError) {
      setSubmitError(configError || 'Não foi possível carregar as configurações da loja.');
      return;
    }

    if (isValidating || validationError || !validationData) {
      setSubmitError(validationError || 'Aguarde a validação dos itens no servidor antes de confirmar.');
      return;
    }

    if (!isStoreCommerce) {
      setSubmitError(storeConfig?.availability.reason || 'A loja não está recebendo pedidos online no momento.');
      return;
    }

    if (isBlockedByStoreAvailability) {
      setSubmitError(storeConfig?.availability.reason || 'A loja está fechada ou pausada para pedidos imediatos.');
      return;
    }

    if (isBelowMinOrder) {
      setSubmitError(
        `O pedido mínimo é de ${formatBrl(effectiveSettings.minOrderValueCents)}. Adicione mais itens para continuar.`
      );
      return;
    }

    if (validationData?.hasUnavailableItems) {
      setSubmitError('Há itens indisponíveis ou sem estoque suficiente na sua sacola.');
      return;
    }

    if (isDistanceDelivery) {
      if (isQuotingDelivery) {
        setSubmitError('Aguarde o cálculo da taxa de entrega antes de confirmar.');
        return;
      }
      if (quoteError || !deliveryQuote || !deliveryQuote.quote?.eligible || !deliveryQuote.quoteId) {
        setSubmitError(
          quoteError ||
            deliveryQuote?.quote?.reason ||
            'Não foi possível validar a entrega para o endereço informado.'
        );
        return;
      }
      if (deliveryQuote.ambiguousAddress && !pinAdjustedManually) {
        setSubmitError('Confirme o local exato de entrega no mapa antes de finalizar.');
        return;
      }
    }

    // Validações client-side prévias
    if (!customerName.trim() || customerName.trim().length < 2) {
      setSubmitError('Por favor, informe seu nome completo.');
      return;
    }
    const cleanPhone = customerPhone.replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      setSubmitError('Por favor, informe um telefone/WhatsApp com DDD válido.');
      return;
    }

    if (fulfillmentType === 'delivery') {
      const cleanZip = zipCode.replace(/\D/g, '');
      if (cleanZip.length !== 8) {
        setSubmitError('Por favor, informe um CEP válido com 8 dígitos.');
        return;
      }
      if (!street.trim() || !number.trim() || !neighborhood.trim() || !city.trim() || !state.trim()) {
        setSubmitError('Por favor, preencha todos os campos obrigatórios do endereço de entrega.');
        return;
      }
    }

    if (scheduleType === 'scheduled' && !scheduledDate) {
      setSubmitError('Por favor, escolha o dia e a janela para o agendamento.');
      return;
    }

    let parsedCashChangeCents: number | undefined;
    if (paymentMethod === 'cash' && cashChangeForReais.trim()) {
      const normalized = Number(cashChangeForReais.replace(',', '.'));
      if (Number.isNaN(normalized) || normalized < 0) {
        setSubmitError('Informe um valor válido para troco em dinheiro.');
        return;
      }
      const cents = Math.round(normalized * 100);
      if (cents > 0 && cents < totalCents) {
        setSubmitError(`O valor para troco deve ser maior ou igual ao total (${formatBrl(totalCents)}).`);
        return;
      }
      if (cents > 0) {
        parsedCashChangeCents = cents;
      }
    }

    setIsSubmitting(true);

    try {
      let scheduledIso: string | undefined;
      let resolvedScheduledWindow: string | undefined;
      if (scheduleType === 'scheduled' && scheduledDate) {
        const summary = storeConfig?.businessHoursSummary;
        const configured = summary?.scheduleWindows || DEFAULT_SCHEDULE_WINDOWS;
        const structured = parseStructuredBusinessHours({
          timezone: summary?.timezone,
          weekly_hours: summary?.weeklyHours,
          schedule_windows: configured,
        });
        const availableWindows = getAvailableScheduleWindowsForDate(
          structured,
          scheduledDate,
          fulfillmentType
        );
        if (availableWindows.length === 0) {
          setSubmitError('Não há janelas disponíveis para a data e modalidade selecionadas.');
          setIsSubmitting(false);
          return;
        }
        resolvedScheduledWindow = availableWindows.some((w) => w.value === scheduledWindow)
          ? scheduledWindow
          : availableWindows[0].value;
        const startMatch = resolvedScheduledWindow.match(/^(\d{2}:\d{2})/);
        const startTime = startMatch ? startMatch[1] : '11:30';
        const storeTimezone = summary?.timezone || 'America/Sao_Paulo';
        scheduledIso = zonedDateTimeToIso(scheduledDate, startTime, storeTimezone);
      }

      const orderPayload = {
        items: items.map((i) => ({
          productId: i.productId,
          variantId: i.variantId,
          quantity: i.quantity,
          clientPriceInCents: i.unitPriceInCents,
          selectedModifierOptionIds: (i.selectedModifiers || []).map((m) => m.optionId),
        })),
        customer: {
          name: customerName.trim(),
          phone: customerPhone.trim(),
          email: customerEmail.trim() || undefined,
        },
        fulfillmentType,
        scheduleType,
        scheduledFor: scheduledIso,
        scheduledWindow: scheduleType === 'scheduled' ? resolvedScheduledWindow : undefined,
        paymentMethod,
        cashChangeForCents: parsedCashChangeCents,
        couponCode: appliedCoupon?.code || undefined,
        idempotencyKey,
        deliveryQuoteId:
          isDistanceDelivery && deliveryQuote?.quoteId ? deliveryQuote.quoteId : undefined,
        checkoutSessionId: isDistanceDelivery ? checkoutSessionId : undefined,
        confirmedPin:
          isDistanceDelivery && confirmedPin ? confirmedPin : undefined,
        address:
          fulfillmentType === 'delivery'
            ? {
                zipCode: zipCode.trim(),
                street: street.trim(),
                number: number.trim(),
                complement: complement.trim() || undefined,
                neighborhood: neighborhood.trim(),
                city: city.trim(),
                state: state.trim().toUpperCase(),
                reference: reference.trim() || undefined,
              }
            : undefined,
        notes: notes.trim() || undefined,
      };

      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderPayload),
      });

      const data = await res.json();

      if (!res.ok) {
        setSubmitError(data.error || 'Erro ao processar pedido. Revise as informações.');
        setIsSubmitting(false);
        return;
      }

      // Evento analítico seguro sem PII
      trackEvent('order_created', {
        orderId: data.orderId,
        orderNumber: data.orderNumber,
        fulfillmentType: data.fulfillmentType,
        totalCents: data.totalInCents,
      });

      // Limpar carrinho do cliente após confirmação
      clearCart();

      // Redirecionar para tela de confirmação
      const successParams = new URLSearchParams({
        orderId: data.orderId,
        orderNumber: data.orderNumber,
        trackingToken: data.publicTrackingToken || '',
        total: data.formattedTotal,
        name: data.customerName,
        fulfillment: data.fulfillmentType,
        paymentMethod,
      });

      router.push(`/checkout/sucesso?${successParams.toString()}`);
    } catch {
      setSubmitError('Falha de conexão com o servidor. Verifique sua internet.');
      setIsSubmitting(false);
    }
  };

  if (items.length === 0) {
    return (
      <div className="py-16 sm:py-24 bg-tenant-background min-h-[70vh] flex items-center justify-center">
        <Container size="sm">
          <Card className="p-8 text-center space-y-4 bg-tenant-surface border-tenant-border">
            <div className="w-16 h-16 rounded-full bg-tenant-background mx-auto flex items-center justify-center text-tenant-muted">
              <ShoppingBag className="w-8 h-8" />
            </div>
            <h1 className="font-heading text-2xl font-bold text-tenant-text">
              Sua sacola está vazia
            </h1>
            <p className="text-sm text-tenant-muted">
              Você ainda não adicionou pratos para finalizar seu pedido.
            </p>
            <div className="pt-2">
              <Link
                href="/produtos"
                className="inline-flex items-center justify-center px-6 py-3 rounded-tenant bg-tenant-primary text-white text-sm font-semibold hover:brightness-110 transition-all shadow-sm"
              >
                Ver Cardápio
              </Link>
            </div>
          </Card>
        </Container>
      </div>
    );
  }

  return (
    <div className="py-8 sm:py-16 bg-tenant-background transition-colors min-h-[90vh]">
      <Container size="lg">
        {/* Header do Checkout */}
        <div className="mb-8 flex items-center justify-between">
          <Link
            href="/produtos"
            className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-tenant-muted hover:text-tenant-primary transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Voltar ao Cardápio</span>
          </Link>

          <div className="flex items-center gap-2 text-xs text-tenant-muted font-medium">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Ambiente Seguro</span>
          </div>
        </div>

        {/* Banner de Disponibilidade / Loja Fechada ou Pausada */}
        {storeConfig && (!isStoreCommerce || !isStoreOpenNow) && (
          <div className="mb-6 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1 text-sm">
              <span className="font-bold block">
                {!isStoreCommerce
                  ? 'Pedidos online indisponíveis no momento'
                  : 'Loja fora do horário ou temporariamente pausada'}
              </span>
              <p className="text-xs leading-relaxed">
                {storeConfig.availability.reason ||
                  'No momento não estamos recebendo pedidos imediatos.'}{' '}
                {isStoreCommerce && allowsScheduledWhenClosed && effectiveSettings.scheduledEnabled
                  ? 'Você ainda pode agendar seu pedido escolhendo uma data abaixo.'
                  : ''}
              </p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">
          {/* Coluna Principal: Formulário Contínuo */}
          <div className="lg:col-span-7 space-y-8">
            <form id="checkout-form" onSubmit={handleConfirmOrder} className="space-y-8">
              {/* 1. SEUS DADOS */}
              <Card className="p-6 bg-tenant-surface border-tenant-border space-y-4">
                <div className="flex items-center gap-2 text-tenant-primary border-b border-tenant-border/50 pb-3">
                  <span className="w-6 h-6 rounded-full bg-tenant-primary/10 text-tenant-primary text-xs font-bold flex items-center justify-center">
                    1
                  </span>
                  <h2 className="font-heading font-bold text-base text-tenant-text uppercase tracking-wide">
                    Seus Dados
                  </h2>
                </div>

                <div className="space-y-4 text-sm">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-tenant-text mb-1">
                      Nome Completo *
                    </label>
                    <input
                      type="text"
                      required
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Ex: Maria Silva"
                      className="w-full px-3.5 py-2.5 rounded-tenant bg-tenant-background border border-tenant-border text-tenant-text placeholder:text-tenant-muted/60 focus:outline-hidden focus:ring-2 focus:ring-tenant-primary"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-tenant-text mb-1">
                        WhatsApp / Celular *
                      </label>
                      <input
                        type="tel"
                        required
                        value={customerPhone}
                        onChange={(e) => setCustomerPhone(e.target.value)}
                        placeholder="(11) 98765-4321"
                        className="w-full px-3.5 py-2.5 rounded-tenant bg-tenant-background border border-tenant-border text-tenant-text placeholder:text-tenant-muted/60 focus:outline-hidden focus:ring-2 focus:ring-tenant-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-tenant-text mb-1">
                        E-mail (opcional)
                      </label>
                      <input
                        type="email"
                        value={customerEmail}
                        onChange={(e) => setCustomerEmail(e.target.value)}
                        placeholder="Para envio do recibo"
                        className="w-full px-3.5 py-2.5 rounded-tenant bg-tenant-background border border-tenant-border text-tenant-text placeholder:text-tenant-muted/60 focus:outline-hidden focus:ring-2 focus:ring-tenant-primary"
                      />
                    </div>
                  </div>
                </div>
              </Card>

              {/* 2. COMO DESEJA RECEBER? */}
              <Card className="p-6 bg-tenant-surface border-tenant-border space-y-5">
                <div className="flex items-center gap-2 text-tenant-primary border-b border-tenant-border/50 pb-3">
                  <span className="w-6 h-6 rounded-full bg-tenant-primary/10 text-tenant-primary text-xs font-bold flex items-center justify-center">
                    2
                  </span>
                  <h2 className="font-heading font-bold text-base text-tenant-text uppercase tracking-wide">
                    Como Deseja Receber?
                  </h2>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {effectiveSettings.deliveryEnabled && (
                    <button
                      type="button"
                      onClick={() => setFulfillmentType('delivery')}
                      className={`p-4 rounded-xl border text-left flex flex-col justify-between gap-2 transition-all ${
                        fulfillmentType === 'delivery'
                          ? 'border-tenant-primary bg-tenant-primary/5 ring-1 ring-tenant-primary'
                          : 'border-tenant-border bg-tenant-background hover:border-tenant-border/80'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <Truck className={`w-5 h-5 ${fulfillmentType === 'delivery' ? 'text-tenant-primary' : 'text-tenant-muted'}`} />
                        {fulfillmentType === 'delivery' && <CheckCircle2 className="w-4 h-4 text-tenant-primary" />}
                      </div>
                      <div>
                        <span className="font-heading font-bold text-sm text-tenant-text block">
                          Entrega em Casa
                        </span>
                        <span className="text-xs text-tenant-muted block mt-0.5">
                          {pricingMode === 'distance' || pricingMode === 'distance_band'
                            ? deliveryQuote?.quote?.eligible
                              ? deliveryFeeCents === 0
                                ? 'Entrega grátis'
                                : `Taxa: ${formatBrl(deliveryFeeCents)}`
                              : 'Calculada pelo endereço'
                            : effectiveSettings.fixedDeliveryFeeCents === 0
                            ? 'Entrega grátis'
                            : `Taxa fixa: ${formatBrl(effectiveSettings.fixedDeliveryFeeCents)}`}
                          {effectiveSettings.freeDeliveryThresholdCents &&
                          effectiveSettings.freeDeliveryThresholdCents > 0
                            ? ` · Grátis acima de ${formatBrl(effectiveSettings.freeDeliveryThresholdCents)}`
                            : ''}
                        </span>
                        <span className="text-[11px] text-tenant-muted/80 block mt-0.5">
                          Tempo estimado: ~{effectiveSettings.estimatedDeliveryTimeMin} min
                        </span>
                      </div>
                    </button>
                  )}

                  {effectiveSettings.pickupEnabled && (
                    <button
                      type="button"
                      onClick={() => setFulfillmentType('pickup')}
                      className={`p-4 rounded-xl border text-left flex flex-col justify-between gap-2 transition-all ${
                        fulfillmentType === 'pickup'
                          ? 'border-tenant-primary bg-tenant-primary/5 ring-1 ring-tenant-primary'
                          : 'border-tenant-border bg-tenant-background hover:border-tenant-border/80'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <Store className={`w-5 h-5 ${fulfillmentType === 'pickup' ? 'text-tenant-primary' : 'text-tenant-muted'}`} />
                        {fulfillmentType === 'pickup' && <CheckCircle2 className="w-4 h-4 text-tenant-primary" />}
                      </div>
                      <div>
                        <span className="font-heading font-bold text-sm text-tenant-text block">
                          Retirada no Local
                        </span>
                        <span className="text-xs text-emerald-600 font-semibold block mt-0.5">
                          Grátis (Sem taxa)
                        </span>
                        <span className="text-[11px] text-tenant-muted/80 block mt-0.5">
                          Pronto em ~{effectiveSettings.estimatedPickupTimeMin} min
                        </span>
                      </div>
                    </button>
                  )}
                </div>

                {/* Formulário de Endereço se Entrega */}
                {fulfillmentType === 'delivery' ? (
                  <div className="space-y-4 pt-2 border-t border-tenant-border/40">
                    <span className="text-xs font-bold uppercase tracking-wider text-tenant-text block">
                      Endereço de Entrega
                    </span>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-tenant-muted mb-1">
                          CEP * {isLoadingCep && <span className="text-tenant-primary ml-1">(Buscando...)</span>}
                        </label>
                        <input
                          type="text"
                          required
                          value={zipCode}
                          onChange={(e) => {
                            const val = e.target.value;
                            setZipCode(val);
                            const digits = val.replace(/\D/g, '');
                            if (digits.length === 8) {
                              void lookupCep(digits);
                            }
                          }}
                          onBlur={handleCepBlur}
                          placeholder="00000-000"
                          maxLength={9}
                          className="w-full px-3 py-2 rounded-tenant bg-tenant-background border border-tenant-border text-sm text-tenant-text focus:outline-hidden focus:ring-2 focus:ring-tenant-primary"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-xs font-medium text-tenant-muted mb-1">
                          Rua / Avenida *
                        </label>
                        <input
                          type="text"
                          required
                          value={street}
                          onChange={(e) => setStreet(e.target.value)}
                          placeholder="Nome da rua"
                          disabled={isLoadingCep}
                          className="w-full px-3 py-2 rounded-tenant bg-tenant-background border border-tenant-border text-sm text-tenant-text focus:outline-hidden focus:ring-2 focus:ring-tenant-primary disabled:opacity-60"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-tenant-muted mb-1">
                          Número *
                        </label>
                        <input
                          type="text"
                          required
                          value={number}
                          onChange={(e) => setNumber(e.target.value)}
                          placeholder="Ex: 123"
                          className="w-full px-3 py-2 rounded-tenant bg-tenant-background border border-tenant-border text-sm text-tenant-text focus:outline-hidden focus:ring-2 focus:ring-tenant-primary"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-xs font-medium text-tenant-muted mb-1">
                          Complemento (Apto, Bloco, etc.)
                        </label>
                        <input
                          type="text"
                          value={complement}
                          onChange={(e) => setComplement(e.target.value)}
                          placeholder="Ex: Apto 42"
                          className="w-full px-3 py-2 rounded-tenant bg-tenant-background border border-tenant-border text-sm text-tenant-text focus:outline-hidden focus:ring-2 focus:ring-tenant-primary"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-tenant-muted mb-1">
                          Bairro *
                        </label>
                        <input
                          type="text"
                          required
                          value={neighborhood}
                          onChange={(e) => setNeighborhood(e.target.value)}
                          placeholder="Bairro"
                          disabled={isLoadingCep}
                          className="w-full px-3 py-2 rounded-tenant bg-tenant-background border border-tenant-border text-sm text-tenant-text focus:outline-hidden focus:ring-2 focus:ring-tenant-primary disabled:opacity-60"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-tenant-muted mb-1">
                          Cidade *
                        </label>
                        <input
                          type="text"
                          required
                          value={city}
                          onChange={(e) => setCity(e.target.value)}
                          placeholder="Cidade"
                          disabled={isLoadingCep}
                          className="w-full px-3 py-2 rounded-tenant bg-tenant-background border border-tenant-border text-sm text-tenant-text focus:outline-hidden focus:ring-2 focus:ring-tenant-primary disabled:opacity-60"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-tenant-muted mb-1">
                          Estado (UF) *
                        </label>
                        <input
                          type="text"
                          required
                          maxLength={2}
                          value={state}
                          onChange={(e) => setState(e.target.value.toUpperCase())}
                          placeholder="SP"
                          disabled={isLoadingCep}
                          className="w-full px-3 py-2 rounded-tenant bg-tenant-background border border-tenant-border text-sm text-tenant-text uppercase focus:outline-hidden focus:ring-2 focus:ring-tenant-primary disabled:opacity-60"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-tenant-muted mb-1">
                        Ponto de Referência (opcional)
                      </label>
                      <input
                        type="text"
                        value={reference}
                        onChange={(e) => setReference(e.target.value)}
                        placeholder="Ex: Próximo à padaria, interfone 12"
                        className="w-full px-3 py-2 rounded-tenant bg-tenant-background border border-tenant-border text-sm text-tenant-text focus:outline-hidden focus:ring-2 focus:ring-tenant-primary"
                      />
                    </div>

                    {isDistanceDelivery && (
                      <div className="space-y-3 pt-2 border-t border-tenant-border/40">
                        {!hasCompleteAddress && (
                          <div className="p-3 rounded-xl bg-tenant-background border border-tenant-border text-xs text-tenant-muted flex items-center gap-2">
                            <MapPin className="w-4 h-4 text-tenant-primary shrink-0" />
                            <span>
                              Preencha CEP, rua, número, bairro, cidade e UF para calcular a taxa de entrega.
                            </span>
                          </div>
                        )}

                        {hasCompleteAddress && isQuotingDelivery && (
                          <div className="p-3 rounded-xl bg-tenant-background border border-tenant-border text-xs text-tenant-muted flex items-center gap-2">
                            <Loader2 className="w-4 h-4 animate-spin text-tenant-primary shrink-0" />
                            <span>Calculando rota e taxa de entrega...</span>
                          </div>
                        )}

                        {hasCompleteAddress && !isQuotingDelivery && quoteError && (
                          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-700 dark:text-red-300 text-xs flex items-start gap-2">
                            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                            <span>{quoteError}</span>
                          </div>
                        )}

                        {hasCompleteAddress &&
                          !isQuotingDelivery &&
                          deliveryQuote?.quote?.eligible && (
                            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-xs space-y-1">
                              <div className="flex items-center justify-between gap-2 font-bold text-emerald-800 dark:text-emerald-300">
                                <span className="flex items-center gap-1.5">
                                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                                  {deliveryQuote.quote.usedNeighborhoodFallback
                                    ? 'Entrega disponível (tarifa por bairro)'
                                    : 'Entrega disponível para este endereço'}
                                </span>
                                <span>
                                  {deliveryQuote.quote.deliveryFeeCents === 0
                                    ? 'Grátis'
                                    : formatBrl(deliveryQuote.quote.deliveryFeeCents)}
                                </span>
                              </div>
                              {(deliveryQuote.quote.distanceKm !== undefined ||
                                deliveryQuote.quote.durationMin !== undefined) && (
                                <p className="text-[11px] text-emerald-700 dark:text-emerald-400">
                                  {deliveryQuote.quote.distanceKm !== undefined
                                    ? `Distância estimada: ${deliveryQuote.quote.distanceKm.toFixed(1)} km`
                                    : ''}
                                  {deliveryQuote.quote.durationMin !== undefined
                                    ? ` (~${Math.round(deliveryQuote.quote.durationMin)} min de trajeto)`
                                    : ''}
                                </p>
                              )}
                            </div>
                          )}

                        {deliveryQuote?.destinationCoords && (
                          <div className="space-y-2">
                            {deliveryQuote.ambiguousAddress && !pinAdjustedManually && (
                              <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-300 text-xs flex items-start gap-2">
                                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                                <span>
                                  Endereço aproximado. Ajuste o pino se necessário e clique em{' '}
                                  <strong>Confirmar local</strong> no mapa.
                                </span>
                              </div>
                            )}
                            <LocationPinPicker
                              initialCoords={confirmedPin || deliveryQuote.destinationCoords}
                              addressLabel={
                                deliveryQuote.destinationFormattedAddress ||
                                `${street}, ${number} - ${neighborhood}`
                              }
                              confirmed={pinAdjustedManually || !deliveryQuote.ambiguousAddress}
                              onChangeCoords={(coords) => {
                                setConfirmedPin(coords);
                                setPinAdjustedManually(false);
                              }}
                              onConfirm={(coords) => {
                                setConfirmedPin(coords);
                                setPinAdjustedManually(true);
                              }}
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-4 rounded-xl bg-tenant-background border border-tenant-border/60 text-xs text-tenant-muted space-y-1">
                    <span className="font-bold text-tenant-text block">
                      Local de Retirada:
                    </span>
                    <p>
                      Feira de Santana, BA — As instruções e o endereço exato para retirada serão fornecidos na confirmação do pedido.
                    </p>
                  </div>
                )}
              </Card>

              {/* 3. QUANDO DESEJA RECEBER? */}
              <Card className="p-6 bg-tenant-surface border-tenant-border space-y-5">
                <div className="flex items-center gap-2 text-tenant-primary border-b border-tenant-border/50 pb-3">
                  <span className="w-6 h-6 rounded-full bg-tenant-primary/10 text-tenant-primary text-xs font-bold flex items-center justify-center">
                    3
                  </span>
                  <h2 className="font-heading font-bold text-base text-tenant-text uppercase tracking-wide">
                    Quando Deseja Receber?
                  </h2>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {effectiveSettings.asapEnabled && (
                    <button
                      type="button"
                      disabled={!isStoreOpenNow}
                      onClick={() => setScheduleType('asap')}
                      className={`p-4 rounded-xl border text-left flex flex-col justify-between gap-1 transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                        scheduleType === 'asap'
                          ? 'border-tenant-primary bg-tenant-primary/5 ring-1 ring-tenant-primary'
                          : 'border-tenant-border bg-tenant-background hover:border-tenant-border/80'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <Clock className={`w-5 h-5 ${scheduleType === 'asap' ? 'text-tenant-primary' : 'text-tenant-muted'}`} />
                        {scheduleType === 'asap' && <CheckCircle2 className="w-4 h-4 text-tenant-primary" />}
                      </div>
                      <div>
                        <span className="font-heading font-bold text-sm text-tenant-text block">
                          Primeira Disponibilidade
                        </span>
                        <span className="text-[11px] text-tenant-muted block mt-0.5">
                          {isStoreOpenNow ? 'Próxima rota programada' : 'Indisponível fora do horário'}
                        </span>
                      </div>
                    </button>
                  )}

                  {effectiveSettings.scheduledEnabled && (
                    <button
                      type="button"
                      onClick={() => setScheduleType('scheduled')}
                      className={`p-4 rounded-xl border text-left flex flex-col justify-between gap-1 transition-all ${
                        scheduleType === 'scheduled'
                          ? 'border-tenant-primary bg-tenant-primary/5 ring-1 ring-tenant-primary'
                          : 'border-tenant-border bg-tenant-background hover:border-tenant-border/80'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <Calendar className={`w-5 h-5 ${scheduleType === 'scheduled' ? 'text-tenant-primary' : 'text-tenant-muted'}`} />
                        {scheduleType === 'scheduled' && <CheckCircle2 className="w-4 h-4 text-tenant-primary" />}
                      </div>
                      <div>
                        <span className="font-heading font-bold text-sm text-tenant-text block">
                          Agendar Horário
                        </span>
                        <span className="text-[11px] text-tenant-muted block mt-0.5">
                          Escolha dia e janela
                        </span>
                      </div>
                    </button>
                  )}
                </div>

                {scheduleType === 'scheduled' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-tenant-border/40">
                    <div>
                      <label className="block text-xs font-medium text-tenant-muted mb-1">
                        Dia da Entrega/Retirada *
                      </label>
                      <input
                        type="date"
                        required
                        min={new Date().toISOString().split('T')[0]}
                        value={scheduledDate}
                        onChange={(e) => setScheduledDate(e.target.value)}
                        className="w-full px-3 py-2 rounded-tenant bg-tenant-background border border-tenant-border text-sm text-tenant-text focus:outline-hidden focus:ring-2 focus:ring-tenant-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-tenant-muted mb-1">
                        Janela Horária *
                      </label>
                      {(() => {
                        const summary = storeConfig?.businessHoursSummary;
                        const configured = summary?.scheduleWindows || DEFAULT_SCHEDULE_WINDOWS;
                        const structured = parseStructuredBusinessHours({
                          timezone: summary?.timezone,
                          weekly_hours: summary?.weeklyHours,
                          schedule_windows: configured,
                        });
                        const windows = scheduledDate
                          ? getAvailableScheduleWindowsForDate(structured, scheduledDate, fulfillmentType)
                          : configured.filter((w) => !w.fulfillmentTypes || w.fulfillmentTypes.includes(fulfillmentType));

                        if (scheduledDate && windows.length === 0) {
                          return (
                            <div className="px-3 py-2 rounded-tenant bg-red-50 border border-red-200 text-xs text-red-700 font-medium">
                              Sem janelas disponíveis para este dia. Escolha outra data.
                            </div>
                          );
                        }

                        return (
                          <select
                            value={windows.some((w) => w.value === scheduledWindow) ? scheduledWindow : (windows[0]?.value || '')}
                            onChange={(e) => setScheduledWindow(e.target.value)}
                            className="w-full px-3 py-2 rounded-tenant bg-tenant-background border border-tenant-border text-sm text-tenant-text focus:outline-hidden focus:ring-2 focus:ring-tenant-primary"
                          >
                            {windows.map((w) => (
                              <option key={w.value} value={w.value}>
                                {w.label}
                              </option>
                            ))}
                          </select>
                        );
                      })()}
                    </div>
                  </div>
                )}
              </Card>

              {/* 4. FORMA DE PAGAMENTO */}
              <Card className="p-6 bg-tenant-surface border-tenant-border space-y-5">
                <div className="flex items-center gap-2 text-tenant-primary border-b border-tenant-border/50 pb-3">
                  <span className="w-6 h-6 rounded-full bg-tenant-primary/10 text-tenant-primary text-xs font-bold flex items-center justify-center">
                    4
                  </span>
                  <h2 className="font-heading font-bold text-base text-tenant-text uppercase tracking-wide">
                    Forma de Pagamento
                  </h2>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {enabledPaymentMethods.includes('pix') && (
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('pix')}
                      className={`p-4 rounded-xl border text-left flex flex-col justify-between gap-2 transition-all ${
                        paymentMethod === 'pix'
                          ? 'border-tenant-primary bg-tenant-primary/5 ring-1 ring-tenant-primary'
                          : 'border-tenant-border bg-tenant-background hover:border-tenant-border/80'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <QrCode className={`w-5 h-5 ${paymentMethod === 'pix' ? 'text-tenant-primary' : 'text-tenant-muted'}`} />
                        {paymentMethod === 'pix' && <CheckCircle2 className="w-4 h-4 text-tenant-primary" />}
                      </div>
                      <div>
                        <span className="font-heading font-bold text-sm text-tenant-text block">
                          Pix Online
                        </span>
                        <span className="text-[11px] text-tenant-muted block mt-0.5">
                          QR Code na próxima etapa
                        </span>
                      </div>
                    </button>
                  )}

                  {enabledPaymentMethods.includes('card_online') && (
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('card_online')}
                      className={`p-4 rounded-xl border text-left flex flex-col justify-between gap-2 transition-all ${
                        paymentMethod === 'card_online'
                          ? 'border-tenant-primary bg-tenant-primary/5 ring-1 ring-tenant-primary'
                          : 'border-tenant-border bg-tenant-background hover:border-tenant-border/80'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <CreditCard className={`w-5 h-5 ${paymentMethod === 'card_online' ? 'text-tenant-primary' : 'text-tenant-muted'}`} />
                        {paymentMethod === 'card_online' && <CheckCircle2 className="w-4 h-4 text-tenant-primary" />}
                      </div>
                      <div>
                        <span className="font-heading font-bold text-sm text-tenant-text block">
                          Cartão Online
                        </span>
                        <span className="text-[11px] text-tenant-muted block mt-0.5">
                          Checkout seguro Asaas
                        </span>
                      </div>
                    </button>
                  )}

                  {enabledPaymentMethods.includes('cash') && fulfillmentType === 'pickup' && (
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('cash')}
                      className={`p-4 rounded-xl border text-left flex flex-col justify-between gap-2 transition-all ${
                        paymentMethod === 'cash'
                          ? 'border-tenant-primary bg-tenant-primary/5 ring-1 ring-tenant-primary'
                          : 'border-tenant-border bg-tenant-background hover:border-tenant-border/80'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <Banknote className={`w-5 h-5 ${paymentMethod === 'cash' ? 'text-tenant-primary' : 'text-tenant-muted'}`} />
                        {paymentMethod === 'cash' && <CheckCircle2 className="w-4 h-4 text-tenant-primary" />}
                      </div>
                      <div>
                        <span className="font-heading font-bold text-sm text-tenant-text block">
                          Dinheiro
                        </span>
                        <span className="text-[11px] text-tenant-muted block mt-0.5">
                          Na retirada
                        </span>
                      </div>
                    </button>
                  )}

                  {enabledPaymentMethods.includes('card_on_delivery') && (
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('card_on_delivery')}
                      className={`p-4 rounded-xl border text-left flex flex-col justify-between gap-2 transition-all ${
                        paymentMethod === 'card_on_delivery'
                          ? 'border-tenant-primary bg-tenant-primary/5 ring-1 ring-tenant-primary'
                          : 'border-tenant-border bg-tenant-background hover:border-tenant-border/80'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <CreditCard className={`w-5 h-5 ${paymentMethod === 'card_on_delivery' ? 'text-tenant-primary' : 'text-tenant-muted'}`} />
                        {paymentMethod === 'card_on_delivery' && <CheckCircle2 className="w-4 h-4 text-tenant-primary" />}
                      </div>
                      <div>
                        <span className="font-heading font-bold text-sm text-tenant-text block">
                          Cartão (Maquininha)
                        </span>
                        <span className="text-[11px] text-tenant-muted block mt-0.5">
                          Crédito ou Débito no local
                        </span>
                      </div>
                    </button>
                  )}
                </div>

                {paymentMethod === 'cash' && (
                  <div className="pt-2 border-t border-tenant-border/40">
                    <label className="block text-xs font-medium text-tenant-muted mb-1">
                      Precisa de troco? Para quanto? (opcional)
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={cashChangeForReais}
                      onChange={(e) => setCashChangeForReais(e.target.value)}
                      placeholder="Ex: 100,00 (deixe em branco se não precisar)"
                      className="w-full sm:max-w-xs px-3 py-2 rounded-tenant bg-tenant-background border border-tenant-border text-sm text-tenant-text focus:outline-hidden focus:ring-2 focus:ring-tenant-primary"
                    />
                  </div>
                )}
              </Card>

              {/* 5. OBSERVAÇÕES */}
              <Card className="p-6 bg-tenant-surface border-tenant-border space-y-3">
                <label className="block text-xs font-bold uppercase tracking-wider text-tenant-text">
                  Observações para a Cozinha ou Entrega (opcional)
                </label>
                <textarea
                  rows={2}
                  maxLength={500}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ex: Tocar interfone 42, deixar na portaria com o zelador..."
                  className="w-full px-3 py-2 rounded-tenant bg-tenant-background border border-tenant-border text-sm text-tenant-text placeholder:text-tenant-muted/60 focus:outline-hidden focus:ring-2 focus:ring-tenant-primary resize-none"
                />
              </Card>
            </form>
          </div>

          {/* Coluna Lateral: Resumo da Sacola e Totais */}
          <div className="lg:col-span-5 space-y-6">
            <Card className="p-6 bg-tenant-surface border-tenant-border shadow-sm space-y-6 sticky top-24">
              <div className="flex items-center justify-between border-b border-tenant-border/50 pb-3">
                <h3 className="font-heading font-bold text-base text-tenant-text">
                  Resumo do Pedido
                </h3>
                <span className="text-xs text-tenant-muted">
                  {items.length} {items.length === 1 ? 'item' : 'itens'}
                </span>
              </div>

              {/* Avisos de Preço Atualizado ou Indisponibilidade */}
              {validationData?.hasPriceChanges && (
                <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-300 text-xs flex gap-2.5 items-start">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
                  <div className="space-y-1">
                    <span className="font-bold block">Aviso de Atualização:</span>
                    <p className="leading-relaxed">
                      O preço de um ou mais itens foi atualizado pelo cardápio. Os valores exibidos abaixo já refletem a tabela oficial vigente.
                    </p>
                  </div>
                </div>
              )}

              {/* Lista de Itens com Controles */}
              <div className="divide-y divide-tenant-border/40 max-h-[360px] overflow-y-auto space-y-3 pr-1">
                {(validationData?.validatedItems || items).map((item, idx) => {
                  const cartLine = items[idx];
                  const lineKey =
                    ('itemKey' in item && typeof item.itemKey === 'string' && item.itemKey) ||
                    cartLine?.itemKey ||
                    item.variantId;
                  const modifiers =
                    ('selectedModifiers' in item && Array.isArray(item.selectedModifiers)
                      ? item.selectedModifiers
                      : cartLine?.selectedModifiers) || [];

                  return (
                  <div key={lineKey} className="pt-3 first:pt-0 flex gap-3">
                    <div className="w-14 h-14 rounded-lg bg-tenant-background border border-tenant-border relative overflow-hidden shrink-0 flex items-center justify-center">
                      {item.coverImageUrl ? (
                        <Image
                          src={item.coverImageUrl}
                          alt={item.productName}
                          fill
                          className="object-cover"
                          sizes="56px"
                        />
                      ) : (
                        <span className="font-heading font-bold text-tenant-primary text-sm">
                          {item.productName.charAt(0)}
                        </span>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-1">
                        <h4 className="font-heading font-bold text-sm text-tenant-text truncate">
                          {item.productName}
                        </h4>
                        <button
                          type="button"
                          onClick={() => removeItem(lineKey)}
                          className="text-stone-400 hover:text-red-600 p-0.5 transition-colors"
                          title="Remover prato"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <Badge variant="neutral" className="text-[10px] py-0 px-1.5">
                          {item.variantName}
                        </Badge>
                        <span className="text-xs text-tenant-muted">
                          {formatBrl(item.unitPriceInCents)} un.
                        </span>
                      </div>
                      {modifiers.length > 0 && (
                        <span className="text-[10px] text-emerald-700 block mt-0.5">
                          + {modifiers.map((m) => m.optionName).join(', ')}
                        </span>
                      )}

                      <div className="flex items-center justify-between pt-2 mt-1">
                        <div className="flex items-center gap-1.5 bg-tenant-background border border-tenant-border rounded-lg px-2 py-0.5">
                          <button
                            type="button"
                            onClick={() => updateQuantity(lineKey, item.quantity - 1)}
                            className="text-tenant-text hover:text-tenant-primary transition-colors p-0.5"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="text-xs font-bold text-tenant-text w-4 text-center">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => updateQuantity(lineKey, item.quantity + 1)}
                            className="text-tenant-text hover:text-tenant-primary transition-colors p-0.5"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>

                        <span className="font-heading font-bold text-sm text-tenant-text">
                          {formatBrl(item.unitPriceInCents * item.quantity)}
                        </span>
                      </div>
                    </div>
                  </div>
                  );
                })}
              </div>

              {/* Cupom de Desconto */}
              <div className="pt-3 border-t border-tenant-border/50 space-y-2">
                <label htmlFor="checkout-coupon-input" className="block text-xs font-bold text-tenant-text">
                  Cupom de Desconto
                </label>
                {appliedCoupon ? (
                  <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-xs">
                    <div className="min-w-0">
                      <span className="font-extrabold text-emerald-800 block">
                        {appliedCoupon.code} aplicado (-{formatBrl(discountCents)})
                      </span>
                      <span className="text-[11px] text-emerald-700 truncate block">
                        {appliedCoupon.name}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setAppliedCoupon(null);
                        setCouponInput('');
                        setCouponError(null);
                      }}
                      className="text-xs font-bold text-red-600 hover:underline shrink-0"
                    >
                      Remover
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <input
                      id="checkout-coupon-input"
                      type="text"
                      value={couponInput}
                      onChange={(e) => {
                        setCouponInput(e.target.value.toUpperCase());
                        if (couponError) setCouponError(null);
                      }}
                      placeholder="Ex: BENZA10"
                      className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-tenant-border bg-tenant-background text-xs font-mono uppercase text-tenant-text focus:outline-none focus:ring-2 focus:ring-tenant-primary"
                    />
                    <button
                      type="button"
                      disabled={isApplyingCoupon || !couponInput.trim() || subtotalCents <= 0}
                      onClick={handleApplyCoupon}
                      className="px-3.5 py-2 rounded-lg bg-tenant-surface border border-tenant-border hover:border-tenant-primary text-xs font-bold text-tenant-text disabled:opacity-50 shrink-0"
                    >
                      {isApplyingCoupon ? 'Validando...' : 'Aplicar'}
                    </button>
                  </div>
                )}
                {couponError && (
                  <p className="text-[11px] text-red-600 font-medium">{couponError}</p>
                )}
              </div>

              {/* Subtotal, Frete e Total */}
              <div className="pt-4 border-t border-tenant-border/50 space-y-2 text-sm">
                <div className="flex items-center justify-between text-tenant-muted text-xs">
                  <span>Subtotal dos pratos</span>
                  <span className="font-semibold text-tenant-text">
                    {formatBrl(subtotalCents)}
                  </span>
                </div>

                {discountCents > 0 && (
                  <div className="flex items-center justify-between text-emerald-700 text-xs font-semibold">
                    <span>Desconto ({appliedCoupon?.code})</span>
                    <span>- {formatBrl(discountCents)}</span>
                  </div>
                )}

                <div className="flex items-center justify-between text-tenant-muted text-xs">
                  <span>
                    Taxa de {fulfillmentType === 'delivery' ? 'entrega' : 'retirada'}
                    {isDistanceDelivery &&
                    deliveryQuote?.quote?.eligible &&
                    deliveryQuote.quote.distanceKm !== undefined
                      ? ` (${deliveryQuote.quote.distanceKm.toFixed(1)} km)`
                      : ''}
                  </span>
                  <span
                    className={
                      isDistanceDelivery && (!hasCompleteAddress || isQuotingDelivery)
                        ? 'text-tenant-muted font-semibold'
                        : deliveryFeeCents === 0
                        ? 'text-emerald-600 font-semibold'
                        : 'text-tenant-text font-semibold'
                    }
                  >
                    {isDistanceDelivery
                      ? !hasCompleteAddress
                        ? 'A calcular'
                        : isQuotingDelivery
                        ? 'Calculando...'
                        : deliveryQuote?.quote?.eligible
                        ? deliveryFeeCents > 0
                          ? formatBrl(deliveryFeeCents)
                          : 'Grátis'
                        : 'Indisponível'
                      : deliveryFeeCents > 0
                      ? formatBrl(deliveryFeeCents)
                      : 'Grátis'}
                  </span>
                </div>

                {fulfillmentType === 'delivery' &&
                  effectiveSettings.freeDeliveryThresholdCents &&
                  effectiveSettings.freeDeliveryThresholdCents > 0 &&
                  subtotalCents < effectiveSettings.freeDeliveryThresholdCents && (
                    <div className="text-[11px] text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-2.5 py-1.5">
                      Faltam{' '}
                      <span className="font-bold">
                        {formatBrl(effectiveSettings.freeDeliveryThresholdCents - subtotalCents)}
                      </span>{' '}
                      para entrega grátis!
                    </div>
                  )}

                {isBelowMinOrder && (
                  <div className="text-[11px] text-amber-700 dark:text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg px-2.5 py-1.5">
                    Pedido mínimo: <span className="font-bold">{formatBrl(effectiveSettings.minOrderValueCents)}</span>. Faltam{' '}
                    <span className="font-bold">{formatBrl(effectiveSettings.minOrderValueCents - subtotalCents)}</span>.
                  </div>
                )}

                <div className="pt-2 border-t border-tenant-border/40 flex items-center justify-between">
                  <span className="font-heading font-bold text-base text-tenant-text">
                    Total
                  </span>
                  <span className="font-heading font-extrabold text-2xl text-tenant-primary">
                    {formatBrl(totalCents)}
                  </span>
                </div>
              </div>

              {/* Avisos de Indisponibilidade de Itens */}
              {validationData?.hasUnavailableItems && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-700 dark:text-red-300 text-xs flex gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    {validationData.issues.find((i) => i.type !== 'price_changed')?.message ||
                      'Um ou mais itens estão indisponíveis ou sem estoque suficiente.'}
                  </span>
                </div>
              )}

              {/* Erros de Configuração, Validação ou Submissão */}
              {configError && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-700 dark:text-red-300 text-xs flex items-center justify-between gap-2">
                  <span>{configError}</span>
                  <button
                    type="button"
                    onClick={() => void loadStoreConfig()}
                    className="font-bold underline shrink-0"
                  >
                    Tentar novamente
                  </button>
                </div>
              )}

              {(validationError || submitError) && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-700 dark:text-red-300 text-xs flex gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{submitError || validationError}</span>
                </div>
              )}

              {/* Botão Principal de Confirmação */}
              <Button
                type="submit"
                form="checkout-form"
                disabled={
                  isSubmitting ||
                  isValidating ||
                  isLoadingConfig ||
                  !storeConfig ||
                  Boolean(configError) ||
                  Boolean(validationError) ||
                  !validationData ||
                  items.length === 0 ||
                  isBlockedByStoreAvailability ||
                  isBelowMinOrder ||
                  Boolean(validationData?.hasUnavailableItems) ||
                  (isDistanceDelivery &&
                    (isQuotingDelivery ||
                      !deliveryQuote ||
                      !deliveryQuote.quote?.eligible ||
                      !deliveryQuote.quoteId ||
                      Boolean(quoteError) ||
                      (deliveryQuote.ambiguousAddress && !pinAdjustedManually)))
                }
                className="w-full py-4 text-sm uppercase tracking-wider font-bold gap-2 rounded-xl shadow-md bg-tenant-primary text-white hover:brightness-110 active:scale-[0.99] transition-all disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Processando Pedido...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    <span>Confirmar Pedido ({formatBrl(totalCents)})</span>
                  </>
                )}
              </Button>

              <p className="text-[11px] text-tenant-muted text-center leading-relaxed">
                {paymentMethod === 'pix'
                  ? 'QR Code Pix disponibilizado imediatamente na próxima etapa.'
                  : paymentMethod === 'cash'
                    ? 'Pagamento em dinheiro diretamente no ato da entrega ou retirada.'
                    : 'Pagamento na maquininha de cartão no ato da entrega ou retirada.'}
              </p>
            </Card>
          </div>
        </div>
      </Container>
    </div>
  );
}

