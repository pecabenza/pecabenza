'use client';

import React from 'react';
import { Power, Clock, AlertTriangle } from 'lucide-react';
import type { StructuredBusinessHours, WeekdayKey } from '@/modules/commerce/store-config.engine';

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

interface StoreOperationsTabProps {
  deliveryEnabled: boolean;
  pickupEnabled: boolean;
  asapEnabled: boolean;
  scheduledEnabled: boolean;
  businessHours: StructuredBusinessHours;
  onChangeDeliveryEnabled: (v: boolean) => void;
  onChangePickupEnabled: (v: boolean) => void;
  onChangeAsapEnabled: (v: boolean) => void;
  onChangeScheduledEnabled: (v: boolean) => void;
  onChangeBusinessHours: (next: StructuredBusinessHours) => void;
}

export function StoreOperationsTab({
  deliveryEnabled,
  pickupEnabled,
  asapEnabled,
  scheduledEnabled,
  businessHours,
  onChangeDeliveryEnabled,
  onChangePickupEnabled,
  onChangeAsapEnabled,
  onChangeScheduledEnabled,
  onChangeBusinessHours,
}: StoreOperationsTabProps) {
  const bothFulfillmentDisabled = !deliveryEnabled && !pickupEnabled;
  const bothScheduleDisabled = !asapEnabled && !scheduledEnabled;

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-stone-200 shadow-sm p-5 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-100 pb-3">
          <h3 className="font-bold text-stone-900 flex items-center gap-2">
            <Power className="w-4 h-4 text-amber-600" />
            Status Operacional & Modalidades
          </h3>

          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={businessHours.is_store_open}
              onChange={(e) =>
                onChangeBusinessHours({ ...businessHours, is_store_open: e.target.checked })
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
                onChangeBusinessHours({ ...businessHours, pause_reason: e.target.value })
              }
              placeholder="Ex: Pausa rápida na cozinha. Retornamos em 30 minutos."
              className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm"
            />
          </div>
        )}

        {(bothFulfillmentDisabled || bothScheduleDisabled) && (
          <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <span>
              {bothFulfillmentDisabled
                ? 'Atenção: Entrega e Retirada estão desativadas simultaneamente; clientes não conseguirão concluir pedidos.'
                : 'Atenção: Entrega imediata e Agendamento estão desativados simultaneamente.'}
            </span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <label className="flex items-center gap-2 p-3 rounded-lg border border-stone-200 cursor-pointer">
            <input
              type="checkbox"
              checked={deliveryEnabled}
              onChange={(e) => onChangeDeliveryEnabled(e.target.checked)}
              className="rounded border-stone-300 text-amber-600"
            />
            <span className="font-medium text-stone-800">Entrega (Delivery)</span>
          </label>
          <label className="flex items-center gap-2 p-3 rounded-lg border border-stone-200 cursor-pointer">
            <input
              type="checkbox"
              checked={pickupEnabled}
              onChange={(e) => onChangePickupEnabled(e.target.checked)}
              className="rounded border-stone-300 text-amber-600"
            />
            <span className="font-medium text-stone-800">Retirada no Local</span>
          </label>
          <label className="flex items-center gap-2 p-3 rounded-lg border border-stone-200 cursor-pointer">
            <input
              type="checkbox"
              checked={asapEnabled}
              onChange={(e) => onChangeAsapEnabled(e.target.checked)}
              className="rounded border-stone-300 text-amber-600"
            />
            <span className="font-medium text-stone-800">Entrega Imediata</span>
          </label>
          <label className="flex items-center gap-2 p-3 rounded-lg border border-stone-200 cursor-pointer">
            <input
              type="checkbox"
              checked={scheduledEnabled}
              onChange={(e) => onChangeScheduledEnabled(e.target.checked)}
              className="rounded border-stone-300 text-amber-600"
            />
            <span className="font-medium text-stone-800">Pedidos Agendados</span>
          </label>
        </div>
      </div>

      {/* Horários de Funcionamento */}
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
                onChangeBusinessHours({ ...businessHours, enforce_schedule: e.target.checked })
              }
              className="rounded border-stone-300 text-amber-600"
            />
            <span>Validar horário automaticamente no checkout</span>
          </label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {DAY_ORDER.map((day) => {
            const sched = businessHours.weekly_hours[day];
            const invalidRange = !sched.closed && sched.open >= sched.close;
            return (
              <div
                key={day}
                className={`p-3 rounded-xl border text-xs space-y-2 ${
                  invalidRange
                    ? 'bg-red-50 border-red-300'
                    : sched.closed
                    ? 'bg-stone-50 border-stone-200 opacity-75'
                    : 'bg-white border-stone-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-stone-800">{DAY_LABELS[day]}</span>
                  <label className="inline-flex items-center gap-1 text-[11px] text-stone-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={sched.closed}
                      onChange={(e) =>
                        onChangeBusinessHours({
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
                  <>
                    <div className="flex items-center gap-2">
                      <input
                        type="time"
                        value={sched.open}
                        onChange={(e) =>
                          onChangeBusinessHours({
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
                          onChangeBusinessHours({
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
                    {invalidRange && (
                      <p className="text-[11px] text-red-700 font-medium">
                        Fechamento deve ser posterior à abertura.
                      </p>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

