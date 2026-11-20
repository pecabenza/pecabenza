'use client';

import React from 'react';
import {
  CheckCircle2,
  Clock,
  ChefHat,
  Truck,
  Store,
  XCircle,
  PackageCheck,
} from 'lucide-react';
import { CanonicalOrderStatus } from '@/modules/orders/order-status.machine';

export interface TimelineEventItem {
  id: string;
  fromStatus?: string | null;
  toStatus: string;
  statusLabel: string;
  source: string;
  createdAt: string;
}

interface OrderTimelineProps {
  currentStatus: CanonicalOrderStatus;
  fulfillmentType: 'delivery' | 'pickup';
  timelineEvents: TimelineEventItem[];
}

export function OrderTimeline({
  currentStatus,
  fulfillmentType,
  timelineEvents,
}: OrderTimelineProps) {
  const isCancelled = currentStatus === 'cancelled';

  // Mapeia timestamps dos eventos registrados
  const getEventTime = (status: string): string | null => {
    const event = timelineEvents.find((ev) => ev.toStatus === status);
    if (!event) return null;
    const date = new Date(event.createdAt);
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };

  // Define os passos canônicos da jornada do pedido
  const steps =
    fulfillmentType === 'pickup'
      ? [
          {
            key: 'pending',
            label: 'Pedido Recebido',
            description: 'Solicitação registrada no restaurante',
            icon: Clock,
            time:
              getEventTime('pending') ||
              (timelineEvents[0]
                ? new Date(timelineEvents[0].createdAt).toLocaleTimeString('pt-BR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : null),
          },
          {
            key: 'confirmed',
            label: 'Pedido Confirmado',
            description: 'Pagamento identificado e aceito',
            icon: CheckCircle2,
            time: getEventTime('confirmed'),
          },
          {
            key: 'preparing',
            label: 'Em Preparação',
            description: 'Prato sendo preparado na cozinha',
            icon: ChefHat,
            time: getEventTime('preparing'),
          },
          {
            key: 'ready',
            label: 'Pronto para Retirada',
            description: 'Aguardando sua chegada no balcão',
            icon: Store,
            time: getEventTime('ready'),
          },
          {
            key: 'delivered',
            label: 'Retirado',
            description: 'Pedido finalizado com sucesso',
            icon: PackageCheck,
            time: getEventTime('delivered'),
          },
        ]
      : [
          {
            key: 'pending',
            label: 'Pedido Recebido',
            description: 'Solicitação registrada no restaurante',
            icon: Clock,
            time:
              getEventTime('pending') ||
              (timelineEvents[0]
                ? new Date(timelineEvents[0].createdAt).toLocaleTimeString('pt-BR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : null),
          },
          {
            key: 'confirmed',
            label: 'Pedido Confirmado',
            description: 'Pagamento identificado e aceito',
            icon: CheckCircle2,
            time: getEventTime('confirmed'),
          },
          {
            key: 'preparing',
            label: 'Em Preparação',
            description: 'Prato sendo preparado na cozinha',
            icon: ChefHat,
            time: getEventTime('preparing'),
          },
          {
            key: 'ready',
            label: 'Pronto · Aguardando Entregador',
            description: 'Pronto na cozinha, aguardando coleta pelo entregador',
            icon: Clock,
            time: getEventTime('ready'),
          },
          {
            key: 'out_for_delivery',
            label: 'Saiu para Entrega',
            description: 'A caminho do seu endereço',
            icon: Truck,
            time: getEventTime('out_for_delivery'),
          },
          {
            key: 'delivered',
            label: 'Entregue',
            description: 'Pedido finalizado com sucesso',
            icon: PackageCheck,
            time: getEventTime('delivered'),
          },
        ];

  // Identifica a posição do status atual
  const statusIndexMap: Record<string, number> =
    fulfillmentType === 'pickup'
      ? {
          pending: 0,
          confirmed: 1,
          preparing: 2,
          ready: 3,
          out_for_delivery: 3,
          delivered: 4,
          cancelled: -1,
        }
      : {
          pending: 0,
          confirmed: 1,
          preparing: 2,
          ready: 3,
          out_for_delivery: 4,
          delivered: 5,
          cancelled: -1,
        };

  const currentIndex = statusIndexMap[currentStatus] ?? 0;

  if (isCancelled) {
    const cancelEvent = timelineEvents.find((ev) => ev.toStatus === 'cancelled');
    const cancelTime = cancelEvent
      ? new Date(cancelEvent.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      : null;

    return (
      <div className="p-6 rounded-2xl bg-red-500/10 border border-red-500/20 text-center space-y-3">
        <div className="w-12 h-12 rounded-full bg-red-500/20 text-red-600 flex items-center justify-center mx-auto">
          <XCircle className="w-6 h-6" />
        </div>
        <h3 className="text-base font-bold text-red-800">Pedido Cancelado</h3>
        <p className="text-xs text-red-700 max-w-sm mx-auto">
          Este pedido foi cancelado {cancelTime ? `às ${cancelTime}` : ''}. Se você realizou pagamento Pix, nossa equipe administrativa verificará o estorno.
        </p>
      </div>
    );
  }

  return (
    <div className="py-2 space-y-6">
      <div className="relative">
        {/* Linha vertical conectando os passos */}
        <div className="absolute left-4 sm:left-5 top-5 bottom-5 w-0.5 bg-tenant-border" />

        <div className="space-y-6">
          {steps.map((step, idx) => {
            const isCompleted = idx < currentIndex;
            const isCurrent = idx === currentIndex;
            const StepIcon = step.icon;

            return (
              <div key={step.key} className="relative flex items-start gap-4 sm:gap-5">
                {/* Ícone / Marcador */}
                <div
                  className={`relative z-10 w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center transition-all motion-reduce:transition-none ${
                    isCompleted
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : isCurrent
                      ? 'bg-tenant-primary text-white ring-4 ring-tenant-primary/20 shadow-md animate-pulse motion-reduce:animate-none'
                      : 'bg-tenant-surface border-2 border-tenant-border text-tenant-muted'
                  }`}
                >
                  <StepIcon className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>

                {/* Conteúdo do Passo */}
                <div className="flex-1 pt-0.5 sm:pt-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h4
                      className={`text-sm sm:text-base font-bold transition-colors motion-reduce:transition-none ${
                        isCurrent
                          ? 'text-tenant-primary font-extrabold'
                          : isCompleted
                          ? 'text-tenant-text'
                          : 'text-tenant-muted'
                      }`}
                    >
                      {step.label}
                    </h4>

                    {step.time && (
                      <span className="text-xs font-semibold text-tenant-muted bg-tenant-background px-2 py-0.5 rounded-full border border-tenant-border/50">
                        {step.time}
                      </span>
                    )}
                  </div>

                  <p
                    className={`text-xs mt-0.5 ${
                      isCurrent
                        ? 'text-tenant-text font-medium'
                        : 'text-tenant-muted'
                    }`}
                  >
                    {step.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

