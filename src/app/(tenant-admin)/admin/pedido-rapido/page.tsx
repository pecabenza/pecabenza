'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
  Copy,
  Check,
  Printer,
  ExternalLink,
  Flame,
  Clock,
  Calendar,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { formatBrl } from '@/modules/cart/cart.utils';
import { OrderPrintModal, type PrintTicketMode } from '@/components/admin/orders/OrderPrintModal';
import type {
  FulfillmentType,
  OrderChannel,
  OrderPaymentMethod,
  TenantCommerceSettings,
  TenantRole,
} from '@/types/database.types';
import type {
  OperationalOrder,
  QuickOrderCreationResult,
  TenantCustomerHistoryItem,
} from '@/modules/orders/orders.service';

interface CatalogVariant {
  id: string;
  product_id: string;
  name: string;
  sku: string | null;
  unit_type: string;
  unit_value: number;
  price_in_cents: number;
  is_available: boolean;
}

interface CatalogProduct {
  id: string;
  category_id: string | null;
  name: string;
  slug: string;
  short_description: string | null;
  is_featured: boolean;
  variants: CatalogVariant[];
  stationNames: string[];
}

interface CatalogCategory {
  id: string;
  name: string;
  slug: string;
}

interface PosCartItem {
  productId: string;
  productName: string;
  variantId: string;
  variantName: string;
  unitPriceInCents: number;
  quantity: number;
  stationNames: string[];
}

