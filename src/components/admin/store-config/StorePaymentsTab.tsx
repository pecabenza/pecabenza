'use client';

import React from 'react';
import {
  CreditCard,
  Copy,
  Check,
  PlugZap,
  Webhook,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import type { StorePaymentOption } from '@/modules/commerce/store-config.engine';

interface StorePaymentsTabProps {
  tenantId: string;
  enabledMethods: StorePaymentOption[];
  pgProvider: 'mock' | 'asaas';
  pgSandbox: boolean;
  pgHasKey: boolean;
  pgMaskedKey?: string;
  pgApiKey: string;
  pgWebhookSecret: string;
  saveGatewayCreds: boolean;
  testingAsaasMode: 'connection' | 'webhook' | null;
  asaasTestResult: { ok: boolean; message: string } | null;
  copiedWebhookUrl: boolean;
  onTogglePaymentMethod: (method: StorePaymentOption) => void;
  onChangePgProvider: (p: 'mock' | 'asaas') => void;
  onChangePgSandbox: (sandbox: boolean) => void;
  onChangePgApiKey: (v: string) => void;
  onChangePgWebhookSecret: (v: string) => void;
  onChangeSaveGatewayCreds: (v: boolean) => void;
  onTestAsaas: (mode: 'connection' | 'webhook') => void;
  onCopyWebhookUrl: () => void;
}

export function StorePaymentsTab({
  tenantId,
  enabledMethods,
  pgProvider,
  pgSandbox,
  pgHasKey,
  pgMaskedKey,
  pgApiKey,
  pgWebhookSecret,
  saveGatewayCreds,
  testingAsaasMode,
  asaasTestResult,
  copiedWebhookUrl,
  onTogglePaymentMethod,
  onChangePgProvider,
  onChangePgSandbox,
  onChangePgApiKey,
  onChangePgWebhookSecret,
  onChangeSaveGatewayCreds,
  onTestAsaas,
  onCopyWebhookUrl,
}: StorePaymentsTabProps) {
  const webhookUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/api/webhooks/payments/asaas${tenantId ? `?tenant_id=${tenantId}` : ''}`
      : `/api/webhooks/payments/asaas${tenantId ? `?tenant_id=${tenantId}` : ''}`;

  return (
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
            desc: 'Exige credenciais de gateway (Asaas) configuradas abaixo.',
          },
        ].map((opt) => {
          const checked = enabledMethods.includes(opt.id);
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
                onChange={() => onTogglePaymentMethod(opt.id)}
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
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-stone-700 uppercase">
              Integração Gateway Pix ({pgProvider.toUpperCase()} {pgHasKey ? '• Chave Salva' : '• Sem Chave'})
            </span>
            <span
              className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                pgSandbox ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
              }`}
            >
              {pgSandbox ? 'Ambiente Sandbox' : 'Produção Real'}
            </span>
          </div>
          <label className="inline-flex items-center gap-1.5 text-xs text-amber-700 font-semibold cursor-pointer">
            <input
              type="checkbox"
              checked={saveGatewayCreds}
              onChange={(e) => onChangeSaveGatewayCreds(e.target.checked)}
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-stone-700 mb-1">Provedor</label>
                <select
                  value={pgProvider}
                  onChange={(e) => onChangePgProvider(e.target.value as 'mock' | 'asaas')}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-stone-300 text-xs bg-white"
                >
                  <option value="mock">Mock (Simulação)</option>
                  <option value="asaas">Asaas Pix</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-stone-700 mb-1">Ambiente</label>
                <select
                  value={pgSandbox ? 'sandbox' : 'prod'}
                  onChange={(e) => onChangePgSandbox(e.target.value === 'sandbox')}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-stone-300 text-xs bg-white"
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
                onChange={(e) => onChangePgApiKey(e.target.value)}
                placeholder={pgHasKey ? 'Deixe em branco para manter a chave atual' : '$aact_...'}
                className="w-full px-2.5 py-1.5 rounded-lg border border-stone-300 text-xs font-mono bg-white"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-stone-700 mb-1">
                Webhook Secret (autenticidade obrigatória via asaas-access-token)
              </label>
              <input
                type="password"
                value={pgWebhookSecret}
                onChange={(e) => onChangePgWebhookSecret(e.target.value)}
                placeholder="Token de validação de webhook"
                className="w-full px-2.5 py-1.5 rounded-lg border border-stone-300 text-xs font-mono bg-white"
              />
            </div>

            <div className="pt-2 border-t border-stone-200 space-y-1.5">
              <label className="block text-[11px] font-semibold text-stone-700">
                URL do Webhook Asaas (copie e cole no painel da Asaas)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={webhookUrl}
                  className="flex-1 px-2.5 py-1.5 rounded-lg border border-stone-300 bg-white text-[11px] font-mono text-stone-700"
                />
                <button
                  type="button"
                  onClick={onCopyWebhookUrl}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-stone-800 hover:bg-stone-900 text-white text-[11px] font-bold shrink-0"
                >
                  {copiedWebhookUrl ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedWebhookUrl ? 'Copiada!' : 'Copiar'}</span>
                </button>
              </div>
              <p className="text-[10px] text-stone-500">
                Nota: o parâmetro <code className="font-mono">tenant_id</code> apenas identifica o estabelecimento; a autenticidade do webhook é validada pelo token secreto no servidor.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                disabled={testingAsaasMode !== null}
                onClick={() => onTestAsaas('connection')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold disabled:opacity-50"
              >
                <PlugZap className="w-3.5 h-3.5" />
                <span>{testingAsaasMode === 'connection' ? 'Testando conexão...' : 'Testar Conexão Asaas'}</span>
              </button>

              <button
                type="button"
                disabled={testingAsaasMode !== null}
                onClick={() => onTestAsaas('webhook')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-stone-900 hover:bg-stone-800 text-white text-xs font-bold disabled:opacity-50"
              >
                <Webhook className="w-3.5 h-3.5" />
                <span>{testingAsaasMode === 'webhook' ? 'Testando webhook...' : 'Testar Webhook'}</span>
              </button>
            </div>

            {asaasTestResult && (
              <div
                className={`p-2.5 rounded-lg border text-xs flex items-start gap-2 ${
                  asaasTestResult.ok
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : 'bg-red-50 border-red-200 text-red-900'
                }`}
              >
                {asaasTestResult.ok ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                )}
                <span>{asaasTestResult.message}</span>
              </div>
            )}
          </div>
        )}

        {!saveGatewayCreds && pgProvider === 'asaas' && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              disabled={testingAsaasMode !== null}
              onClick={() => onTestAsaas('connection')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-bold disabled:opacity-50"
            >
              <PlugZap className="w-3.5 h-3.5" />
              <span>{testingAsaasMode === 'connection' ? 'Testando...' : 'Testar Conexão Salva'}</span>
            </button>
            <button
              type="button"
              disabled={testingAsaasMode !== null}
              onClick={() => onTestAsaas('webhook')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-800 border border-stone-200 text-xs font-bold disabled:opacity-50"
            >
              <Webhook className="w-3.5 h-3.5" />
              <span>{testingAsaasMode === 'webhook' ? 'Testando...' : 'Testar Webhook Salvo'}</span>
            </button>
            {asaasTestResult && (
              <div
                className={`w-full p-2.5 rounded-lg border text-xs flex items-start gap-2 ${
                  asaasTestResult.ok
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : 'bg-red-50 border-red-200 text-red-900'
                }`}
              >
                {asaasTestResult.ok ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                )}
                <span>{asaasTestResult.message}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

