'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  Zap,
  MessageCircle,
  Phone,
  Store,
  Search,
  Plus,
  Minus,
  Trash2,
  User,
  MapPin,
  Truck,
  Utensils,
  QrCode,
  Banknote,
  CreditCard,
  Flame,
  Clock,
  Calendar,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ShoppingBag,
} from 'lucide-react';
import { formatBrl } from '@/modules/cart/cart.utils';
import {
  parseBrlInputToCents,
  clampCartItemQuantity,
  validateQuickOrderDiscount,
  buildPosCartItemKey,
} from '@/modules/orders/quick-order-pos.utils';
import { OrderPrintModal, type PrintTicketMode } from '@/components/admin/orders/OrderPrintModal';
import { QuickOrderCatalog } from '@/components/admin/quick-order/QuickOrderCatalog';
import { QuickOrderModifierModal } from '@/components/admin/quick-order/QuickOrderModifierModal';
import { QuickOrderReviewModal } from '@/components/admin/quick-order/QuickOrderReviewModal';
import { QuickOrderSuccessPanel } from '@/components/admin/quick-order/QuickOrderSuccessPanel';
import type {
  CatalogCategory,
  CatalogProduct,
  CatalogVariant,
  CreatedOrderWithPix,
  PosCartItem,
} from '@/components/admin/quick-order/types';
import type {
  FulfillmentType,
  OrderChannel,
  OrderPaymentMethod,
  TenantCommerceSettings,
  TenantRole,
} from '@/types/database.types';
import type {
  OperationalOrder,
  TenantCustomerHistoryItem,
} from '@/modules/orders/orders.service';

const QUICK_KITCHEN_NOTES = [
  'Sem cebola',
  'Sem alho',
  'Embalar para viagem',
  'Enviar talher descartável',
  'Caprichar no molho',
  'Cliente aguardando no balcão',
];

function generateIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `qo_${crypto.randomUUID()}`;
  }
  return `qo_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export default function QuickOrderPosPage() {
  const [tenantName, setTenantName] = useState('BENZA');
  const [operatorRole, setOperatorRole] = useState<TenantRole>('tenant_admin');
  const [categories, setCategories] = useState<CatalogCategory[]>([]);
  const [catalog, setCatalog] = useState<CatalogProduct[]>([]);
  const [commerceSettings, setCommerceSettings] = useState<TenantCommerceSettings | null>(null);
  const [dineInEnabled, setDineInEnabled] = useState(false);
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  // Abas no Mobile (Catálogo vs Sacola/Finalização)
  const [mobileTab, setMobileTab] = useState<'catalog' | 'checkout'>('catalog');
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);

  // Estado do Pedido Rápido
  const [orderChannel, setOrderChannel] = useState<OrderChannel>('whatsapp');
  const [fulfillmentType, setFulfillmentType] = useState<FulfillmentType>('pickup');
  const [scheduleType, setScheduleType] = useState<'asap' | 'scheduled'>('asap');
  const [scheduledForInput, setScheduledForInput] = useState('');

  // Cliente e Auto-preenchimento
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerSuggestions, setCustomerSuggestions] = useState<TenantCustomerHistoryItem[]>([]);
  const [isSearchingCustomer, setIsSearchingCustomer] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');

  // Endereço de entrega (Feira de Santana - BA como padrão operacional)
  const [zipCode, setZipCode] = useState('');
  const [isLoadingCep, setIsLoadingCep] = useState(false);
  const [street, setStreet] = useState('');
  const [number, setNumber] = useState('');
  const [complement, setComplement] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [city, setCity] = useState('Feira de Santana');
  const [stateUf, setStateUf] = useState('BA');
  const [reference, setReference] = useState('');

  // Catálogo, Sacola e Modal de Complementos
  const [productSearch, setProductSearch] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [cart, setCart] = useState<PosCartItem[]>([]);
  const [kitchenNotes, setKitchenNotes] = useState('');
  const [pendingModifierSelection, setPendingModifierSelection] = useState<{
    product: CatalogProduct;
    variant: CatalogVariant;
  } | null>(null);

  // Financeiro e Confirmação
  const [paymentMethod, setPaymentMethod] = useState<OrderPaymentMethod>('pix');
  const [markAsPaidNow, setMarkAsPaidNow] = useState(false);
  const [cashChangeReais, setCashChangeReais] = useState('');
  const [discountReais, setDiscountReais] = useState('');
  const [orderNumberOverride, setOrderNumberOverride] = useState('');
  const [deliveryFeeReais, setDeliveryFeeReais] = useState('');
  const [deliveryFeeManuallyEdited, setDeliveryFeeManuallyEdited] = useState(false);
  const [confirmImmediately, setConfirmImmediately] = useState(true);
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() => generateIdempotencyKey());

  // Conferência, Submissão e Resultado Pós-Pedido
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createdOrder, setCreatedOrder] = useState<CreatedOrderWithPix | null>(null);
  const [copiedWhatsApp, setCopiedWhatsApp] = useState(false);
  const [copiedPix, setCopiedPix] = useState(false);
  const [printModalOrder, setPrintModalOrder] = useState<OperationalOrder | null>(null);
  const [printDefaultMode, setPrintDefaultMode] = useState<PrintTicketMode>('full');

  const customerSearchAbortRef = useRef<AbortController | null>(null);

  const loadPosData = useCallback(async () => {
    await Promise.resolve();
    setIsLoadingCatalog(true);
    setCatalogError(null);
    try {
      const res = await fetch('/api/admin/orders/quick', { cache: 'no-store' });
      if (!res.ok) {
        const errPayload = await res.json().catch(() => ({}));
        throw new Error(errPayload.error || 'Não foi possível carregar o catálogo do PDV.');
      }
      const data = await res.json();
      if (data.tenant?.name) setTenantName(data.tenant.name);
      if (data.operator?.role) setOperatorRole(data.operator.role);
      setCategories(data.categories || []);
      setCatalog(data.catalog || []);
      setCommerceSettings(data.commerceSettings || null);
      setDineInEnabled(Boolean(data.dineInEnabled));
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message || 'Erro de conexão ao carregar catálogo.';
      setCatalogError(msg);
    } finally {
      setIsLoadingCatalog(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadPosData();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadPosData]);

  // Busca de clientes recorrentes com AbortController contra condições de corrida
  useEffect(() => {
    const q = customerSearch.trim();
    if (q.length < 3) {
      if (customerSearchAbortRef.current) {
        customerSearchAbortRef.current.abort();
      }
      return;
    }

    const timer = setTimeout(async () => {
      if (customerSearchAbortRef.current) {
        customerSearchAbortRef.current.abort();
      }
      const controller = new AbortController();
      customerSearchAbortRef.current = controller;

      setIsSearchingCustomer(true);
      try {
        const res = await fetch(`/api/admin/orders/quick?q=${encodeURIComponent(q)}`, {
          signal: controller.signal,
        });
        if (res.ok) {
          const data = await res.json();
          setCustomerSuggestions(data.customers || []);
        }
      } catch (err: unknown) {
        if ((err as { name?: string })?.name === 'AbortError') return;
      } finally {
        if (customerSearchAbortRef.current === controller) {
          setIsSearchingCustomer(false);
        }
      }
    }, 260);

    return () => {
      clearTimeout(timer);
    };
  }, [customerSearch]);

  const handleSelectChannel = (ch: OrderChannel) => {
    setOrderChannel(ch);
    if (ch === 'counter') {
      if (fulfillmentType === 'delivery') {
        setFulfillmentType('pickup');
      }
      if (!customerName.trim()) {
        setCustomerName('Cliente Balcão');
      }
    } else if (ch === 'whatsapp' || ch === 'phone') {
      if (customerName === 'Cliente Balcão') {
        setCustomerName('');
      }
    }
  };

  const handleSelectRecurringCustomer = (c: TenantCustomerHistoryItem) => {
    setCustomerName(c.customerName);
    setCustomerPhone(c.customerPhone);
    setCustomerEmail(c.customerEmail || '');
    if (c.lastAddress) {
      setZipCode(c.lastAddress.zipCode || '');
      setStreet(c.lastAddress.street || '');
      setNumber(c.lastAddress.number || '');
      setComplement(c.lastAddress.complement || '');
      setNeighborhood(c.lastAddress.neighborhood || '');
      setCity(c.lastAddress.city || 'Feira de Santana');
      setStateUf(c.lastAddress.state || 'BA');
      setReference(c.lastAddress.reference || '');
    }
    setCustomerSearch('');
    setCustomerSuggestions([]);
  };

  const lastPosCepRef = useRef('');
  const lookupPosCep = useCallback(async (cleanCep: string) => {
    if (cleanCep.length !== 8 || lastPosCepRef.current === cleanCep) return;
    lastPosCepRef.current = cleanCep;
    setIsLoadingCep(true);
    try {
      const res = await fetch(`/api/cep/${cleanCep}`);
      const data = await res.json();
      if (res.ok && (data.street || data.city)) {
        setStreet(data.street || '');
        setNeighborhood(data.neighborhood || '');
        if (data.city) setCity(data.city);
        if (data.state) setStateUf(String(data.state).toUpperCase());
        return;
      }
      lastPosCepRef.current = '';
    } catch {
      lastPosCepRef.current = '';
    } finally {
      setIsLoadingCep(false);
    }
  }, []);

  const appendCartItem = (
    product: CatalogProduct,
    variant: CatalogVariant,
    modifierPayload?: {
      selectedModifierOptionIds: string[];
      extraPriceCents: number;
      modifierSummary: string;
    }
  ) => {
    if (variant.is_available === false) return;

    const selectedModifierOptionIds = modifierPayload?.selectedModifierOptionIds || [];
    const extraPriceCents = modifierPayload?.extraPriceCents || 0;
    const modifierSummary = modifierPayload?.modifierSummary || '';
    const cartItemKey = buildPosCartItemKey(variant.id, selectedModifierOptionIds);
    const unitPriceInCents = variant.price_in_cents + extraPriceCents;

    setCart((prev) => {
      const idx = prev.findIndex((i) => i.cartItemKey === cartItemKey);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = {
          ...updated[idx],
          quantity: clampCartItemQuantity(updated[idx].quantity + 1),
        };
        return updated;
      }
      return [
        ...prev,
        {
          cartItemKey,
          productId: product.id,
          productName: product.name,
          variantId: variant.id,
          variantName: variant.name,
          baseUnitPriceInCents: variant.price_in_cents,
          extraPriceCents,
          unitPriceInCents,
          quantity: 1,
          selectedModifierOptionIds,
          modifierSummary,
          stationNames: product.stationNames || [],
        },
      ];
    });
  };

  const handleSelectVariantFromCatalog = (product: CatalogProduct, variant: CatalogVariant) => {
    if (variant.is_available === false) return;
    if ((product.modifierGroups?.length || 0) > 0) {
      setPendingModifierSelection({ product, variant });
      return;
    }
    appendCartItem(product, variant);
  };

  const handleUpdateQuantity = (cartItemKey: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.cartItemKey !== cartItemKey) return item;
          const nextQty = item.quantity + delta;
          if (nextQty <= 0) return { ...item, quantity: 0 };
          return { ...item, quantity: clampCartItemQuantity(nextQty) };
        })
        .filter((item) => item.quantity > 0)
    );
  };

  const handleRemoveItem = (cartItemKey: string) => {
    setCart((prev) => prev.filter((item) => item.cartItemKey !== cartItemKey));
  };

  // Cálculos determinísticos em centavos inteiros
  const subtotalCents = useMemo(
    () => cart.reduce((acc, item) => acc + item.unitPriceInCents * item.quantity, 0),
    [cart]
  );

  const defaultDeliveryFeeCents = useMemo(() => {
    if (fulfillmentType !== 'delivery') return 0;
    if (!commerceSettings) return 1200;
    if (
      commerceSettings.free_delivery_threshold_cents &&
      subtotalCents >= commerceSettings.free_delivery_threshold_cents
    ) {
      return 0;
    }
    return commerceSettings.fixed_delivery_fee_cents || 0;
  }, [fulfillmentType, commerceSettings, subtotalCents]);

  const parsedDeliveryFee = useMemo(
    () => parseBrlInputToCents(deliveryFeeReais),
    [deliveryFeeReais]
  );

  const deliveryFeeCents = useMemo(() => {
    if (fulfillmentType !== 'delivery') return 0;
    if (!deliveryFeeManuallyEdited) return defaultDeliveryFeeCents;
    return parsedDeliveryFee.valid ? parsedDeliveryFee.cents : defaultDeliveryFeeCents;
  }, [fulfillmentType, deliveryFeeManuallyEdited, parsedDeliveryFee, defaultDeliveryFeeCents]);

  const parsedDiscount = useMemo(() => parseBrlInputToCents(discountReais), [discountReais]);
  const discountCents = parsedDiscount.valid ? parsedDiscount.cents : 0;

  const discountValidation = useMemo(
    () => validateQuickOrderDiscount(subtotalCents, deliveryFeeCents, discountCents, operatorRole),
    [subtotalCents, deliveryFeeCents, discountCents, operatorRole]
  );

  const totalCents = useMemo(
    () => Math.max(0, subtotalCents + deliveryFeeCents - discountCents),
    [subtotalCents, deliveryFeeCents, discountCents]
  );

  const parsedCashChange = useMemo(() => parseBrlInputToCents(cashChangeReais), [cashChangeReais]);
  const cashChangeForCents = useMemo(() => {
    if (paymentMethod !== 'cash' || !cashChangeReais.trim()) return null;
    return parsedCashChange.valid && parsedCashChange.cents > 0 ? parsedCashChange.cents : null;
  }, [paymentMethod, cashChangeReais, parsedCashChange]);

  const cashChangeReturnCents = useMemo(() => {
    if (!cashChangeForCents || cashChangeForCents < totalCents) return null;
    return cashChangeForCents - totalCents;
  }, [cashChangeForCents, totalCents]);

  const handleAppendQuickNote = (noteText: string) => {
    setKitchenNotes((prev) => {
      if (!prev.trim()) return noteText;
      if (prev.includes(noteText)) return prev;
      return `${prev.trim()} | ${noteText}`;
    });
  };

  // Reset completo e seguro entre pedidos (sem vazar endereço, agendamento ou cliente anterior)
  const handleResetNewOrder = () => {
    setCart([]);
    setKitchenNotes('');
    setDiscountReais('');
    setOrderNumberOverride('');
    setDeliveryFeeReais('');
    setDeliveryFeeManuallyEdited(false);
    setCashChangeReais('');
    setMarkAsPaidNow(false);
    setPaymentMethod('pix');
    setScheduleType('asap');
    setScheduledForInput('');
    setSubmitError(null);
    setCreatedOrder(null);
    setIsReviewOpen(false);
    setIdempotencyKey(generateIdempotencyKey());
    setCustomerSearch('');
    setCustomerSuggestions([]);
    setCustomerEmail('');
    setZipCode('');
    setStreet('');
    setNumber('');
    setComplement('');
    setNeighborhood('');
    setCity('Feira de Santana');
    setStateUf('BA');
    setReference('');

    if (orderChannel === 'counter') {
      setCustomerName('Cliente Balcão');
      setCustomerPhone('');
      setFulfillmentType('pickup');
    } else {
      setCustomerName('');
      setCustomerPhone('');
    }
  };

  const buildOperationalOrderForPrint = (ord: CreatedOrderWithPix): OperationalOrder => ({
    id: ord.orderId,
    tenantId: '',
    orderNumber: ord.orderNumber,
    publicTrackingToken: ord.publicTrackingToken,
    orderChannel: ord.orderChannel,
    customerName: ord.customerName,
    customerPhone: ord.customerPhone,
    fulfillmentType: ord.fulfillmentType,
    scheduleType: ord.scheduleType,
    scheduledFor: ord.scheduledFor,
    status: ord.status,
    paymentMethod: ord.paymentMethod,
    paymentStatus: ord.paymentStatus,
    cashChangeForCents: ord.cashChangeForCents,
    subtotalCents: ord.subtotalInCents,
    deliveryFeeCents: ord.deliveryFeeInCents,
    discountCents: ord.discountInCents,
    totalCents: ord.totalInCents,
    formattedTotal: ord.formattedTotal,
    notes: ord.notes,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    elapsedMinutes: 0,
    statusElapsedMinutes: 0,
    isDelayed: false,
    isUrgent: false,
    items: ord.items.map((it, idx) => ({
      id: `${it.variantId}-${idx}`,
      quantity: it.quantity,
      productName: it.productName,
      variantName: it.variantName,
      unitPriceCents: it.unitPriceInCents,
      subtotalCents: it.subtotalInCents,
    })),
    itemCount: ord.items.reduce((acc, i) => acc + i.quantity, 0),
    address: ord.address
      ? {
          street: ord.address.street,
          number: ord.address.number,
          complement: ord.address.complement,
          neighborhood: ord.address.neighborhood,
          city: ord.address.city,
          state: ord.address.state,
          reference: ord.address.reference,
        }
      : null,
    nextValidStatuses: [],
  });

  // Validação local preventiva antes de abrir a etapa de conferência
  const validateBeforeReview = (): string | null => {
    if (cart.length === 0) {
      return 'Adicione pelo menos 1 item à sacola antes de continuar.';
    }

    const effectiveName =
      customerName.trim() || (orderChannel === 'counter' ? 'Cliente Balcão' : '');
    if (effectiveName.length < 2) {
      return 'Informe o nome do cliente (mínimo 2 caracteres).';
    }

    const cleanPhone = customerPhone.replace(/\D/g, '');
    if (
      (orderChannel === 'whatsapp' ||
        orderChannel === 'phone' ||
        fulfillmentType === 'delivery') &&
      cleanPhone.length < 10
    ) {
      return 'Informe um telefone/WhatsApp válido com DDD para este canal ou entrega.';
    }

    if (fulfillmentType === 'delivery') {
      if (street.trim().length < 2) return 'Informe a Rua/Logradouro para entrega.';
      if (number.trim().length < 1) return 'Informe o número do endereço (ou S/N).';
      if (neighborhood.trim().length < 2) return 'Informe o bairro para entrega.';
      if (city.trim().length < 2) return 'Informe a cidade para entrega.';
      if (stateUf.trim().length !== 2) return 'Informe a UF com 2 letras (ex: BA).';
      if (zipCode.trim() && !/^[0-9]{5}-?[0-9]{3}$/.test(zipCode.trim())) {
        return 'O CEP informado é inválido. Use 8 dígitos (ex: 44000-000) ou deixe em branco.';
      }
      if (deliveryFeeManuallyEdited && !parsedDeliveryFee.valid) {
        return parsedDeliveryFee.error || 'Taxa de entrega em formato inválido.';
      }
    }

    if (scheduleType === 'scheduled') {
      if (!scheduledForInput) {
        return 'Selecione a data e o horário para o pedido agendado.';
      }
      const schedDate = new Date(scheduledForInput);
      if (Number.isNaN(schedDate.getTime()) || schedDate.getTime() < Date.now() - 60000) {
        return 'O horário de agendamento deve estar no futuro.';
      }
    }

    if (!parsedDiscount.valid) {
      return parsedDiscount.error || 'Valor de desconto em formato inválido.';
    }

    if (!discountValidation.valid) {
      return discountValidation.error || 'Desconto acima do limite permitido.';
    }

    if (paymentMethod === 'cash' && cashChangeReais.trim()) {
      if (!parsedCashChange.valid) {
        return parsedCashChange.error || 'Valor de troco em formato inválido.';
      }
      if (parsedCashChange.cents > 0 && parsedCashChange.cents < totalCents) {
        return `O valor para troco (${formatBrl(parsedCashChange.cents)}) deve ser maior ou igual ao total (${formatBrl(totalCents)}).`;
      }
    }

    return null;
  };

  const handleOpenReview = (e: React.FormEvent) => {
    e.preventDefault();
    const validationErr = validateBeforeReview();
    if (validationErr) {
      setSubmitError(validationErr);
      return;
    }
    setSubmitError(null);
    setIsReviewOpen(true);
  };

  const handleConfirmAndSubmitOrder = async () => {
    if (cart.length === 0 || isSubmitting) return;

    setSubmitError(null);
    setIsSubmitting(true);

    try {
      const payload: Record<string, unknown> = {
        orderChannel,
        items: cart.map((item) => ({
          productId: item.productId,
          variantId: item.variantId,
          quantity: item.quantity,
          selectedModifierOptionIds:
            item.selectedModifierOptionIds.length > 0
              ? item.selectedModifierOptionIds
              : undefined,
        })),
        customer: {
          name: customerName.trim() || (orderChannel === 'counter' ? 'Cliente Balcão' : ''),
          phone: customerPhone.trim(),
          email: customerEmail.trim() || undefined,
        },
        fulfillmentType,
        scheduleType,
        scheduledFor:
          scheduleType === 'scheduled' && scheduledForInput
            ? new Date(scheduledForInput).toISOString()
            : undefined,
        paymentMethod,
        markAsPaidNow:
          paymentMethod === 'cash' || paymentMethod === 'pos_card' || paymentMethod === 'credit_card'
            ? markAsPaidNow
            : false,
        cashChangeForCents: paymentMethod === 'cash' ? cashChangeForCents : null,
        discountCents,
        deliveryFeeCentsOverride:
          fulfillmentType === 'delivery' && deliveryFeeManuallyEdited ? deliveryFeeCents : null,
        orderNumberOverride: orderNumberOverride.trim() || undefined,
        confirmImmediately,
        notes: kitchenNotes.trim() || undefined,
        idempotencyKey,
        generatePixQr: paymentMethod === 'pix',
      };

      if (fulfillmentType === 'delivery') {
        payload.address = {
          zipCode: zipCode.trim(),
          street: street.trim(),
          number: number.trim(),
          complement: complement.trim() || undefined,
          neighborhood: neighborhood.trim(),
          city: city.trim() || 'Feira de Santana',
          state: (stateUf.trim() || 'BA').toUpperCase(),
          reference: reference.trim() || undefined,
        };
      }

      const res = await fetch('/api/admin/orders/quick', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Falha ao criar pedido rápido.');
      }

      setIsReviewOpen(false);
      setCreatedOrder(data);
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message || 'Erro ao registrar pedido.';
      setSubmitError(msg);
      setIsReviewOpen(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const totalItemsCount = useMemo(
    () => cart.reduce((acc, item) => acc + item.quantity, 0),
    [cart]
  );

  return (
    <div className="space-y-5 pb-20">
      {/* Cabeçalho do PDV / Pedido Rápido Multicanal */}
      <div className="bg-white rounded-2xl p-5 border border-stone-200 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 text-emerald-700 flex items-center justify-center shrink-0">
            <Zap className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-black font-heading tracking-tight text-stone-900">
                Pedido Rápido & Atendimento Multicanal
              </h1>
              <span className="text-[11px] font-bold uppercase px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                WhatsApp • Telefone • Balcão
              </span>
            </div>
            <p className="text-xs text-stone-500 mt-0.5">
              Todos os pedidos entram diretamente no motor oficial ({tenantName}) e nas estações do KDS
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href="/admin/operacao"
            className="min-h-[38px] inline-flex items-center px-3.5 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-bold transition-colors"
          >
            Fila Operacional
          </Link>
          <Link
            href="/admin/kds"
            className="min-h-[38px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition-colors"
          >
            <Flame className="w-4 h-4" />
            <span>Abrir KDS Cozinha</span>
          </Link>
        </div>
      </div>

      {/* Painel de Sucesso Pós-Pedido */}
      {createdOrder && (
        <QuickOrderSuccessPanel
          createdOrder={createdOrder}
          copiedWhatsApp={copiedWhatsApp}
          copiedPix={copiedPix}
          onCopyWhatsApp={() => {
            navigator.clipboard.writeText(createdOrder.whatsappSummaryText);
            setCopiedWhatsApp(true);
            setTimeout(() => setCopiedWhatsApp(false), 2500);
          }}
          onCopyPix={() => {
            if (!createdOrder.pixPayment) return;
            navigator.clipboard.writeText(createdOrder.pixPayment.pixQrCodeText);
            setCopiedPix(true);
            setTimeout(() => setCopiedPix(false), 2500);
          }}
          onOpenPrintModal={(mode) => {
            setPrintDefaultMode(mode);
            setPrintModalOrder(buildOperationalOrderForPrint(createdOrder));
          }}
          onStartNewOrder={handleResetNewOrder}
        />
      )}

      {/* Alternador Mobile: Catálogo vs Sacola */}
      <div className="flex xl:hidden bg-white rounded-xl p-1.5 border border-stone-200 shadow-2xs gap-1.5">
        <button
          type="button"
          onClick={() => setMobileTab('catalog')}
          className={`flex-1 min-h-[40px] py-2 px-3 rounded-lg text-xs font-black transition-colors ${
            mobileTab === 'catalog'
              ? 'bg-stone-900 text-white'
              : 'bg-stone-100 text-stone-700'
          }`}
        >
          1. Catálogo ({catalog.length})
        </button>
        <button
          type="button"
          onClick={() => setMobileTab('checkout')}
          className={`flex-1 min-h-[40px] py-2 px-3 rounded-lg text-xs font-black transition-colors ${
            mobileTab === 'checkout'
              ? 'bg-emerald-600 text-white'
              : 'bg-stone-100 text-stone-700'
          }`}
        >
          2. Sacola & Finalizar ({totalItemsCount} • {formatBrl(totalCents)})
        </button>
      </div>

      {/* Layout Principal do PDV: 2 Colunas no Desktop */}
      <form onSubmit={handleOpenReview} className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        {/* COLUNA ESQUERDA (7 cols): Canal + Cliente + Catálogo */}
        <div
          className={`xl:col-span-7 space-y-5 ${
            mobileTab === 'checkout' ? 'hidden xl:block' : 'block'
          }`}
        >
          {/* 1. Seleção de Canal e Modalidade */}
          <div className="bg-white rounded-2xl p-4 sm:p-5 border border-stone-200 shadow-xs space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <span className="block text-xs font-black uppercase tracking-wider text-stone-500 mb-2">
                  1. Canal de Entrada
                </span>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => handleSelectChannel('whatsapp')}
                    aria-pressed={orderChannel === 'whatsapp'}
                    className={`min-h-[42px] py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 border transition-all ${
                      orderChannel === 'whatsapp'
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                        : 'bg-stone-50 text-stone-700 border-stone-200 hover:bg-stone-100'
                    }`}
                  >
                    <MessageCircle className="w-4 h-4" />
                    <span>WhatsApp</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectChannel('phone')}
                    aria-pressed={orderChannel === 'phone'}
                    className={`min-h-[42px] py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 border transition-all ${
                      orderChannel === 'phone'
                        ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                        : 'bg-stone-50 text-stone-700 border-stone-200 hover:bg-stone-100'
                    }`}
                  >
                    <Phone className="w-4 h-4" />
                    <span>Telefone</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectChannel('counter')}
                    aria-pressed={orderChannel === 'counter'}
                    className={`min-h-[42px] py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 border transition-all ${
                      orderChannel === 'counter'
                        ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
                        : 'bg-stone-50 text-stone-700 border-stone-200 hover:bg-stone-100'
                    }`}
                  >
                    <Store className="w-4 h-4" />
                    <span>Balcão</span>
                  </button>
                </div>
              </div>

              <div>
                <span className="block text-xs font-black uppercase tracking-wider text-stone-500 mb-2">
                  2. Modalidade de Atendimento
                </span>
                <div className={`grid ${dineInEnabled ? 'grid-cols-3' : 'grid-cols-2'} gap-2`}>
                  <button
                    type="button"
                    onClick={() => setFulfillmentType('pickup')}
                    aria-pressed={fulfillmentType === 'pickup'}
                    className={`min-h-[42px] py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 border transition-all ${
                      fulfillmentType === 'pickup'
                        ? 'bg-stone-900 text-white border-stone-900 shadow-sm'
                        : 'bg-stone-50 text-stone-700 border-stone-200 hover:bg-stone-100'
                    }`}
                  >
                    <Store className="w-4 h-4" />
                    <span>Retirada</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFulfillmentType('delivery')}
                    aria-pressed={fulfillmentType === 'delivery'}
                    className={`min-h-[42px] py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 border transition-all ${
                      fulfillmentType === 'delivery'
                        ? 'bg-stone-900 text-white border-stone-900 shadow-sm'
                        : 'bg-stone-50 text-stone-700 border-stone-200 hover:bg-stone-100'
                    }`}
                  >
                    <Truck className="w-4 h-4" />
                    <span>Entrega</span>
                  </button>

                  {dineInEnabled && (
                    <button
                      type="button"
                      onClick={() => setFulfillmentType('dine_in')}
                      aria-pressed={fulfillmentType === 'dine_in'}
                      className={`min-h-[42px] py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 border transition-all ${
                        fulfillmentType === 'dine_in'
                          ? 'bg-stone-900 text-white border-stone-900 shadow-sm'
                          : 'bg-stone-50 text-stone-700 border-stone-200 hover:bg-stone-100'
                      }`}
                    >
                      <Utensils className="w-4 h-4" />
                      <span>No Local</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* 2. Catálogo Rápido de Produtos */}
          <QuickOrderCatalog
            categories={categories}
            catalog={catalog}
            isLoadingCatalog={isLoadingCatalog}
            catalogError={catalogError}
            onRetryLoadCatalog={loadPosData}
            selectedCategoryId={selectedCategoryId}
            onSelectCategoryId={setSelectedCategoryId}
            productSearch={productSearch}
            onChangeProductSearch={setProductSearch}
            onSelectVariant={handleSelectVariantFromCatalog}
          />
        </div>

        {/* COLUNA DIREITA (5 cols): Cliente, Endereço, Sacola, Pagamento e Revisão */}
        <div
          className={`xl:col-span-5 space-y-4 ${
            mobileTab === 'catalog' ? 'hidden xl:block' : 'block'
          }`}
        >
          {/* Card Cliente + Endereço */}
          <div className="bg-white rounded-2xl p-4 sm:p-5 border border-stone-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-black uppercase tracking-wider text-stone-700 flex items-center gap-1.5">
                <User className="w-4 h-4 text-emerald-600" />
                Cliente & Atendimento
              </span>
              {isSearchingCustomer && (
                <span className="text-[11px] text-stone-400">Buscando histórico...</span>
              )}
            </div>

            {/* Busca de cliente recorrente */}
            <div className="relative">
              <label htmlFor="pos-customer-search" className="sr-only">
                Buscar cliente recorrente por telefone ou nome
              </label>
              <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                id="pos-customer-search"
                type="text"
                value={customerSearch}
                onChange={(e) => {
                  const val = e.target.value;
                  setCustomerSearch(val);
                  if (val.trim().length < 3) {
                    setCustomerSuggestions([]);
                    setIsSearchingCustomer(false);
                  }
                }}
                placeholder="Buscar cliente recorrente por WhatsApp ou nome..."
                className="w-full min-h-[38px] pl-9 pr-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />

              {customerSuggestions.length > 0 && (
                <div className="absolute z-20 left-0 right-0 mt-1 bg-white rounded-xl border border-stone-200 shadow-xl divide-y divide-stone-100 max-h-56 overflow-y-auto">
                  {customerSuggestions.map((c, idx) => (
                    <button
                      key={`${c.customerPhone}-${idx}`}
                      type="button"
                      onClick={() => handleSelectRecurringCustomer(c)}
                      className="w-full px-3.5 py-2.5 text-left hover:bg-emerald-50/60 flex items-center justify-between gap-2 transition-colors"
                    >
                      <div>
                        <span className="font-bold text-xs text-stone-900 block">
                          {c.customerName}
                        </span>
                        <span className="text-[11px] text-stone-500">
                          {c.customerPhone}
                          {c.lastAddress
                            ? ` • ${c.lastAddress.street}, ${c.lastAddress.number} (${c.lastAddress.neighborhood})`
                            : ''}
                        </span>
                      </div>
                      <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full shrink-0">
                        {c.orderCount} pedido(s)
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="pos-customer-name" className="block text-xs font-bold text-stone-600 mb-1">
                  Nome do Cliente *
                </label>
                <input
                  id="pos-customer-name"
                  type="text"
                  required
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Ex: Maria Oliveira"
                  className="w-full min-h-[38px] px-3 py-2 rounded-xl border border-stone-200 text-xs text-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-900"
                />
              </div>

              <div>
                <label htmlFor="pos-customer-phone" className="block text-xs font-bold text-stone-600 mb-1">
                  WhatsApp / Telefone{' '}
                  {orderChannel !== 'counter' || fulfillmentType === 'delivery' ? '*' : '(Opcional)'}
                </label>
                <input
                  id="pos-customer-phone"
                  type="text"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="(75) 99999-9999"
                  className="w-full min-h-[38px] px-3 py-2 rounded-xl border border-stone-200 text-xs text-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-900"
                />
              </div>
            </div>

            {/* Endereço de Entrega (Exibido quando Entrega) */}
            {fulfillmentType === 'delivery' && (
              <div className="pt-3 border-t border-stone-100 space-y-2.5 bg-blue-50/40 p-3 rounded-xl border border-blue-100">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-blue-900 flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-blue-600" />
                    Endereço de Entrega
                  </span>
                  <span className="text-[11px] text-blue-700 font-medium">
                    CEP opcional no WhatsApp/Telefone
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                  <div className="sm:col-span-4">
                    <label htmlFor="pos-zip" className="block text-[11px] font-semibold text-stone-600 mb-0.5">
                      CEP (Opcional) {isLoadingCep && <span className="text-amber-600">(Buscando...)</span>}
                    </label>
                    <input
                      id="pos-zip"
                      type="text"
                      value={zipCode}
                      maxLength={9}
                      onChange={(e) => {
                        const val = e.target.value;
                        setZipCode(val);
                        const digits = val.replace(/\D/g, '');
                        if (digits.length === 8) {
                          void lookupPosCep(digits);
                        }
                      }}
                      onBlur={() => {
                        const digits = zipCode.replace(/\D/g, '');
                        if (digits.length === 8) {
                          void lookupPosCep(digits);
                        }
                      }}
                      placeholder="44000-000"
                      className="w-full min-h-[36px] px-2.5 py-1.5 rounded-lg border border-stone-200 bg-white text-xs"
                    />
                  </div>
                  <div className="sm:col-span-8">
                    <label htmlFor="pos-street" className="block text-[11px] font-semibold text-stone-600 mb-0.5">
                      Rua / Logradouro *
                    </label>
                    <input
                      id="pos-street"
                      type="text"
                      required
                      value={street}
                      onChange={(e) => setStreet(e.target.value)}
                      placeholder="Av. Getúlio Vargas"
                      className="w-full min-h-[36px] px-2.5 py-1.5 rounded-lg border border-stone-200 bg-white text-xs"
                    />
                  </div>
                  <div className="sm:col-span-4">
                    <label htmlFor="pos-number" className="block text-[11px] font-semibold text-stone-600 mb-0.5">
                      Número (ou S/N) *
                    </label>
                    <input
                      id="pos-number"
                      type="text"
                      required
                      value={number}
                      onChange={(e) => setNumber(e.target.value)}
                      placeholder="120"
                      className="w-full min-h-[36px] px-2.5 py-1.5 rounded-lg border border-stone-200 bg-white text-xs"
                    />
                  </div>
                  <div className="sm:col-span-8">
                    <label htmlFor="pos-complement" className="block text-[11px] font-semibold text-stone-600 mb-0.5">
                      Complemento
                    </label>
                    <input
                      id="pos-complement"
                      type="text"
                      value={complement}
                      onChange={(e) => setComplement(e.target.value)}
                      placeholder="Apto / Bloco / Casa"
                      className="w-full min-h-[36px] px-2.5 py-1.5 rounded-lg border border-stone-200 bg-white text-xs"
                    />
                  </div>
                  <div className="sm:col-span-5">
                    <label htmlFor="pos-neighborhood" className="block text-[11px] font-semibold text-stone-600 mb-0.5">
                      Bairro *
                    </label>
                    <input
                      id="pos-neighborhood"
                      type="text"
                      required
                      value={neighborhood}
                      onChange={(e) => setNeighborhood(e.target.value)}
                      placeholder="Kalilândia"
                      className="w-full min-h-[36px] px-2.5 py-1.5 rounded-lg border border-stone-200 bg-white text-xs"
                    />
                  </div>
                  <div className="sm:col-span-5">
                    <label htmlFor="pos-city" className="block text-[11px] font-semibold text-stone-600 mb-0.5">
                      Cidade *
                    </label>
                    <input
                      id="pos-city"
                      type="text"
                      required
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      className="w-full min-h-[36px] px-2.5 py-1.5 rounded-lg border border-stone-200 bg-white text-xs"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label htmlFor="pos-uf" className="block text-[11px] font-semibold text-stone-600 mb-0.5">
                      UF *
                    </label>
                    <input
                      id="pos-uf"
                      type="text"
                      required
                      maxLength={2}
                      value={stateUf}
                      onChange={(e) => setStateUf(e.target.value.toUpperCase())}
                      className="w-full min-h-[36px] px-2 py-1.5 rounded-lg border border-stone-200 bg-white text-xs uppercase text-center"
                    />
                  </div>
                  <div className="sm:col-span-12">
                    <label htmlFor="pos-ref" className="block text-[11px] font-semibold text-stone-600 mb-0.5">
                      Ponto de Referência
                    </label>
                    <input
                      id="pos-ref"
                      type="text"
                      value={reference}
                      onChange={(e) => setReference(e.target.value)}
                      placeholder="Próximo a..."
                      className="w-full min-h-[36px] px-2.5 py-1.5 rounded-lg border border-stone-200 bg-white text-xs"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Horário: Imediato vs Agendado */}
            <div className="pt-2 border-t border-stone-100 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setScheduleType('asap')}
                  aria-pressed={scheduleType === 'asap'}
                  className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 border ${
                    scheduleType === 'asap'
                      ? 'bg-stone-900 text-white border-stone-900'
                      : 'bg-stone-50 text-stone-700 border-stone-200'
                  }`}
                >
                  <Clock className="w-3.5 h-3.5" />
                  <span>Imediato (ASAP)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setScheduleType('scheduled')}
                  aria-pressed={scheduleType === 'scheduled'}
                  className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 border ${
                    scheduleType === 'scheduled'
                      ? 'bg-amber-600 text-white border-amber-600'
                      : 'bg-stone-50 text-stone-700 border-stone-200'
                  }`}
                >
                  <Calendar className="w-3.5 h-3.5" />
                  <span>Agendado</span>
                </button>
              </div>

              {scheduleType === 'scheduled' && (
                <input
                  type="datetime-local"
                  required
                  value={scheduledForInput}
                  onChange={(e) => setScheduledForInput(e.target.value)}
                  aria-label="Data e hora do agendamento"
                  className="min-h-[36px] px-2.5 py-1.5 rounded-lg border border-amber-300 bg-amber-50/40 text-xs text-stone-900"
                />
              )}
            </div>
          </div>

          {/* Card Sacola + Pagamento + Totais */}
          <div className="bg-white rounded-2xl p-4 sm:p-5 border border-stone-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div>
                <h2 className="text-sm font-black uppercase tracking-wider text-stone-900">
                  Sacola do Pedido
                </h2>
                <p className="text-xs text-stone-500">
                  {totalItemsCount} unidade(s) selecionada(s)
                </p>
              </div>
              {cart.length > 0 && (
                <button
                  type="button"
                  onClick={() => setCart([])}
                  className="text-xs font-bold text-red-600 hover:underline"
                >
                  Limpar sacola
                </button>
              )}
            </div>

            {/* Itens da Sacola */}
            {cart.length === 0 ? (
              <div className="py-8 text-center border-2 border-dashed border-stone-200 rounded-xl text-stone-400 text-xs">
                Selecione os pratos ao lado para montar o pedido
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {cart.map((item) => (
                  <div
                    key={item.cartItemKey}
                    className="p-2.5 rounded-xl bg-stone-50 border border-stone-200/80 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0 flex-1">
                      <span className="font-bold text-xs text-stone-900 block truncate">
                        {item.productName}
                      </span>
                      <span className="text-[11px] text-stone-500 block">
                        {item.variantName} • {formatBrl(item.unitPriceInCents)} un.
                      </span>
                      {item.modifierSummary && (
                        <span className="text-[11px] font-semibold text-emerald-800 block">
                          + {item.modifierSummary}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleUpdateQuantity(item.cartItemKey, -1)}
                        aria-label={`Diminuir quantidade de ${item.productName}`}
                        className="w-8 h-8 rounded-lg bg-white border border-stone-200 flex items-center justify-center text-stone-700 hover:bg-stone-100"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="w-6 text-center text-xs font-black text-stone-900">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleUpdateQuantity(item.cartItemKey, 1)}
                        disabled={item.quantity >= 99}
                        aria-label={`Aumentar quantidade de ${item.productName}`}
                        className="w-8 h-8 rounded-lg bg-white border border-stone-200 flex items-center justify-center text-stone-700 hover:bg-stone-100 disabled:opacity-40"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>

                      <span className="w-20 text-right font-mono font-bold text-xs text-stone-900">
                        {formatBrl(item.unitPriceInCents * item.quantity)}
                      </span>

                      <button
                        type="button"
                        onClick={() => handleRemoveItem(item.cartItemKey)}
                        aria-label={`Remover ${item.productName} da sacola`}
                        className="p-1.5 text-stone-400 hover:text-red-600"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Observações Gerais da Cozinha / Expedição */}
            <div className="space-y-1.5 pt-2 border-t border-stone-100">
              <label htmlFor="pos-kitchen-notes" className="block text-xs font-bold uppercase text-stone-500">
                Observações do Pedido (Cozinha / Expedição)
              </label>
              <div className="flex flex-wrap gap-1">
                {QUICK_KITCHEN_NOTES.map((note) => (
                  <button
                    key={note}
                    type="button"
                    onClick={() => handleAppendQuickNote(note)}
                    className="text-[11px] font-semibold px-2 py-1 rounded-lg bg-stone-100 hover:bg-amber-100 text-stone-700 hover:text-amber-900 transition-colors"
                  >
                    + {note}
                  </button>
                ))}
              </div>
              <textarea
                id="pos-kitchen-notes"
                rows={2}
                value={kitchenNotes}
                onChange={(e) => setKitchenNotes(e.target.value)}
                placeholder="Observações gerais do pedido..."
                className="w-full px-3 py-2 rounded-xl border border-stone-200 text-xs text-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-900"
              />
            </div>

            {/* Forma de Pagamento */}
            <div className="space-y-2.5 pt-2 border-t border-stone-100">
              <span className="block text-xs font-black uppercase text-stone-500">
                Forma de Pagamento
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {(
                  [
                    { id: 'pix', label: 'Pix QR', icon: QrCode },
                    { id: 'cash', label: 'Dinheiro', icon: Banknote },
                    { id: 'card_on_delivery', label: 'Cartão Entrega', icon: CreditCard },
                    { id: 'pos_card', label: 'Maquininha Balcão', icon: CreditCard },
                  ] as const
                ).map((pm) => {
                  const Icon = pm.icon;
                  return (
                    <button
                      key={pm.id}
                      type="button"
                      onClick={() => setPaymentMethod(pm.id)}
                      aria-pressed={paymentMethod === pm.id}
                      className={`min-h-[38px] py-2 px-2.5 rounded-xl text-xs font-bold border flex items-center justify-center gap-1.5 transition-all ${
                        paymentMethod === pm.id
                          ? 'bg-stone-900 text-white border-stone-900'
                          : 'bg-stone-50 text-stone-700 border-stone-200 hover:bg-stone-100'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{pm.label}</span>
                    </button>
                  );
                })}
              </div>

              {paymentMethod === 'cash' && (
                <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <label htmlFor="pos-cash-change" className="text-xs font-bold text-amber-900">
                      Troco para quanto? (R$)
                    </label>
                    <input
                      id="pos-cash-change"
                      type="text"
                      value={cashChangeReais}
                      onChange={(e) => setCashChangeReais(e.target.value)}
                      placeholder="Ex: 100,00"
                      className="w-28 min-h-[36px] px-2.5 py-1 rounded-lg border border-amber-300 bg-white text-xs text-right font-mono font-bold"
                    />
                  </div>
                  {cashChangeReturnCents !== null && (
                    <div className="text-xs font-black text-emerald-800 flex items-center justify-between pt-1 border-t border-amber-200/60">
                      <span>Troco a devolver:</span>
                      <span className="font-mono">{formatBrl(cashChangeReturnCents)}</span>
                    </div>
                  )}
                </div>
              )}

              {(paymentMethod === 'cash' ||
                paymentMethod === 'pos_card' ||
                paymentMethod === 'credit_card') && (
                <label className="flex items-center gap-2 p-2.5 rounded-xl bg-emerald-50/70 border border-emerald-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={markAsPaidNow}
                    onChange={(e) => setMarkAsPaidNow(e.target.checked)}
                    className="rounded border-emerald-400 text-emerald-600 focus:ring-emerald-500"
                  />
                  <span className="text-xs font-bold text-emerald-900">
                    Já recebido presencialmente no balcão (Marcar como Pago)
                  </span>
                </label>
              )}
            </div>

            {/* Taxa de Entrega editável quando Entrega */}
            {fulfillmentType === 'delivery' && (
              <div className="p-3 rounded-xl bg-blue-50/60 border border-blue-200 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <label htmlFor="pos-delivery-fee" className="text-xs font-bold text-blue-900">
                    Taxa de Entrega (R$)
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      id="pos-delivery-fee"
                      type="text"
                      value={
                        deliveryFeeManuallyEdited
                          ? deliveryFeeReais
                          : (defaultDeliveryFeeCents / 100).toFixed(2).replace('.', ',')
                      }
                      onChange={(e) => {
                        setDeliveryFeeManuallyEdited(true);
                        setDeliveryFeeReais(e.target.value);
                      }}
                      placeholder="0,00"
                      className="w-24 min-h-[36px] px-2.5 py-1 rounded-lg border border-blue-300 bg-white text-xs text-right font-mono font-bold text-stone-900"
                    />
                    {deliveryFeeManuallyEdited && (
                      <button
                        type="button"
                        onClick={() => {
                          setDeliveryFeeManuallyEdited(false);
                          setDeliveryFeeReais('');
                        }}
                        className="text-[11px] font-bold text-blue-700 hover:underline"
                      >
                        Padrão
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Opções Secundárias Recolhíveis (Desconto, Nº do Pedido, E-mail) */}
            <div className="border border-stone-200 rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => setShowAdvancedOptions((prev) => !prev)}
                className="w-full min-h-[38px] px-3.5 py-2 bg-stone-50 hover:bg-stone-100 flex items-center justify-between text-xs font-bold text-stone-700"
              >
                <span>Opções avançadas (Desconto, Nº manual do pedido, E-mail)</span>
                {showAdvancedOptions ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </button>

              {showAdvancedOptions && (
                <div className="p-3.5 space-y-3 bg-white border-t border-stone-200">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="pos-discount" className="block text-xs font-bold text-stone-600 mb-1">
                        Desconto (R$){' '}
                        {operatorRole !== 'tenant_admin' && (
                          <span className="text-[10px] text-amber-700">(Máx. 20%)</span>
                        )}
                      </label>
                      <input
                        id="pos-discount"
                        type="text"
                        value={discountReais}
                        onChange={(e) => setDiscountReais(e.target.value)}
                        placeholder="0,00"
                        className="w-full min-h-[36px] px-2.5 py-1.5 rounded-lg border border-stone-200 text-xs font-mono"
                      />
                    </div>

                    <div>
                      <label htmlFor="pos-order-number" className="block text-xs font-bold text-stone-600 mb-1">
                        Nº do Pedido (Opcional)
                      </label>
                      <input
                        id="pos-order-number"
                        type="text"
                        value={orderNumberOverride}
                        onChange={(e) => setOrderNumberOverride(e.target.value)}
                        placeholder="Automático (ex: #1050)"
                        className="w-full min-h-[36px] px-2.5 py-1.5 rounded-lg border border-stone-200 text-xs font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="pos-email" className="block text-xs font-bold text-stone-600 mb-1">
                      E-mail do Cliente (Opcional)
                    </label>
                    <input
                      id="pos-email"
                      type="email"
                      value={customerEmail}
                      onChange={(e) => setCustomerEmail(e.target.value)}
                      placeholder="cliente@email.com"
                      className="w-full min-h-[36px] px-2.5 py-1.5 rounded-lg border border-stone-200 text-xs"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Resumo Financeiro */}
            <div className="p-3.5 rounded-xl bg-stone-50 border border-stone-200 space-y-1.5 text-xs">
              <div className="flex justify-between text-stone-600">
                <span>Subtotal ({totalItemsCount} un.):</span>
                <span className="font-mono font-semibold">{formatBrl(subtotalCents)}</span>
              </div>
              {fulfillmentType === 'delivery' && (
                <div className="flex justify-between text-stone-600">
                  <span>Taxa de Entrega:</span>
                  <span className="font-mono font-semibold">{formatBrl(deliveryFeeCents)}</span>
                </div>
              )}
              {discountCents > 0 && (
                <div className="flex justify-between text-emerald-700 font-semibold">
                  <span>Desconto:</span>
                  <span className="font-mono">- {formatBrl(discountCents)}</span>
                </div>
              )}
              <div className="pt-2 border-t border-stone-200 flex justify-between items-baseline">
                <span className="font-black text-stone-900 text-sm">Total do Pedido:</span>
                <span className="font-black font-mono text-lg text-stone-900">
                  {formatBrl(totalCents)}
                </span>
              </div>
            </div>

            {submitError && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <span>{submitError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={cart.length === 0 || isSubmitting}
              className="w-full min-h-[46px] py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-stone-300 text-white font-black text-sm flex items-center justify-center gap-2 shadow-sm transition-all active:scale-[0.99]"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Revisar e Registrar Pedido ({formatBrl(totalCents)})</span>
            </button>
          </div>
        </div>
      </form>

      {/* Barra Persistente Mobile quando na aba Catálogo com itens */}
      {mobileTab === 'catalog' && cart.length > 0 && (
        <div className="fixed bottom-4 left-4 right-4 z-30 xl:hidden">
          <button
            type="button"
            onClick={() => setMobileTab('checkout')}
            className="w-full min-h-[48px] px-4 py-3 rounded-2xl bg-emerald-600 text-white font-black text-xs shadow-xl flex items-center justify-between"
          >
            <span className="flex items-center gap-2">
              <ShoppingBag className="w-4 h-4" />
              <span>Ver Sacola ({totalItemsCount} itens)</span>
            </span>
            <span className="font-mono text-sm">{formatBrl(totalCents)} →</span>
          </button>
        </div>
      )}

      {/* Modal de Seleção de Complementos */}
      {pendingModifierSelection && (
        <QuickOrderModifierModal
          product={pendingModifierSelection.product}
          variant={pendingModifierSelection.variant}
          onClose={() => setPendingModifierSelection(null)}
          onConfirm={(modPayload) => {
            appendCartItem(
              pendingModifierSelection.product,
              pendingModifierSelection.variant,
              modPayload
            );
            setPendingModifierSelection(null);
          }}
        />
      )}

      {/* Modal de Conferência Final antes de Enviar à Cozinha/KDS */}
      {isReviewOpen && (
        <QuickOrderReviewModal
          orderChannel={orderChannel}
          fulfillmentType={fulfillmentType}
          scheduleType={scheduleType}
          scheduledForInput={scheduledForInput}
          customerName={customerName}
          customerPhone={customerPhone}
          address={{
            zipCode,
            street,
            number,
            complement,
            neighborhood,
            city,
            stateUf,
            reference,
          }}
          cart={cart}
          kitchenNotes={kitchenNotes}
          subtotalCents={subtotalCents}
          deliveryFeeCents={deliveryFeeCents}
          discountCents={discountCents}
          totalCents={totalCents}
          paymentMethod={paymentMethod}
          markAsPaidNow={markAsPaidNow}
          cashChangeForCents={cashChangeForCents}
          cashChangeReturnCents={cashChangeReturnCents}
          confirmImmediately={confirmImmediately}
          onToggleConfirmImmediately={setConfirmImmediately}
          isSubmitting={isSubmitting}
          onClose={() => setIsReviewOpen(false)}
          onConfirmSubmit={handleConfirmAndSubmitOrder}
        />
      )}

      {/* Modal de Impressão Térmica */}
      <OrderPrintModal
        order={printModalOrder}
        tenantName={tenantName}
        defaultMode={printDefaultMode}
        onClose={() => setPrintModalOrder(null)}
      />
    </div>
  );
}
