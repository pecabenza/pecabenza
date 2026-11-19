'use client';

import React, { useState } from 'react';
import { MessageCircle, Eye } from 'lucide-react';
import {
  DEFAULT_WHATSAPP_TEMPLATES,
  type WhatsAppMessageStage,
} from '@/lib/whatsapp/order-messages';
import {
  DEFAULT_DELIVERED_THANK_YOU_MESSAGE,
  type StructuredBusinessHours,
} from '@/modules/commerce/store-config.engine';
import { DigitalMenuQrCard } from '@/components/admin/DigitalMenuQrCard';

interface StoreCommunicationTabProps {
  businessHours: StructuredBusinessHours;
  onChangeBusinessHours: (next: StructuredBusinessHours) => void;
}

function renderSamplePreview(template: string): string {
  return template
    .replaceAll('{cliente}', 'Maria Silva')
    .replaceAll('{pedido}', '#000142')
    .replaceAll('{total}', 'R$ 60,00')
    .replaceAll('{itens}', '1x Feijoada BENZA (500 ml)')
    .replaceAll('{pagamento}', 'Pix')
    .replaceAll('{rastreio}', 'https://benza.com.br/pedido/7K9M2P4X8B');
}

export function StoreCommunicationTab({
  businessHours,
  onChangeBusinessHours,
}: StoreCommunicationTabProps) {
  const [showPreview, setShowPreview] = useState(false);

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-stone-200 shadow-sm p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-100 pb-3">
          <div>
            <h3 className="font-bold text-stone-900 flex items-center gap-2">
              <MessageCircle className="w-4 h-4 text-emerald-600" />
              Mensagens WhatsApp Business
            </h3>
            <p className="text-xs text-stone-500">
              Variáveis disponíveis:{' '}
              <code className="px-1 py-0.5 rounded bg-stone-100 text-[11px]">{'{cliente}'}</code>{' '}
              <code className="px-1 py-0.5 rounded bg-stone-100 text-[11px]">{'{pedido}'}</code>{' '}
              <code className="px-1 py-0.5 rounded bg-stone-100 text-[11px]">{'{total}'}</code>{' '}
              <code className="px-1 py-0.5 rounded bg-stone-100 text-[11px]">{'{itens}'}</code>{' '}
              <code className="px-1 py-0.5 rounded bg-stone-100 text-[11px]">{'{pagamento}'}</code>{' '}
              <code className="px-1 py-0.5 rounded bg-stone-100 text-[11px]">{'{rastreio}'}</code>
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => setShowPreview((p) => !p)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:text-emerald-900"
            >
              <Eye className="w-3.5 h-3.5" />
              {showPreview ? 'Ocultar prévia' : 'Pré-visualizar'}
            </button>
            <button
              type="button"
              onClick={() =>
                onChangeBusinessHours({
                  ...businessHours,
                  whatsapp_templates: { ...DEFAULT_WHATSAPP_TEMPLATES },
                })
              }
              className="text-xs font-semibold text-stone-600 hover:text-stone-900 underline"
            >
              Restaurar padrão
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(
            [
              { key: 'confirmed', label: '1. Pedido Confirmado' },
              { key: 'ready', label: '2. Pronto / Finalizado' },
              { key: 'out_for_delivery', label: '3. Saiu para Entrega' },
              { key: 'delivered', label: '4. Entregue / Finalizado' },
            ] as Array<{ key: WhatsAppMessageStage; label: string }>
          ).map((item) => {
            const templateValue =
              businessHours.whatsapp_templates?.[item.key] ?? DEFAULT_WHATSAPP_TEMPLATES[item.key];
            return (
              <div key={item.key} className="space-y-1.5">
                <label className="block text-xs font-semibold text-stone-700">{item.label}</label>
                <textarea
                  rows={5}
                  value={templateValue}
                  onChange={(e) =>
                    onChangeBusinessHours({
                      ...businessHours,
                      whatsapp_templates: {
                        ...businessHours.whatsapp_templates,
                        [item.key]: e.target.value,
                      },
                    })
                  }
                  className="w-full p-3 rounded-lg border border-stone-300 text-xs text-stone-800 leading-relaxed focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                />
                {showPreview && (
                  <div className="p-2.5 rounded-lg bg-emerald-50/70 border border-emerald-200 text-[11px] text-stone-700 whitespace-pre-line">
                    {renderSamplePreview(templateValue)}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="pt-4 border-t border-stone-100 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <label className="block text-xs font-semibold text-stone-700">
              Nota de Agradecimento após Entrega (Página de Acompanhamento /pedido/[código])
            </label>
            <button
              type="button"
              onClick={() =>
                onChangeBusinessHours({
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
              businessHours.delivered_thank_you_message ?? DEFAULT_DELIVERED_THANK_YOU_MESSAGE
            }
            onChange={(e) =>
              onChangeBusinessHours({
                ...businessHours,
                delivered_thank_you_message: e.target.value,
              })
            }
            placeholder="Ex.: Obrigado por escolher a nossa cozinha! Esperamos que aproveite sua refeição. Bom apetite!"
            className="w-full p-3 rounded-lg border border-stone-300 text-xs text-stone-800 leading-relaxed focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
          />
          <p className="text-[11px] text-stone-500">
            Exibida em destaque na página pública de acompanhamento quando o pedido muda para o status{' '}
            <strong>Entregue</strong>.
          </p>
        </div>
      </div>

      <DigitalMenuQrCard />
    </div>
  );
}

