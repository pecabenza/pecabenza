'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  Store,
  Save,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Power,
  Truck,
  CreditCard,
  MessageCircle,
  Printer,
} from 'lucide-react';
import type {
  StructuredBusinessHours,
  StorePaymentOption,
  CommercialReadinessResult,
  WeekdayKey,
} from '@/modules/commerce/store-config.engine';
import type { SiteMode } from '@/types/database.types';
import { parseStrictCurrencyCents } from '@/components/admin/store-config/StoreCurrencyUtils';
import { StoreReadinessBanner } from '@/components/admin/store-config/StoreReadinessBanner';
import { StoreOperationsTab } from '@/components/admin/store-config/StoreOperationsTab';
import { StoreDeliveryPricingTab } from '@/components/admin/store-config/StoreDeliveryPricingTab';
import { StorePaymentsTab } from '@/components/admin/store-config/StorePaymentsTab';
import { StoreCommunicationTab } from '@/components/admin/store-config/StoreCommunicationTab';
import { StorePrintTab } from '@/components/admin/store-config/StorePrintTab';
import { DistanceBandsEditor } from '@/components/admin/DistanceBandsEditor';

type AdminStoreTab = 'operations' | 'delivery' | 'payments' | 'communication' | 'print';

export default function LojaConfigPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [activeTab, setActiveTab] = useState<AdminStoreTab>('operations');

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
  const [pgProvider, setPgProvider] = useState<'mock' | 'asaas'>('mock');
  const [pgSandbox, setPgSandbox] = useState(true);
  const [pgExpirationMin, setPgExpirationMin] = useState(15);
  const [pgHasKey, setPgHasKey] = useState(false);
  const [pgMaskedKey, setPgMaskedKey] = useState<string | undefined>();
  const [pgApiKey, setPgApiKey] = useState('');
  const [pgWebhookSecret, setPgWebhookSecret] = useState('');
  const [saveGatewayCreds, setSaveGatewayCreds] = useState(false);
  const [tenantId, setTenantId] = useState<string>('');
  const [tenantLogoUrl, setTenantLogoUrl] = useState<string | null>(null);
  const [tenantNameLabel, setTenantNameLabel] = useState<string>('BENZA');
  const [testingAsaasMode, setTestingAsaasMode] = useState<'connection' | 'webhook' | null>(null);
  const [asaasTestResult, setAsaasTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [copiedWebhookUrl, setCopiedWebhookUrl] = useState(false);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/commerce-settings', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao carregar configurações.');

      setSiteMode(data.tenant?.site_mode || 'prelaunch');
      if (data.tenant?.id) setTenantId(data.tenant.id);
      if (data.tenant?.name) setTenantNameLabel(data.tenant.name);
      setReadiness(data.readiness || null);

      fetch('/api/admin/print-settings', { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .then((ps) => {
          if (ps?.logoUrl) setTenantLogoUrl(ps.logoUrl);
          if (ps?.tenantName) setTenantNameLabel(ps.tenantName);
        })
        .catch(() => {});

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
        const provider = data.paymentSettings.provider === 'asaas' ? 'asaas' : 'mock';
        setPgProvider(provider);
        setPgSandbox(Boolean(data.paymentSettings.sandboxMode));
        setPgExpirationMin(data.paymentSettings.pixExpirationMinutes || 15);
        setPgHasKey(Boolean(data.paymentSettings.hasApiKey));
        setPgMaskedKey(data.paymentSettings.maskedApiKey);
      }

      setHasUnsavedChanges(false);
    } catch (err: unknown) {
      setError((err as { message?: string })?.message || 'Erro ao carregar configurações.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  const markDirty = () => {
    if (!hasUnsavedChanges) setHasUnsavedChanges(true);
  };

  const togglePaymentMethod = (method: StorePaymentOption) => {
    if (!businessHours) return;
    const current = businessHours.enabled_payment_methods;
    const next = current.includes(method)
      ? current.filter((m) => m !== method)
      : [...current, method];
    setBusinessHours({ ...businessHours, enabled_payment_methods: next });
    markDirty();
  };

  const handleSave = async (overrideSiteMode?: SiteMode) => {
    if (!businessHours) return;
    setError(null);
    setSuccessMsg(null);

    // 1. Validação monetária estrita (sem fallback silencioso para 0)
    const feeParsed = parseStrictCurrencyCents(deliveryFeeReais, {
      fieldLabel: 'Taxa de Entrega',
      minCents: 0,
    });
    if (!feeParsed.valid || feeParsed.cents === null) {
      setError(feeParsed.error || 'Taxa de entrega inválida.');
      setActiveTab('delivery');
      return;
    }

    const freeParsed = parseStrictCurrencyCents(freeThresholdReais, {
      fieldLabel: 'Frete Grátis Acima',
      allowEmpty: true,
      minCents: 1,
    });
    if (!freeParsed.valid) {
      setError(freeParsed.error || 'Valor de frete grátis inválido.');
      setActiveTab('delivery');
      return;
    }

    const minOrderParsed = parseStrictCurrencyCents(minOrderReais, {
      fieldLabel: 'Pedido Mínimo',
      minCents: 0,
    });
    if (!minOrderParsed.valid || minOrderParsed.cents === null) {
      setError(minOrderParsed.error || 'Valor de pedido mínimo inválido.');
      setActiveTab('delivery');
      return;
    }

    // 2. Validação de horários de funcionamento (fechamento posterior à abertura)
    for (const day of Object.keys(businessHours.weekly_hours) as WeekdayKey[]) {
      const sched = businessHours.weekly_hours[day];
      if (!sched.closed && sched.open >= sched.close) {
        setError('Horário de fechamento deve ser posterior ao horário de abertura em todos os dias ativos.');
        setActiveTab('operations');
        return;
      }
    }

    setSaving(true);
    try {
      const targetSiteMode = overrideSiteMode || siteMode;

      const payload: Record<string, unknown> = {
        siteMode: targetSiteMode,
        deliveryEnabled,
        pickupEnabled,
        fixedDeliveryFeeCents: feeParsed.cents,
        freeDeliveryThresholdCents: freeParsed.cents,
        minOrderValueCents: minOrderParsed.cents,
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
      setHasUnsavedChanges(false);

      setSuccessMsg('Configurações comerciais salvas e aplicadas com sucesso!');
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: unknown) {
      setError((err as { message?: string })?.message || 'Erro ao salvar configurações.');
    } finally {
      setSaving(false);
    }
  };

  const handleTestAsaas = async (mode: 'connection' | 'webhook') => {
    setTestingAsaasMode(mode);
    setAsaasTestResult(null);
    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const webhookUrl = tenantId
        ? `${origin}/api/webhooks/payments/asaas?tenant_id=${tenantId}`
        : `${origin}/api/webhooks/payments/asaas`;

      const res = await fetch('/api/admin/payments/asaas/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          sandboxMode: pgSandbox,
          apiKey: pgApiKey.trim() || undefined,
          webhookSecret: pgWebhookSecret.trim() || undefined,
          expectedWebhookUrl: webhookUrl,
        }),
      });
      const data = await res.json();
      setAsaasTestResult({
        ok: Boolean(data.ok),
        message: data.ok ? data.message : data.error || 'Falha ao testar integração Asaas.',
      });
    } catch (err: unknown) {
      setAsaasTestResult({
        ok: false,
        message: (err as { message?: string })?.message || 'Erro de conexão ao testar Asaas.',
      });
    } finally {
      setTestingAsaasMode(null);
    }
  };

  if (loading) {
    return (
      <div className="p-8 text-center text-stone-500 text-sm">
        Carregando configurações comerciais da loja...
      </div>
    );
  }

  if (!businessHours) {
    return (
      <div className="p-8 max-w-xl mx-auto">
        <div className="p-6 rounded-2xl bg-red-50 border border-red-200 text-center space-y-4">
          <AlertTriangle className="w-8 h-8 text-red-600 mx-auto" />
          <div className="space-y-1">
            <h2 className="font-bold text-stone-900 text-base">
              Não foi possível carregar as configurações da loja
            </h2>
            <p className="text-xs text-red-700">
              {error || 'Verifique sua sessão ou conexão com o servidor e tente novamente.'}
            </p>
          </div>
          <button
            type="button"
            onClick={loadConfig}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-stone-900 text-white text-xs font-bold hover:bg-stone-800"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  const tabs: Array<{ id: AdminStoreTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'operations', label: 'Operação & Horários', icon: Power },
    { id: 'delivery', label: 'Entregas & Frete', icon: Truck },
    { id: 'payments', label: 'Pagamentos & Pix', icon: CreditCard },
    { id: 'communication', label: 'Comunicação & QR', icon: MessageCircle },
    { id: 'print', label: 'Impressão', icon: Printer },
  ];

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

        <div className="flex flex-wrap items-center gap-2">
          {hasUnsavedChanges && (
            <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 text-xs font-bold border border-amber-300">
              Alterações não salvas
            </span>
          )}

          <button
            type="button"
            onClick={loadConfig}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-stone-300 bg-white text-stone-700 text-sm font-medium hover:bg-stone-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Recarregar
          </button>

          <button
            type="button"
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

      {/* Checklist de Prontidão Comercial */}
      {readiness && (
        <StoreReadinessBanner
          siteMode={siteMode}
          readiness={readiness}
          saving={saving}
          hasUnsavedChanges={hasUnsavedChanges}
          onActivateCommerce={() => handleSave('commerce')}
          onDeactivateToPrelaunch={() => handleSave('prelaunch')}
        />
      )}

      {/* Navegação por Abas */}
      <div className="flex flex-wrap gap-2 border-b border-stone-200 pb-3" role="tablist">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-colors ${
                active
                  ? 'bg-stone-900 text-white shadow-sm'
                  : 'bg-white border border-stone-200 text-stone-700 hover:bg-stone-50'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {activeTab === 'operations' && (
        <StoreOperationsTab
          deliveryEnabled={deliveryEnabled}
          pickupEnabled={pickupEnabled}
          asapEnabled={asapEnabled}
          scheduledEnabled={scheduledEnabled}
          businessHours={businessHours}
          onChangeDeliveryEnabled={(v) => {
            setDeliveryEnabled(v);
            markDirty();
          }}
          onChangePickupEnabled={(v) => {
            setPickupEnabled(v);
            markDirty();
          }}
          onChangeAsapEnabled={(v) => {
            setAsapEnabled(v);
            markDirty();
          }}
          onChangeScheduledEnabled={(v) => {
            setScheduledEnabled(v);
            markDirty();
          }}
          onChangeBusinessHours={(next) => {
            setBusinessHours(next);
            markDirty();
          }}
        />
      )}

      {activeTab === 'delivery' && (
        <div className="space-y-6">
          <StoreDeliveryPricingTab
            deliveryFeeReais={deliveryFeeReais}
            freeThresholdReais={freeThresholdReais}
            minOrderReais={minOrderReais}
            estDeliveryMin={estDeliveryMin}
            estPickupMin={estPickupMin}
            onChangeDeliveryFeeReais={(v) => {
              setDeliveryFeeReais(v);
              markDirty();
            }}
            onChangeFreeThresholdReais={(v) => {
              setFreeThresholdReais(v);
              markDirty();
            }}
            onChangeMinOrderReais={(v) => {
              setMinOrderReais(v);
              markDirty();
            }}
            onChangeEstDeliveryMin={(v) => {
              setEstDeliveryMin(v);
              markDirty();
            }}
            onChangeEstPickupMin={(v) => {
              setEstPickupMin(v);
              markDirty();
            }}
          />
          <DistanceBandsEditor />
        </div>
      )}

      {activeTab === 'payments' && (
        <StorePaymentsTab
          tenantId={tenantId}
          enabledMethods={businessHours.enabled_payment_methods}
          pgProvider={pgProvider}
          pgSandbox={pgSandbox}
          pgHasKey={pgHasKey}
          pgMaskedKey={pgMaskedKey}
          pgApiKey={pgApiKey}
          pgWebhookSecret={pgWebhookSecret}
          saveGatewayCreds={saveGatewayCreds}
          testingAsaasMode={testingAsaasMode}
          asaasTestResult={asaasTestResult}
          copiedWebhookUrl={copiedWebhookUrl}
          onTogglePaymentMethod={togglePaymentMethod}
          onChangePgProvider={(p) => {
            setPgProvider(p);
            markDirty();
          }}
          onChangePgSandbox={(s) => {
            setPgSandbox(s);
            markDirty();
          }}
          onChangePgApiKey={(v) => {
            setPgApiKey(v);
            markDirty();
          }}
          onChangePgWebhookSecret={(v) => {
            setPgWebhookSecret(v);
            markDirty();
          }}
          onChangeSaveGatewayCreds={(v) => {
            setSaveGatewayCreds(v);
            markDirty();
          }}
          onTestAsaas={handleTestAsaas}
          onCopyWebhookUrl={() => {
            const url = `${window.location.origin}/api/webhooks/payments/asaas${
              tenantId ? `?tenant_id=${tenantId}` : ''
            }`;
            navigator.clipboard.writeText(url);
            setCopiedWebhookUrl(true);
            setTimeout(() => setCopiedWebhookUrl(false), 2000);
          }}
        />
      )}

      {activeTab === 'communication' && (
        <StoreCommunicationTab
          businessHours={businessHours}
          onChangeBusinessHours={(next) => {
            setBusinessHours(next);
            markDirty();
          }}
        />
      )}

      {activeTab === 'print' && (
        <StorePrintTab
          businessHours={businessHours}
          logoUrl={tenantLogoUrl}
          tenantName={tenantNameLabel}
          onChangeBusinessHours={(next) => {
            setBusinessHours(next);
            markDirty();
          }}
        />
      )}
    </div>
  );
}
