'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  Store,
  Save,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  Clock,
  Truck,
  CreditCard,
  Power,
  Lock,
  MessageCircle,
} from 'lucide-react';
import {
  DEFAULT_WHATSAPP_TEMPLATES,
  type WhatsAppMessageStage,
} from '@/lib/whatsapp/order-messages';
import {
  DEFAULT_DELIVERED_THANK_YOU_MESSAGE,
  type StructuredBusinessHours,
  type StorePaymentOption,
  type WeekdayKey,
  type CommercialReadinessResult,
} from '@/modules/commerce/store-config.engine';
import type { SiteMode } from '@/types/database.types';

const DAY_LABELS: Record<WeekdayKey, string> = {
  mon: 'Segunda-feira',
  tue: 'Terça-feira',
  wed: 'Quarta-feira',
  thu: 'Quinta-feira',
  fri: 'Sexta-feira',
  sat: 'Sábado',
  sun: 'Domingo',
};

const DAY_ORDER: WeekdayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

export default function LojaConfigPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [siteMode, setSiteMode] = useState<SiteMode>('prelaunch');
  const [readiness, setReadiness] = useState<CommercialReadinessResult | null>(null);

  // Configurações comerciais
  const [deliveryEnabled, setDeliveryEnabled] = useState(true);
  const [pickupEnabled, setPickupEnabled] = useState(true);
  const [deliveryFeeReais, setDeliveryFeeReais] = useState('12.00');
  const [freeThresholdReais, setFreeThresholdReais] = useState('');
  const [minOrderReais, setMinOrderReais] = useState('30.00');
  const [asapEnabled, setAsapEnabled] = useState(true);
  const [scheduledEnabled, setScheduledEnabled] = useState(true);
  const [estDeliveryMin, setEstDeliveryMin] = useState(60);
  const [estPickupMin, setEstPickupMin] = useState(30);

  // Horários, pausa e meios de pagamento
  const [businessHours, setBusinessHours] = useState<StructuredBusinessHours | null>(null);

  // Gateway Pix (Asaas / Mock)
  const [pgProvider, setPgProvider] = useState<'mock' | 'asaas' | 'mercadopago'>('mock');
  const [pgSandbox, setPgSandbox] = useState(true);
  const [pgExpirationMin, setPgExpirationMin] = useState(15);
  const [pgHasKey, setPgHasKey] = useState(false);
  const [pgMaskedKey, setPgMaskedKey] = useState<string | undefined>();
  const [pgApiKey, setPgApiKey] = useState('');
  const [pgWebhookSecret, setPgWebhookSecret] = useState('');
  const [saveGatewayCreds, setSaveGatewayCreds] = useState(false);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/commerce-settings', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao carregar configurações.');

      setSiteMode(data.tenant?.site_mode || 'prelaunch');
      setReadiness(data.readiness || null);

      const cs = data.commerceSettings;
      setDeliveryEnabled(Boolean(cs.delivery_enabled));
      setPickupEnabled(Boolean(cs.pickup_enabled));
      setDeliveryFeeReais(((cs.fixed_delivery_fee_cents || 0) / 100).toFixed(2));
      setFreeThresholdReais(
        cs.free_delivery_threshold_cents ? (cs.free_delivery_threshold_cents / 100).toFixed(2) : ''
      );
      setMinOrderReais(((cs.min_order_value_cents || 0) / 100).toFixed(2));
      setAsapEnabled(Boolean(cs.asap_enabled));
      setScheduledEnabled(Boolean(cs.scheduled_enabled));
      setEstDeliveryMin(cs.estimated_delivery_time_min || 60);
      setEstPickupMin(cs.estimated_pickup_time_min || 30);

      setBusinessHours(data.businessHours);

      if (data.paymentSettings) {
        setPgProvider(data.paymentSettings.provider || 'mock');
        setPgSandbox(Boolean(data.paymentSettings.sandboxMode));
        setPgExpirationMin(data.paymentSettings.pixExpirationMinutes || 15);
        setPgHasKey(Boolean(data.paymentSettings.hasApiKey));
        setPgMaskedKey(data.paymentSettings.maskedApiKey);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const togglePaymentMethod = (method: StorePaymentOption) => {
    if (!businessHours) return;
    const current = businessHours.enabled_payment_methods;
    const next = current.includes(method)
      ? current.filter((m) => m !== method)
      : [...current, method];
    setBusinessHours({ ...businessHours, enabled_payment_methods: next });
  };

  const handleSave = async (overrideSiteMode?: SiteMode) => {
    if (!businessHours) return;
    setSaving(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const targetSiteMode = overrideSiteMode || siteMode;
      const fixedFeeCents = Math.max(0, Math.round((parseFloat(deliveryFeeReais.replace(',', '.')) || 0) * 100));
      const freeThreshNum = parseFloat(freeThresholdReais.replace(',', '.'));
      const freeThresholdCents = !isNaN(freeThreshNum) && freeThreshNum > 0 ? Math.round(freeThreshNum * 100) : null;
      const minOrderCents = Math.max(0, Math.round((parseFloat(minOrderReais.replace(',', '.')) || 0) * 100));

      const payload: Record<string, any> = {
        siteMode: targetSiteMode,
        deliveryEnabled,
        pickupEnabled,
        fixedDeliveryFeeCents: fixedFeeCents,
        freeDeliveryThresholdCents: freeThresholdCents,
        minOrderValueCents: minOrderCents,
        asapEnabled,
        scheduledEnabled,
        estimatedDeliveryTimeMin: Number(estDeliveryMin) || 60,
        estimatedPickupTimeMin: Number(estPickupMin) || 30,
        businessHours,
      };

      if (saveGatewayCreds) {
        payload.paymentGateway = {
          provider: pgProvider,
          isActive: true,
          pixEnabled: true,
          pixExpirationMinutes: Number(pgExpirationMin) || 15,
          sandboxMode: pgSandbox,
          ...(pgApiKey.trim() ? { apiKey: pgApiKey.trim() } : {}),
          ...(pgWebhookSecret.trim() ? { webhookSecret: pgWebhookSecret.trim() } : {}),
        };
      }

      const res = await fetch('/api/admin/commerce-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao salvar configurações da loja.');
      }

      setSiteMode(data.tenant?.site_mode || targetSiteMode);
      setReadiness(data.readiness || null);
      setBusinessHours(data.businessHours);
      setPgApiKey('');
      setPgWebhookSecret('');
      setSaveGatewayCreds(false);
      if (data.paymentSettings) {
        setPgHasKey(Boolean(data.paymentSettings.hasApiKey));
        setPgMaskedKey(data.paymentSettings.maskedApiKey);
      }

      setSuccessMsg('Configurações comerciais salvas e aplicadas com sucesso!');
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading || !businessHours) {
    return (
      <div className="p-8 text-center text-stone-500 text-sm">
        Carregando configurações comerciais da loja...
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-stone-900 flex items-center gap-2.5">
            <Store className="w-6 h-6 text-amber-600" />
            Configurações Comerciais & Abertura da Loja
          </h1>
          <p className="text-sm text-stone-500 mt-1">
            Gerencie frete, pedido mínimo, horários, formas de pagamento e verificação de prontidão para vendas online.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadConfig}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-stone-300 bg-white text-stone-700 text-sm font-medium hover:bg-stone-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Recarregar
          </button>

          <button
            onClick={() => handleSave()}
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700 disabled:opacity-50 shadow-sm"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Salvando...' : 'Salvar Configurações'}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm flex items-start gap-2.5">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Checklist de Prontidão Comercial (B5) */}
      {readiness && (
        <div
          className={`rounded-2xl border p-5 space-y-4 ${
            readiness.canActivate
              ? 'bg-emerald-50/70 border-emerald-200'
              : 'bg-amber-50/70 border-amber-200'
          }`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <ShieldCheck
                className={`w-6 h-6 ${readiness.canActivate ? 'text-emerald-600' : 'text-amber-600'}`}
              />
              <div>
                <h2 className="font-bold text-stone-900 text-base">
                  Prontidão Comercial da Loja ({siteMode === 'commerce' ? 'Vendas Ativas' : siteMode === 'prelaunch' ? 'Pré-Lançamento' : 'Institucional'})
                </h2>
                <p className="text-xs text-stone-600">
                  {readiness.canActivate
                    ? 'Todos os requisitos obrigatórios estão validados para receber vendas públicas.'
                    : 'Resolva os itens pendentes abaixo e salve as configurações antes de ativar vendas online.'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {siteMode !== 'commerce' ? (
                <button
                  type="button"
                  disabled={!readiness.canActivate || saving}
                  onClick={() => handleSave('commerce')}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
                >
                  {!readiness.canActivate && <Lock className="w-3.5 h-3.5" />}
                  Ativar Loja para Vendas (Commerce)
                </button>
              ) : (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => handleSave('prelaunch')}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-stone-800 text-white text-xs font-bold hover:bg-stone-700"
                >
                  Voltar p/ Pré-Lançamento
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {readiness.checks.map((chk) => (
              <div
                key={chk.id}
                className={`p-3 rounded-xl border text-xs flex items-start gap-2 bg-white ${
                  chk.passed ? 'border-emerald-200' : 'border-red-200'
                }`}
              >
                {chk.passed ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                )}
                <div>
                  <span className="font-bold text-stone-900 block">{chk.label}</span>
                  <span className="text-stone-500">{chk.message}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Grid: Pausa / Modo + Taxas & Modalidades */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Card 1: Status Operacional (Aberta/Pausada) & Taxas */}
        <div className="bg-white rounded-xl border border-stone-200 shadow-sm p-5 space-y-5">
          <div className="flex items-center justify-between border-b border-stone-100 pb-3">
            <h3 className="font-bold text-stone-900 flex items-center gap-2">
              <Power className="w-4 h-4 text-amber-600" />
              Status Operacional & Modalidades
            </h3>

            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={businessHours.is_store_open}
                onChange={(e) =>
                  setBusinessHours({ ...businessHours, is_store_open: e.target.checked })
                }
                className="rounded border-stone-300 text-emerald-600"
              />
              <span
                className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                  businessHours.is_store_open
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-red-100 text-red-800'
                }`}
              >
                {businessHours.is_store_open ? 'Loja Aberta' : 'Loja Pausada'}
              </span>
            </label>
          </div>

          {!businessHours.is_store_open && (
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Mensagem exibida aos clientes enquanto pausada
              </label>
              <input
                type="text"
                value={businessHours.pause_reason || ''}
                onChange={(e) =>
                  setBusinessHours({ ...businessHours, pause_reason: e.target.value })
                }
                placeholder="Ex: Pausa rápida na cozinha. Retornamos em 30 minutos."
                className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm"
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 text-sm">
            <label className="flex items-center gap-2 p-3 rounded-lg border border-stone-200 cursor-pointer">
              <input
                type="checkbox"
                checked={deliveryEnabled}
                onChange={(e) => setDeliveryEnabled(e.target.checked)}
                className="rounded border-stone-300 text-amber-600"
              />
              <span className="font-medium text-stone-800">Entrega (Delivery)</span>
            </label>
            <label className="flex items-center gap-2 p-3 rounded-lg border border-stone-200 cursor-pointer">
              <input
                type="checkbox"
                checked={pickupEnabled}
                onChange={(e) => setPickupEnabled(e.target.checked)}
                className="rounded border-stone-300 text-amber-600"
              />
              <span className="font-medium text-stone-800">Retirada no Local</span>
            </label>
            <label className="flex items-center gap-2 p-3 rounded-lg border border-stone-200 cursor-pointer">
              <input
                type="checkbox"
                checked={asapEnabled}
                onChange={(e) => setAsapEnabled(e.target.checked)}
                className="rounded border-stone-300 text-amber-600"
              />
              <span className="font-medium text-stone-800">Entrega Imediata</span>
            </label>
            <label className="flex items-center gap-2 p-3 rounded-lg border border-stone-200 cursor-pointer">
              <input
                type="checkbox"
                checked={scheduledEnabled}
                onChange={(e) => setScheduledEnabled(e.target.checked)}
                className="rounded border-stone-300 text-amber-600"
              />
              <span className="font-medium text-stone-800">Pedidos Agendados</span>
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Taxa de Entrega (R$)
              </label>
              <input
                type="text"
                value={deliveryFeeReais}
                onChange={(e) => setDeliveryFeeReais(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Frete Grátis Acima (R$)
              </label>
              <input
                type="text"
                value={freeThresholdReais}
                onChange={(e) => setFreeThresholdReais(e.target.value)}
                placeholder="Opcional"
                className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Pedido Mínimo (R$)
              </label>
              <input
                type="text"
                value={minOrderReais}
                onChange={(e) => setMinOrderReais(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Tempo Estimado Entrega (min)
              </label>
              <input
                type="number"
                min={5}
                value={estDeliveryMin}
                onChange={(e) => setEstDeliveryMin(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Tempo Estimado Retirada (min)
              </label>
              <input
                type="number"
                min={5}
                value={estPickupMin}
                onChange={(e) => setEstPickupMin(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm"
              />
            </div>
          </div>
        </div>

        {/* Card 2: Formas de Pagamento Habilitadas + Asaas Opcional */}
        <div className="bg-white rounded-xl border border-stone-200 shadow-sm p-5 space-y-5">
          <div className="border-b border-stone-100 pb-3">
            <h3 className="font-bold text-stone-900 flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-amber-600" />
              Formas de Pagamento Aceitas no Site
            </h3>
            <p className="text-xs text-stone-500 mt-0.5">
              Você pode operar no piloto com pagamento na entrega (Dinheiro/Cartão) mesmo antes de ativar o Asaas.
            </p>
          </div>

          <div className="space-y-2.5 text-sm">
            {[
              {
                id: 'cash' as StorePaymentOption,
                title: 'Dinheiro na Entrega / Retirada',
                desc: 'Cliente informa se precisa de troco no checkout.',
              },
              {
                id: 'card_on_delivery' as StorePaymentOption,
                title: 'Cartão na Entrega / Maquininha',
                desc: 'Motoboy ou balcão leva a maquininha POS.',
              },
              {
                id: 'pix' as StorePaymentOption,
                title: 'Pix Online (QR Code Automático)',
                desc: 'Exige credenciais de gateway (ex: Asaas) configuradas abaixo.',
              },
            ].map((opt) => {
              const checked = businessHours.enabled_payment_methods.includes(opt.id);
              return (
                <label
                  key={opt.id}
                  className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                    checked ? 'border-amber-400 bg-amber-50/50' : 'border-stone-200 hover:bg-stone-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => togglePaymentMethod(opt.id)}
                    className="mt-1 rounded border-stone-300 text-amber-600"
                  />
                  <div>
                    <span className="font-bold text-stone-900 block text-xs">{opt.title}</span>
                    <span className="text-xs text-stone-500">{opt.desc}</span>
                  </div>
                </label>
              );
            })}
          </div>

          {/* Configuração Opcional do Gateway Asaas */}
          <div className="pt-3 border-t border-stone-100 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-stone-700 uppercase">
                Integração Gateway Pix ({pgProvider.toUpperCase()} {pgHasKey ? '• Chave Salva' : '• Sem Chave'})
              </span>
              <label className="inline-flex items-center gap-1.5 text-xs text-amber-700 font-semibold cursor-pointer">
                <input
                  type="checkbox"
                  checked={saveGatewayCreds}
                  onChange={(e) => setSaveGatewayCreds(e.target.checked)}
                  className="rounded border-stone-300 text-amber-600"
                />
                <span>Alterar Gateway</span>
              </label>
            </div>

            {pgMaskedKey && (
              <p className="text-[11px] text-stone-500 font-mono">
                Chave configurada: {pgMaskedKey} ({pgSandbox ? 'Sandbox' : 'Produção'})
              </p>
            )}

            {saveGatewayCreds && (
              <div className="p-3 rounded-xl bg-stone-50 border border-stone-200 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-stone-700 mb-1">Provedor</label>
                    <select
                      value={pgProvider}
                      onChange={(e) => setPgProvider(e.target.value as any)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-stone-300 text-xs"
                    >
                      <option value="mock">Mock (Simulação)</option>
                      <option value="asaas">Asaas Pix</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-stone-700 mb-1">Ambiente</label>
                    <select
                      value={pgSandbox ? 'sandbox' : 'prod'}
                      onChange={(e) => setPgSandbox(e.target.value === 'sandbox')}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-stone-300 text-xs"
                    >
                      <option value="sandbox">Sandbox (Testes)</option>
                      <option value="prod">Produção Real</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-stone-700 mb-1">
                    API Key Asaas (criptografada em AES-256-GCM)
                  </label>
                  <input
                    type="password"
                    value={pgApiKey}
                    onChange={(e) => setPgApiKey(e.target.value)}
                    placeholder={pgHasKey ? 'Deixe em branco para manter a chave atual' : '$aact_...'}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-stone-300 text-xs font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-stone-700 mb-1">
                    Webhook Secret (opcional)
                  </label>
                  <input
                    type="password"
                    value={pgWebhookSecret}
                    onChange={(e) => setPgWebhookSecret(e.target.value)}
                    placeholder="Token de validação de webhook"
                    className="w-full px-2.5 py-1.5 rounded-lg border border-stone-300 text-xs font-mono"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Card 3: Horários de Funcionamento */}
      <div className="bg-white rounded-xl border border-stone-200 shadow-sm p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-100 pb-3">
          <div>
            <h3 className="font-bold text-stone-900 flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-600" />
              Horários de Funcionamento
            </h3>
            <p className="text-xs text-stone-500">
              Configure os horários de atendimento e defina se pedidos imediatos devem ser bloqueados fora do expediente.
            </p>
          </div>

          <label className="inline-flex items-center gap-2 text-xs font-semibold text-stone-700 cursor-pointer">
            <input
              type="checkbox"
              checked={businessHours.enforce_schedule}
              onChange={(e) =>
                setBusinessHours({ ...businessHours, enforce_schedule: e.target.checked })
              }
              className="rounded border-stone-300 text-amber-600"
            />
            <span>Validar horário automaticamente no checkout</span>
          </label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {DAY_ORDER.map((day) => {
            const sched = businessHours.weekly_hours[day];
            return (
              <div
                key={day}
                className={`p-3 rounded-xl border text-xs space-y-2 ${
                  sched.closed ? 'bg-stone-50 border-stone-200 opacity-75' : 'bg-white border-stone-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-stone-800">{DAY_LABELS[day]}</span>
                  <label className="inline-flex items-center gap-1 text-[11px] text-stone-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={sched.closed}
                      onChange={(e) =>
                        setBusinessHours({
                          ...businessHours,
                          weekly_hours: {
                            ...businessHours.weekly_hours,
                            [day]: { ...sched, closed: e.target.checked },
                          },
                        })
                      }
                      className="rounded border-stone-300 text-red-600"
                    />
                    <span>Fechado</span>
                  </label>
                </div>

                {!sched.closed && (
                  <div className="flex items-center gap-2">
                    <input
                      type="time"
                      value={sched.open}
                      onChange={(e) =>
                        setBusinessHours({
                          ...businessHours,
                          weekly_hours: {
                            ...businessHours.weekly_hours,
                            [day]: { ...sched, open: e.target.value },
                          },
                        })
                      }
                      className="flex-1 px-2 py-1 rounded border border-stone-300"
                    />
                    <span>às</span>
                    <input
                      type="time"
                      value={sched.close}
                      onChange={(e) =>
                        setBusinessHours({
                          ...businessHours,
                          weekly_hours: {
                            ...businessHours.weekly_hours,
                            [day]: { ...sched, close: e.target.value },
                          },
                        })
                      }
                      className="flex-1 px-2 py-1 rounded border border-stone-300"
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Card 4: Mensagens Personalizáveis do WhatsApp Business */}
      <div className="bg-white rounded-xl border border-stone-200 shadow-sm p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-100 pb-3">
          <div>
            <h3 className="font-bold text-stone-900 flex items-center gap-2">
              <MessageCircle className="w-4 h-4 text-emerald-600" />
              Mensagens WhatsApp Business
            </h3>
            <p className="text-xs text-stone-500">
              Personalize os textos enviados ao cliente em cada etapa do pedido. Variáveis disponíveis:{' '}
              <code className="px-1 py-0.5 rounded bg-stone-100 text-[11px]">{'{cliente}'}</code>{' '}
              <code className="px-1 py-0.5 rounded bg-stone-100 text-[11px]">{'{pedido}'}</code>{' '}
              <code className="px-1 py-0.5 rounded bg-stone-100 text-[11px]">{'{total}'}</code>{' '}
              <code className="px-1 py-0.5 rounded bg-stone-100 text-[11px]">{'{itens}'}</code>{' '}
              <code className="px-1 py-0.5 rounded bg-stone-100 text-[11px]">{'{pagamento}'}</code>{' '}
              <code className="px-1 py-0.5 rounded bg-stone-100 text-[11px]">{'{rastreio}'}</code>
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              setBusinessHours({
                ...businessHours,
                whatsapp_templates: { ...DEFAULT_WHATSAPP_TEMPLATES },
              })
            }
            className="text-xs font-semibold text-stone-600 hover:text-stone-900 underline shrink-0"
          >
            Restaurar padrão
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(
            [
              { key: 'confirmed', label: '1. Pedido Confirmado' },
              { key: 'ready', label: '2. Pronto / Finalizado' },
              { key: 'out_for_delivery', label: '3. Saiu para Entrega' },
              { key: 'delivered', label: '4. Entregue / Finalizado' },
            ] as Array<{ key: WhatsAppMessageStage; label: string }>
          ).map((item) => (
            <div key={item.key} className="space-y-1.5">
              <label className="block text-xs font-semibold text-stone-700">
                {item.label}
              </label>
              <textarea
                rows={5}
                value={
                  businessHours.whatsapp_templates?.[item.key] ??
                  DEFAULT_WHATSAPP_TEMPLATES[item.key]
                }
                onChange={(e) =>
                  setBusinessHours({
                    ...businessHours,
                    whatsapp_templates: {
                      ...businessHours.whatsapp_templates,
                      [item.key]: e.target.value,
                    },
                  })
                }
                className="w-full p-3 rounded-lg border border-stone-300 text-xs text-stone-800 leading-relaxed focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
              />
            </div>
          ))}
        </div>

        {/* Nota configurável de agradecimento na página pública /pedido/[token] */}
        <div className="pt-4 border-t border-stone-100 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <label className="block text-xs font-semibold text-stone-700">
              Nota de Agradecimento após Entrega (Página de Acompanhamento /pedido/[código])
            </label>
            <button
              type="button"
              onClick={() =>
                setBusinessHours({
                  ...businessHours,
                  delivered_thank_you_message: DEFAULT_DELIVERED_THANK_YOU_MESSAGE,
                })
              }
              className="text-xs font-semibold text-stone-600 hover:text-stone-900 underline shrink-0"
            >
              Restaurar nota padrão
            </button>
          </div>
          <textarea
            rows={3}
            maxLength={600}
            value={
              businessHours.delivered_thank_you_message ??
              DEFAULT_DELIVERED_THANK_YOU_MESSAGE
            }
            onChange={(e) =>
              setBusinessHours({
                ...businessHours,
                delivered_thank_you_message: e.target.value,
              })
            }
            placeholder="Ex.: Obrigado por escolher a nossa cozinha! Esperamos que aproveite sua refeição. Bom apetite!"
            className="w-full p-3 rounded-lg border border-stone-300 text-xs text-stone-800 leading-relaxed focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
          />
          <p className="text-[11px] text-stone-500">
            Exibida em destaque na página pública de acompanhamento quando o pedido muda para o status <strong>Entregue</strong>.
          </p>
        </div>
      </div>
    </div>
  );
}