interface CreatedOrderWithPix extends QuickOrderCreationResult {
  pixPayment?: {
    paymentId: string;
    pixQrCodeText: string;
    pixQrCodeBase64: string;
    pixExpiresAt: string;
  } | null;
}

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
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(true);

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

  // Endereço de entrega
  const [zipCode, setZipCode] = useState('');
  const [street, setStreet] = useState('');
  const [number, setNumber] = useState('');
  const [complement, setComplement] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [city, setCity] = useState('São Paulo');
  const [stateUf, setStateUf] = useState('SP');
  const [reference, setReference] = useState('');

  // Catálogo e Sacola
  const [productSearch, setProductSearch] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [cart, setCart] = useState<PosCartItem[]>([]);
  const [kitchenNotes, setKitchenNotes] = useState('');

  // Financeiro e Confirmação
  const [paymentMethod, setPaymentMethod] = useState<OrderPaymentMethod>('pix');
  const [markAsPaidNow, setMarkAsPaidNow] = useState(false);
  const [cashChangeReais, setCashChangeReais] = useState('');
  const [discountReais, setDiscountReais] = useState('');
  const [confirmImmediately, setConfirmImmediately] = useState(true);
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() => generateIdempotencyKey());

  // Submissão e Resultado Pós-Pedido
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createdOrder, setCreatedOrder] = useState<CreatedOrderWithPix | null>(null);
  const [copiedWhatsApp, setCopiedWhatsApp] = useState(false);
  const [copiedPix, setCopiedPix] = useState(false);
  const [printModalOrder, setPrintModalOrder] = useState<OperationalOrder | null>(null);
  const [printDefaultMode, setPrintDefaultMode] = useState<PrintTicketMode>('full');

  const loadPosData = useCallback(async () => {
    setIsLoadingCatalog(true);
    try {
      const res = await fetch('/api/admin/orders/quick');
      if (res.ok) {
        const data = await res.json();
        if (data.tenant?.name) setTenantName(data.tenant.name);
        if (data.operator?.role) setOperatorRole(data.operator.role);
        setCategories(data.categories || []);
        setCatalog(data.catalog || []);
        setCommerceSettings(data.commerceSettings || null);
      }
    } catch {
      // ignora erro transitório
    } finally {
      setIsLoadingCatalog(false);
    }
  }, []);

  useEffect(() => {
    loadPosData();
  }, [loadPosData]);

  // Busca reativa de clientes recorrentes por telefone/nome
  useEffect(() => {
    const q = customerSearch.trim();
    if (q.length < 3) {
      setCustomerSuggestions([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearchingCustomer(true);
      try {
        const res = await fetch(`/api/admin/orders/quick?q=${encodeURIComponent(q)}`);
        if (res.ok) {
          const data = await res.json();
          setCustomerSuggestions(data.customers || []);
        }
      } catch {
        // ignora erro de rede
      } finally {
        setIsSearchingCustomer(false);
      }
    }, 260);

    return () => clearTimeout(timer);
  }, [customerSearch]);

  // Troca de canal ajusta defaults inteligentes
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

  // Auto-preenche cliente recorrente + último endereço
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
      setCity(c.lastAddress.city || 'São Paulo');
      setStateUf(c.lastAddress.state || 'SP');
      setReference(c.lastAddress.reference || '');
    }
    setCustomerSearch('');
    setCustomerSuggestions([]);
  };

  // Manipulação da sacola
  const handleAddVariant = (product: CatalogProduct, variant: CatalogVariant) => {
    setCart((prev) => {
      const idx = prev.findIndex((i) => i.variantId === variant.id);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = {
          ...updated[idx],
          quantity: Math.min(99, updated[idx].quantity + 1),
        };
        return updated;
      }
      return [
        ...prev,
        {
          productId: product.id,
          productName: product.name,
          variantId: variant.id,
          variantName: variant.name,
          unitPriceInCents: variant.price_in_cents,
          quantity: 1,
          stationNames: product.stationNames || [],
        },
      ];
    });
  };

  const handleUpdateQuantity = (variantId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) =>
          item.variantId === variantId
            ? { ...item, quantity: item.quantity + delta }
            : item
        )
        .filter((item) => item.quantity > 0)
    );
  };

  const handleRemoveItem = (variantId: string) => {
    setCart((prev) => prev.filter((item) => item.variantId !== variantId));
  };

  // Cálculos de valores em tempo real
  const subtotalCents = useMemo(
    () => cart.reduce((acc, item) => acc + item.unitPriceInCents * item.quantity, 0),
    [cart]
  );

  const deliveryFeeCents = useMemo(() => {
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

  const discountCents = useMemo(() => {
    const parsed = parseFloat(discountReais.replace(',', '.'));
    if (Number.isNaN(parsed) || parsed <= 0) return 0;
    return Math.round(parsed * 100);
  }, [discountReais]);

  const totalCents = useMemo(
    () => Math.max(0, subtotalCents + deliveryFeeCents - discountCents),
    [subtotalCents, deliveryFeeCents, discountCents]
  );

  const cashChangeForCents = useMemo(() => {
    if (paymentMethod !== 'cash') return null;
    const parsed = parseFloat(cashChangeReais.replace(',', '.'));
    if (Number.isNaN(parsed) || parsed <= 0) return null;
    return Math.round(parsed * 100);
  }, [paymentMethod, cashChangeReais]);

  const cashChangeReturnCents = useMemo(() => {
    if (!cashChangeForCents || cashChangeForCents < totalCents) return null;
    return cashChangeForCents - totalCents;
  }, [cashChangeForCents, totalCents]);

  const filteredProducts = useMemo(() => {
    return catalog.filter((p) => {
      if (selectedCategoryId !== 'all' && p.category_id !== selectedCategoryId) {
        return false;
      }
      if (productSearch.trim()) {
        const term = productSearch.toLowerCase();
        const matchesName = p.name.toLowerCase().includes(term);
        const matchesDesc = (p.short_description || '').toLowerCase().includes(term);
        const matchesVariant = p.variants.some((v) => v.name.toLowerCase().includes(term));
        if (!matchesName && !matchesDesc && !matchesVariant) return false;
      }
      return true;
    });
  }, [catalog, selectedCategoryId, productSearch]);

  const handleAppendQuickNote = (noteText: string) => {
    setKitchenNotes((prev) => {
      if (!prev.trim()) return noteText;
      if (prev.includes(noteText)) return prev;
      return `${prev.trim()} | ${noteText}`;
    });
  };

  const handleResetNewOrder = () => {
    setCart([]);
    setKitchenNotes('');
    setDiscountReais('');
    setCashChangeReais('');
    setMarkAsPaidNow(false);
    setSubmitError(null);
    setCreatedOrder(null);
    setIdempotencyKey(generateIdempotencyKey());
    if (orderChannel === 'counter') {
      setCustomerName('Cliente Balcão');
      setCustomerPhone('');
    } else {
      setCustomerName('');
      setCustomerPhone('');
    }
    setCustomerEmail('');
  };

  const buildOperationalOrderForPrint = (ord: CreatedOrderWithPix): OperationalOrder => {
    return {
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
    };
  };

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cart.length === 0 || isSubmitting) return;

    setSubmitError(null);
    setIsSubmitting(true);

    try {
      const payload: Record<string, any> = {
        orderChannel,
        items: cart.map((item) => ({
          productId: item.productId,
          variantId: item.variantId,
          quantity: item.quantity,
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
        confirmImmediately,
        notes: kitchenNotes.trim() || undefined,
        idempotencyKey,
        generatePixQr: paymentMethod === 'pix',
      };

      if (fulfillmentType === 'delivery') {
        payload.address = {
          zipCode: zipCode.trim() || '01310-100',
          street: street.trim(),
          number: number.trim(),
          complement: complement.trim() || undefined,
          neighborhood: neighborhood.trim(),
          city: city.trim() || 'São Paulo',
          state: (stateUf.trim() || 'SP').toUpperCase(),
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

      setCreatedOrder(data);
    } catch (err: any) {
      setSubmitError(err.message || 'Erro ao registrar pedido.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-5 pb-16">
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
            className="px-3.5 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-bold transition-colors"
          >
            Fila Operacional
          </Link>
          <Link
            href="/admin/kds"
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition-colors"
          >
            <Flame className="w-4 h-4" />
            <span>Abrir KDS Cozinha</span>
          </Link>
        </div>
      </div>

      {/* Painel de Sucesso Pós-Pedido (Com QR Code Pix, Cópia WhatsApp e Impressão 58mm/80mm) */}
      {createdOrder && (
        <div className="bg-emerald-950 text-white rounded-2xl p-6 border-2 border-emerald-500 shadow-xl space-y-5 animate-fade-in">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-emerald-800 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500 text-emerald-950 flex items-center justify-center font-black">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-2xl font-black font-mono text-emerald-300">
                    {createdOrder.orderNumber}
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-800 text-emerald-200 uppercase">
                    {createdOrder.status === 'confirmed'
                      ? 'Confirmado no KDS'
                      : 'Aguardando Confirmação'}
                  </span>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase ${
                      createdOrder.paymentStatus === 'paid'
                        ? 'bg-emerald-400 text-emerald-950'
                        : 'bg-amber-400 text-amber-950'
                    }`}
                  >
                    Pgto: {createdOrder.paymentStatus === 'paid' ? 'Pago' : 'Pendente'}
                  </span>
                </div>
                <p className="text-xs text-emerald-200 mt-1">
                  Cliente: <strong>{createdOrder.customerName}</strong> • Total:{' '}
                  <strong>{createdOrder.formattedTotal}</strong>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => {
                  setPrintDefaultMode('full');
                  setPrintModalOrder(buildOperationalOrderForPrint(createdOrder));
                }}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white text-stone-900 hover:bg-stone-100 text-xs font-black transition-all shadow-sm"
              >
                <Printer className="w-4 h-4" />
                <span>Imprimir Comanda (58mm / 80mm)</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setPrintDefaultMode('kitchen');
                  setPrintModalOrder(buildOperationalOrderForPrint(createdOrder));
                }}
                className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-black transition-all"
              >
                <Flame className="w-4 h-4" />
                <span>Imprimir Via Cozinha</span>
              </button>

              <button
                type="button"
                onClick={handleResetNewOrder}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black border border-emerald-400 transition-all"
              >
                <Plus className="w-4 h-4" />
                <span>Novo Pedido Rápido</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Coluna 1: Resumo para WhatsApp + Link Público */}
            <div className="bg-emerald-900/60 rounded-xl p-4 border border-emerald-800 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase tracking-wider text-emerald-300 flex items-center gap-1.5">
                  <MessageCircle className="w-4 h-4" />
                  Resumo Pronto para WhatsApp + Link de Rastreio
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(createdOrder.whatsappSummaryText);
                      setCopiedWhatsApp(true);
                      setTimeout(() => setCopiedWhatsApp(false), 2500);
                    }}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-emerald-950 text-xs font-black transition-colors"
                  >
                    {copiedWhatsApp ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedWhatsApp ? 'Copiado!' : 'Copiar Resumo'}</span>
                  </button>

                  {createdOrder.customerPhone && (
                    <a
                      href={`https://wa.me/55${createdOrder.customerPhone.replace(/\D/g, '')}?text=${encodeURIComponent(
                        createdOrder.whatsappSummaryText
                      )}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition-colors"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Enviar no WhatsApp</span>
                    </a>
                  )}
                </div>
              </div>

              <pre className="text-xs font-mono bg-emerald-950/90 p-3 rounded-lg border border-emerald-800/80 whitespace-pre-wrap text-emerald-100 max-h-48 overflow-y-auto">
                {createdOrder.whatsappSummaryText}
              </pre>

              <div className="flex items-center justify-between text-xs pt-1 text-emerald-200">
                <span>Link público de acompanhamento:</span>
                <Link
                  href={`/pedido/${createdOrder.publicTrackingToken}`}
                  target="_blank"
                  className="underline font-bold hover:text-white flex items-center gap-1"
                >
                  <span>/pedido/{createdOrder.publicTrackingToken.slice(0, 12)}...</span>
                  <ExternalLink className="w-3 h-3" />
                </Link>
              </div>
            </div>

            {/* Coluna 2: Cobrança Pix (se método = Pix) ou Detalhes de Recebimento */}
            {createdOrder.paymentMethod === 'pix' && createdOrder.pixPayment ? (
              <div className="bg-emerald-900/60 rounded-xl p-4 border border-emerald-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase tracking-wider text-emerald-300 flex items-center gap-1.5">
                    <QrCode className="w-4 h-4" />
                    Cobrança Pix Gerada (Aguardando Confirmação)
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(createdOrder.pixPayment?.pixQrCodeText || '');
                      setCopiedPix(true);
                      setTimeout(() => setCopiedPix(false), 2500);
                    }}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-stone-950 text-xs font-black transition-colors"
                  >
                    {copiedPix ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedPix ? 'Pix Copiado!' : 'Copiar Pix Copia e Cola'}</span>
                  </button>
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-4">
                  {createdOrder.pixPayment.pixQrCodeBase64 && (
                    <div className="bg-white p-2 rounded-xl shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={createdOrder.pixPayment.pixQrCodeBase64}
                        alt="QR Code Pix"
                        className="w-28 h-28 object-contain"
                      />
                    </div>
                  )}
                  <div className="flex-1 space-y-2 w-full">
                    <div className="text-xs text-emerald-100">
                      Envie o código <strong>Pix Copia e Cola</strong> abaixo para o cliente no WhatsApp ou mostre o QR Code no balcão:
                    </div>
                    <input
                      type="text"
                      readOnly
                      value={createdOrder.pixPayment.pixQrCodeText}
                      className="w-full px-3 py-2 rounded-lg bg-emerald-950 border border-emerald-800 text-[11px] font-mono text-emerald-200"
                    />
                    <p className="text-[11px] text-amber-300">
                      🔒 Segurança Financeira: o status financeiro permanece como{' '}
                      <strong>Pendente</strong> até a confirmação pelo webhook ou conferência auditada.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-emerald-900/60 rounded-xl p-4 border border-emerald-800 flex flex-col justify-between">
                <div className="space-y-2">
                  <span className="text-xs font-black uppercase tracking-wider text-emerald-300">
                    Resumo Financeiro & Produção
                  </span>
                  <p className="text-sm text-emerald-100">
                    Pedido enviado para as estações configuradas no KDS ({createdOrder.items.length}{' '}
                    item(ns)).
                  </p>
                  {createdOrder.paymentMethod === 'cash' && createdOrder.cashChangeForCents && (
                    <div className="p-3 rounded-lg bg-emerald-950 border border-emerald-700 text-xs space-y-1">
                      <div>
                        Troco solicitado para:{' '}
                        <strong>{formatBrl(createdOrder.cashChangeForCents)}</strong>
                      </div>
                      {createdOrder.cashChangeAmountCents !== null && (
                        <div className="text-emerald-300 font-black text-sm">
                          Troco a devolver: {formatBrl(createdOrder.cashChangeAmountCents)}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div className="pt-3 text-xs text-emerald-300">
                  Use os botões no topo deste card para imprimir a comanda térmica em 58mm ou 80mm.
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Grid Principal PDV: Esquerda = Catálogo Rápido | Direita = Atendimento + Checkout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* COLUNA ESQUERDA (7 cols): Catálogo Rápido de Produtos e Variantes */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-stone-200 shadow-xs p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h2 className="font-heading font-black text-base text-stone-900">
              1. Catálogo Rápido de Produtos
            </h2>

            {/* Busca de Produtos */}
            <div className="relative flex-1 max-w-sm">
              <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                placeholder="Buscar prato ou porção..."
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-stone-100 text-xs text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>

          {/* Abas de Categoria */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
            <button
              type="button"
              onClick={() => setSelectedCategoryId('all')}
              className={`px-3 py-1.5 rounded-lg font-bold whitespace-nowrap transition-colors ${
                selectedCategoryId === 'all'
                  ? 'bg-stone-900 text-white'
                  : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
              }`}
            >
              Todos ({catalog.length})
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategoryId(cat.id)}
                className={`px-3 py-1.5 rounded-lg font-bold whitespace-nowrap transition-colors ${
                  selectedCategoryId === cat.id
                    ? 'bg-stone-900 text-white'
                    : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>

          {/* Lista de Produtos com Adição em 1 Clique */}
          {isLoadingCatalog ? (
            <div className="py-16 text-center text-xs text-stone-400 flex flex-col items-center gap-2">
              <RefreshCw className="w-6 h-6 animate-spin text-stone-400" />
              <span>Carregando cardápio ativo...</span>
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="py-12 text-center text-xs text-stone-400">
              Nenhum produto encontrado para o filtro selecionado.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[680px] overflow-y-auto pr-1">
              {filteredProducts.map((product) => (
                <div
                  key={product.id}
                  className="p-3.5 rounded-xl border border-stone-200 hover:border-stone-300 bg-stone-50/50 flex flex-col justify-between gap-3 transition-all"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-heading font-bold text-sm text-stone-900 leading-snug">
                        {product.name}
                      </h3>
                      {product.stationNames.length > 0 && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 shrink-0">
                          {product.stationNames.join(' → ')}
                        </span>
                      )}
                    </div>
                    {product.short_description && (
                      <p className="text-[11px] text-stone-500 line-clamp-1 mt-0.5">
                        {product.short_description}
                      </p>
                    )}
                  </div>

                  {/* Botões de Variantes / Porções */}
                  <div className="space-y-1.5 pt-1 border-t border-stone-200/70">
                    {product.variants.map((variant) => {
                      const inCart = cart.find((c) => c.variantId === variant.id);
                      return (
                        <div
                          key={variant.id}
                          className="flex items-center justify-between gap-2 bg-white px-2.5 py-1.5 rounded-lg border border-stone-200/90"
                        >
                          <div className="text-xs">
                            <span className="font-bold text-stone-800">{variant.name}</span>
                            <span className="block font-mono font-black text-emerald-700 text-xs">
                              {formatBrl(variant.price_in_cents)}
                            </span>
                          </div>

                          {inCart ? (
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleUpdateQuantity(variant.id, -1)}
                                className="w-7 h-7 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-800 flex items-center justify-center font-bold"
                                aria-label="Diminuir quantidade"
                              >
                                <Minus className="w-3.5 h-3.5" />
                              </button>
                              <span className="w-6 text-center font-mono font-black text-xs text-stone-900">
                                {inCart.quantity}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleUpdateQuantity(variant.id, 1)}
                                className="w-7 h-7 rounded-lg bg-stone-900 hover:bg-stone-800 text-white flex items-center justify-center font-bold"
                                aria-label="Aumentar quantidade"
                              >
                                <Plus className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleAddVariant(product, variant)}
                              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-stone-900 hover:bg-amber-600 text-white text-xs font-bold transition-colors"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>Adicionar</span>
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* COLUNA DIREITA (5 cols): Canal, Cliente, Sacola, Pagamento e Finalização */}
        <form
          onSubmit={handleSubmitOrder}
          className="lg:col-span-5 bg-white rounded-2xl border border-stone-200 shadow-xs p-5 space-y-5"
        >
          {/* 2. Seletor de Canal do Pedido */}
          <div className="space-y-2">
            <label className="block text-xs font-black uppercase tracking-wider text-stone-600">
              2. Canal de Origem do Atendimento
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'whatsapp', label: 'WhatsApp', icon: MessageCircle, activeClass: 'bg-emerald-600 text-white border-emerald-600' },
                { id: 'phone', label: 'Telefone', icon: Phone, activeClass: 'bg-blue-600 text-white border-blue-600' },
                { id: 'counter', label: 'Balcão / Presencial', icon: Store, activeClass: 'bg-amber-600 text-white border-amber-600' },
              ].map((ch) => {
                const Icon = ch.icon;
                const isSelected = orderChannel === ch.id;
                return (
                  <button
                    key={ch.id}
                    type="button"
                    onClick={() => handleSelectChannel(ch.id as OrderChannel)}
                    className={`py-2.5 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                      isSelected
                        ? ch.activeClass
                        : 'bg-stone-50 text-stone-700 border-stone-200 hover:bg-stone-100'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{ch.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. Modalidade de Recebimento e Horário */}
          <div className="space-y-2 pt-2 border-t border-stone-100">
            <label className="block text-xs font-black uppercase tracking-wider text-stone-600">
              3. Modalidade de Atendimento
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'pickup', label: 'Retirada', icon: Store },
                { id: 'delivery', label: 'Entrega', icon: Truck },
                { id: 'dine_in', label: 'Consumo Local', icon: Utensils },
              ].map((m) => {
                const Icon = m.icon;
                const active = fulfillmentType === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setFulfillmentType(m.id as FulfillmentType)}
                    className={`py-2 px-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                      active
                        ? 'bg-stone-900 text-white border-stone-900'
                        : 'bg-stone-50 text-stone-700 border-stone-200 hover:bg-stone-100'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{m.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Imediato vs Agendado */}
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => setScheduleType('asap')}
                className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold border flex items-center justify-center gap-1.5 ${
                  scheduleType === 'asap'
                    ? 'bg-amber-50 text-amber-900 border-amber-300'
                    : 'bg-white text-stone-600 border-stone-200'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>Preparo Imediato (Agora)</span>
              </button>
              <button
                type="button"
                onClick={() => setScheduleType('scheduled')}
                className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold border flex items-center justify-center gap-1.5 ${
                  scheduleType === 'scheduled'
                    ? 'bg-purple-50 text-purple-900 border-purple-300'
                    : 'bg-white text-stone-600 border-stone-200'
                }`}
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>Agendar Horário</span>
              </button>
            </div>

            {scheduleType === 'scheduled' && (
              <div className="pt-1">
                <input
                  type="datetime-local"
                  value={scheduledForInput}
                  onChange={(e) => setScheduledForInput(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-xl bg-purple-50/50 border border-purple-200 text-xs font-semibold text-stone-900"
                />
              </div>
            )}
          </div>

          {/* 4. Identificação do Cliente + Busca por Telefone/Histórico */}
          <div className="space-y-2.5 pt-2 border-t border-stone-100">
            <div className="flex items-center justify-between">
              <label className="text-xs font-black uppercase tracking-wider text-stone-600 flex items-center gap-1">
                <User className="w-3.5 h-3.5" />
                <span>4. Dados do Cliente</span>
              </label>
              {orderChannel === 'counter' && (
                <button
                  type="button"
                  onClick={() => {
                    setCustomerName(`Balcão #${Math.floor(10 + Math.random() * 89)}`);
                    setCustomerPhone('');
                  }}
                  className="text-[11px] font-bold text-amber-700 hover:underline flex items-center gap-1"
                >
                  <Sparkles className="w-3 h-3" />
                  Gerar Senha Rápida de Balcão
                </button>
              )}
            </div>

            {/* Busca de Cliente Recorrente por Telefone ou Nome */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                placeholder="Buscar cliente recorrente por telefone ou nome (auto-preenche endereço)..."
                className="w-full pl-8 pr-3 py-2 rounded-xl bg-amber-50/60 border border-amber-200 text-xs text-stone-800 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              {isSearchingCustomer && (
                <span className="text-[10px] text-stone-400 absolute right-3 top-2.5">
                  Buscando...
                </span>
              )}

              {customerSuggestions.length > 0 && (
                <div className="absolute z-20 left-0 right-0 mt-1 bg-white rounded-xl border border-stone-200 shadow-lg max-h-52 overflow-y-auto divide-y divide-stone-100">
                  {customerSuggestions.map((sug, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => handleSelectRecurringCustomer(sug)}
                      className="w-full text-left px-3.5 py-2.5 hover:bg-amber-50 transition-colors text-xs flex items-center justify-between"
                    >
                      <div>
                        <div className="font-bold text-stone-900">{sug.customerName}</div>
                        <div className="text-[11px] text-stone-500">
                          Tel: {sug.customerPhone}
                          {sug.lastAddress
                            ? ` • ${sug.lastAddress.street}, ${sug.lastAddress.number} (${sug.lastAddress.neighborhood})`
                            : ''}
                        </div>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-stone-100 text-stone-700">
                        {sug.orderCount} pedido(s)
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-semibold text-stone-600 mb-0.5">
                  Nome / Identificação *
                </label>
                <input
                  type="text"
                  required
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Ex: Maria Silva ou Mesa 04"
                  className="w-full px-3 py-2 rounded-xl bg-stone-50 border border-stone-200 text-xs text-stone-900"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-stone-600 mb-0.5">
                  WhatsApp / Telefone{' '}
                  {orderChannel === 'counter' && fulfillmentType !== 'delivery'
                    ? '(Opcional no Balcão)'
                    : '*'}
                </label>
                <input
                  type="tel"
                  required={orderChannel !== 'counter' || fulfillmentType === 'delivery'}
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="(11) 99999-9999"
                  className="w-full px-3 py-2 rounded-xl bg-stone-50 border border-stone-200 text-xs text-stone-900"
                />
              </div>
            </div>

            {/* Endereço de Entrega quando fulfillmentType === 'delivery' */}
            {fulfillmentType === 'delivery' && (
              <div className="p-3 rounded-xl bg-blue-50/50 border border-blue-200/80 space-y-2">
                <div className="text-[11px] font-black uppercase text-blue-900 flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5" />
                  <span>Endereço de Entrega</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <input
                    type="text"
                    value={zipCode}
                    onChange={(e) => setZipCode(e.target.value)}
                    placeholder="CEP (01310-100)"
                    required
                    className="col-span-1 px-2.5 py-1.5 rounded-lg bg-white border border-stone-200 text-xs"
                  />
                  <input
                    type="text"
                    value={street}
                    onChange={(e) => setStreet(e.target.value)}
                    placeholder="Rua / Logradouro *"
                    required
                    className="col-span-2 px-2.5 py-1.5 rounded-lg bg-white border border-stone-200 text-xs"
                  />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <input
                    type="text"
                    value={number}
                    onChange={(e) => setNumber(e.target.value)}
                    placeholder="Número *"
                    required
                    className="col-span-1 px-2.5 py-1.5 rounded-lg bg-white border border-stone-200 text-xs"
                  />
                  <input
                    type="text"
                    value={complement}
                    onChange={(e) => setComplement(e.target.value)}
                    placeholder="Apto / Bloco"
                    className="col-span-2 px-2.5 py-1.5 rounded-lg bg-white border border-stone-200 text-xs"
                  />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <input
                    type="text"
                    value={neighborhood}
                    onChange={(e) => setNeighborhood(e.target.value)}
                    placeholder="Bairro *"
                    required
                    className="col-span-1 px-2.5 py-1.5 rounded-lg bg-white border border-stone-200 text-xs"
                  />
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="Cidade *"
                    required
                    className="col-span-1 px-2.5 py-1.5 rounded-lg bg-white border border-stone-200 text-xs"
                  />
                  <input
                    type="text"
                    maxLength={2}
                    value={stateUf}
                    onChange={(e) => setStateUf(e.target.value.toUpperCase())}
                    placeholder="UF *"
                    required
                    className="col-span-1 px-2.5 py-1.5 rounded-lg bg-white border border-stone-200 text-xs uppercase"
                  />
                </div>
                <input
                  type="text"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="Ponto de referência / instruções para entrega"
                  className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-stone-200 text-xs"
                />
              </div>
            )}
          </div>

          {/* 5. Itens na Sacola & Observações para a Cozinha */}
          <div className="space-y-2.5 pt-2 border-t border-stone-100">
            <div className="flex items-center justify-between">
              <label className="text-xs font-black uppercase tracking-wider text-stone-600">
                5. Itens do Pedido ({cart.reduce((s, i) => s + i.quantity, 0)})
              </label>
              {cart.length > 0 && (
                <button
                  type="button"
                  onClick={() => setCart([])}
                  className="text-[11px] text-red-600 hover:underline font-semibold"
                >
                  Limpar itens
                </button>
              )}
            </div>

            {cart.length === 0 ? (
              <div className="py-6 text-center rounded-xl bg-stone-50 border border-dashed border-stone-200 text-xs text-stone-400">
                Clique em &ldquo;+ Adicionar&rdquo; nos produtos à esquerda para montar o pedido.
              </div>
            ) : (
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {cart.map((item) => (
                  <div
                    key={item.variantId}
                    className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-stone-50 border border-stone-200/80 text-xs"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-stone-900 truncate">
                        {item.productName}{' '}
                        <span className="font-normal text-stone-500">({item.variantName})</span>
                      </div>
                      <div className="text-[11px] text-stone-500 font-mono">
                        {formatBrl(item.unitPriceInCents)} un. • Subtotal:{' '}
                        <strong className="text-stone-800">
                          {formatBrl(item.unitPriceInCents * item.quantity)}
                        </strong>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleUpdateQuantity(item.variantId, -1)}
                        className="w-6 h-6 rounded bg-white border border-stone-200 flex items-center justify-center hover:bg-stone-100"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="w-6 text-center font-mono font-bold">{item.quantity}</span>
                      <button
                        type="button"
                        onClick={() => handleUpdateQuantity(item.variantId, 1)}
                        className="w-6 h-6 rounded bg-white border border-stone-200 flex items-center justify-center hover:bg-stone-100"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(item.variantId)}
                        className="p-1 text-stone-400 hover:text-red-600"
                        aria-label="Remover item"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Observações para a Cozinha */}
            <div className="space-y-1.5 pt-1">
              <label className="block text-[11px] font-bold text-stone-700">
                Observações para a Cozinha / Expedição
              </label>
              <textarea
                rows={2}
                value={kitchenNotes}
                onChange={(e) => setKitchenNotes(e.target.value)}
                placeholder="Ex: Sem cebola, ponto da carne, enviar talheres..."
                className="w-full px-3 py-2 rounded-xl bg-stone-50 border border-stone-200 text-xs text-stone-900"
              />
              <div className="flex items-center gap-1 flex-wrap">
                {QUICK_KITCHEN_NOTES.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => handleAppendQuickNote(tag)}
                    className="px-2 py-0.5 rounded-md bg-stone-100 hover:bg-amber-100 text-stone-700 hover:text-amber-900 text-[10px] font-semibold transition-colors"
                  >
                    + {tag}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 6. Pagamento, Troco e Desconto Autorizado */}
          <div className="space-y-3 pt-2 border-t border-stone-100">
            <label className="block text-xs font-black uppercase tracking-wider text-stone-600">
              6. Forma de Pagamento & Condição Financeira
            </label>

            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'pix', label: 'Pix (QR / Copia e Cola)', icon: QrCode },
                { id: 'cash', label: 'Dinheiro', icon: Banknote },
                { id: 'card_on_delivery', label: 'Cartão na Entrega', icon: CreditCard },
                { id: 'pos_card', label: 'Maquininha POS (Balcão)', icon: CreditCard },
              ].map((pm) => {
                const Icon = pm.icon;
                const active = paymentMethod === pm.id;
                return (
                  <button
                    key={pm.id}
                    type="button"
                    onClick={() => {
                      setPaymentMethod(pm.id as OrderPaymentMethod);
                      if (pm.id === 'pix' || pm.id === 'card_on_delivery') {
                        setMarkAsPaidNow(false);
                      }
                    }}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all ${
                      active
                        ? 'bg-stone-900 text-white border-stone-900'
                        : 'bg-stone-50 text-stone-700 border-stone-200 hover:bg-stone-100'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{pm.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Campo de Troco quando Dinheiro */}
            {paymentMethod === 'cash' && (
              <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-emerald-950">Troco para quanto? (R$)</span>
                  {cashChangeReturnCents !== null && (
                    <span className="font-black text-emerald-700">
                      Troco a devolver: {formatBrl(cashChangeReturnCents)}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={cashChangeReais}
                    onChange={(e) => setCashChangeReais(e.target.value)}
                    placeholder="Ex: 100,00 (vazio = não precisa de troco)"
                    className="flex-1 px-3 py-1.5 rounded-lg bg-white border border-emerald-300 text-xs font-mono"
                  />
                  {[50, 100, 200].map((bill) => (
                    <button
                      key={bill}
                      type="button"
                      onClick={() => setCashChangeReais(String(bill))}
                      className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-emerald-100 border border-emerald-300 text-xs font-bold text-emerald-900"
                    >
                      R$ {bill}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Checkbox de Pagamento já recebido no balcão (apenas para Dinheiro ou Maquininha POS) */}
            {(paymentMethod === 'cash' || paymentMethod === 'pos_card') && (
              <label className="flex items-center gap-2 p-2.5 rounded-xl bg-stone-50 border border-stone-200 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={markAsPaidNow}
                  onChange={(e) => setMarkAsPaidNow(e.target.checked)}
                  className="rounded border-stone-300 text-emerald-600 focus:ring-emerald-500"
                />
                <span className="font-semibold text-stone-800">
                  Pagamento já recebido presencialmente no balcão (marcar como <strong>Pago</strong>)
                </span>
              </label>
            )}

            {/* Desconto e Entrada Direta no KDS */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
              <div>
                <label className="block text-[11px] font-semibold text-stone-600 mb-0.5">
                  Desconto Comercial (R$){' '}
                  {operatorRole !== 'tenant_admin' && (
                    <span className="text-[10px] text-stone-400">(Máx. 20%)</span>
                  )}
                </label>
                <input
                  type="text"
                  value={discountReais}
                  onChange={(e) => setDiscountReais(e.target.value)}
                  placeholder="0,00"
                  className="w-full px-3 py-1.5 rounded-xl bg-stone-50 border border-stone-200 text-xs font-mono"
                />
              </div>

              <div className="flex flex-col justify-end">
                <label className="flex items-center gap-2 p-2 rounded-xl bg-amber-50/70 border border-amber-200 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={confirmImmediately}
                    onChange={(e) => setConfirmImmediately(e.target.checked)}
                    className="rounded border-amber-400 text-amber-600 focus:ring-amber-500"
                  />
                  <span className="font-bold text-amber-950">
                    Enviar direto ao KDS (Confirmado)
                  </span>
                </label>
              </div>
            </div>
          </div>

          {/* Resumo de Totais e Botão de Finalização */}
          <div className="p-4 rounded-2xl bg-stone-900 text-white space-y-3">
            <div className="space-y-1 text-xs">
              <div className="flex justify-between text-stone-300">
                <span>Subtotal dos Itens:</span>
                <span className="font-mono">{formatBrl(subtotalCents)}</span>
              </div>
              {fulfillmentType === 'delivery' && (
                <div className="flex justify-between text-stone-300">
                  <span>Taxa de Entrega:</span>
                  <span className="font-mono">{formatBrl(deliveryFeeCents)}</span>
                </div>
              )}
              {discountCents > 0 && (
                <div className="flex justify-between text-amber-400 font-semibold">
                  <span>Desconto Aplicado:</span>
                  <span className="font-mono">-{formatBrl(discountCents)}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-black pt-1.5 border-t border-stone-700">
                <span>TOTAL DO PEDIDO:</span>
                <span className="font-mono text-emerald-400 text-lg">{formatBrl(totalCents)}</span>
              </div>
            </div>

            {submitError && (
              <div className="p-2.5 rounded-xl bg-red-500/20 border border-red-400 text-red-100 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-300" />
                <span>{submitError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={cart.length === 0 || isSubmitting}
              className="w-full py-3 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-stone-950 font-heading font-black text-sm flex items-center justify-center gap-2 transition-all shadow-md"
            >
              <Zap className="w-4 h-4" />
              <span>
                {isSubmitting
                  ? 'Registrando Pedido no KDS...'
                  : confirmImmediately
                  ? `Registrar Pedido & Enviar ao KDS (${formatBrl(totalCents)})`
                  : `Registrar Pedido como Pendente (${formatBrl(totalCents)})`}
              </span>
            </button>
          </div>
        </form>
      </div>

      {/* Modal de Impressão Térmica 58mm / 80mm */}
      <OrderPrintModal
        order={printModalOrder}
        tenantName={tenantName}
        defaultMode={printDefaultMode}
        onClose={() => setPrintModalOrder(null)}
      />
    </div>
  );
}

