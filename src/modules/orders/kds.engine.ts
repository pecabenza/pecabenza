import type {
  CanonicalOrderStatus,
  CanonicalPaymentStatus,
} from './order-status.machine';
import type {
  FulfillmentType,
  ScheduleType,
  ItemPreparationStatus,
  TenantCommerceSettings,
} from '@/types/database.types';
import type {
  ItemStepPrediction,
  OrderCriticalPathPrediction,
  AdvancedOrderSlaEvaluation,
  StationLoadMetrics,
  CalibrationReport,
} from './station-capacity.engine';

export type SlaState = 'normal' | 'warning' | 'delayed';

export interface TenantSlaConfig {
  targetConfirmationTimeMin: number;
  targetPreparationTimeMin: number;
  slaWarningBufferMin: number;
  schedulePreparationBufferMin: number;
}

export const DEFAULT_TENANT_SLA_CONFIG: TenantSlaConfig = {
  targetConfirmationTimeMin: 5,
  targetPreparationTimeMin: 25,
  slaWarningBufferMin: 5,
  schedulePreparationBufferMin: 5,
};

export function extractTenantSlaConfig(
  settings?: Partial<TenantCommerceSettings> | null
): TenantSlaConfig {
  return {
    targetConfirmationTimeMin:
      settings?.target_confirmation_time_min ?? DEFAULT_TENANT_SLA_CONFIG.targetConfirmationTimeMin,
    targetPreparationTimeMin:
      settings?.target_preparation_time_min ?? DEFAULT_TENANT_SLA_CONFIG.targetPreparationTimeMin,
    slaWarningBufferMin:
      settings?.sla_warning_buffer_min ?? DEFAULT_TENANT_SLA_CONFIG.slaWarningBufferMin,
    schedulePreparationBufferMin:
      settings?.schedule_preparation_buffer_min ??
      DEFAULT_TENANT_SLA_CONFIG.schedulePreparationBufferMin,
  };
}

export interface KdsItemChecklist {
  orderItemId: string;
  productName: string;
  variantName: string;
  quantity: number;
  preparationStatus: ItemPreparationStatus;
  startedAt: string | null;
  completedAt: string | null;
  prepDurationMin: number | null;
  currentStepOrder?: number | null;
  currentStationName?: string | null;
  currentStationSlug?: string | null;
  nextStationName?: string | null;
  estimatedItemCompletionAt?: string | null;
  steps?: ItemStepPrediction[];
}

export interface OrderStageTimings {
  timeToConfirmMin: number | null;
  timeFromConfirmToStartMin: number | null;
  preparationDurationMin: number | null;
  readyWaitingDurationMin: number | null;
}

export interface OrderSlaEvaluation {
  state: SlaState;
  label: 'Normal' | 'Atenção' | 'Atrasado';
  elapsedMin: number;
  targetMin: number;
  remainingMin: number;
}

export interface OrderPriorityEvaluation {
  score: number;
  level: 'normal' | 'high' | 'critical';
  isScheduledFutureHold: boolean;
  reasons: string[];
}

export interface KdsOrderCardData {
  id: string;
  tenantId: string;
  orderNumber: string;
  orderChannel?: string;
  customerDisplayName: string;
  fulfillmentType: FulfillmentType;
  scheduleType: ScheduleType;
  scheduledFor: string | null;
  preparationDueAt: string | null;
  promisedTimeAt: string;
  status: 'confirmed' | 'preparing' | 'ready';
  paymentStatus: CanonicalPaymentStatus;
  kitchenNotes: string | null;
  createdAt: string;
  confirmedAt: string;
  prepStartedAt: string | null;
  readyAt: string | null;
  confirmedElapsedMin: number;
  prepElapsedMin: number;
  items: KdsItemChecklist[];
  totalItemsCount: number;
  readyItemsCount: number;
  allItemsReady: boolean;
  sla: OrderSlaEvaluation;
  advancedSla?: AdvancedOrderSlaEvaluation;
  criticalPath?: OrderCriticalPathPrediction;
  recommendedStartAt?: string | null;
  priority: OrderPriorityEvaluation;
  stageTimings: OrderStageTimings;
}

export interface KdsBottleneckItem {
  productName: string;
  sampleCount: number;
  avgPrepMinutes: number;
  maxPrepMinutes: number;
}

export interface KdsBottleneckReport {
  hasSufficientData: boolean;
  message: string;
  minSampleRequired: number;
  items: KdsBottleneckItem[];
}

export interface KdsDashboardMetrics {
  activeOrdersCount: number;
  confirmedCount: number;
  preparingCount: number;
  readyCount: number;
  delayedCount: number;
  atRiskCount?: number;
  avgPrepTimeTodayMin: number | null;
  bottlenecks: KdsBottleneckReport;
  stationLoads?: StationLoadMetrics[];
  calibration?: CalibrationReport;
}

/**
 * Calcula o horário-meta de início de preparo (preparation_due_at) para pedidos agendados.
 * Exemplo: Entrega às 12:30, Preparo estimado 25 min, Buffer 5 min -> preparation_due_at = 12:00.
 */
export function calculatePreparationDueAt(
  scheduledFor: string | null | undefined,
  slaConfig: TenantSlaConfig = DEFAULT_TENANT_SLA_CONFIG
): string | null {
  if (!scheduledFor) return null;
  const scheduledMs = new Date(scheduledFor).getTime();
  if (Number.isNaN(scheduledMs)) return null;

  const leadMinutes =
    slaConfig.targetPreparationTimeMin + slaConfig.schedulePreparationBufferMin;
  return new Date(scheduledMs - leadMinutes * 60 * 1000).toISOString();
}

/**
 * Avalia o SLA operacional do pedido com base na configuração do tenant.
 */
export function calculateOrderSla(
  params: {
    status: CanonicalOrderStatus;
    scheduleType: ScheduleType;
    scheduledFor?: string | null;
    preparationDueAt?: string | null;
    confirmedElapsedMin: number;
    prepElapsedMin: number;
  },
  slaConfig: TenantSlaConfig = DEFAULT_TENANT_SLA_CONFIG,
  now: Date = new Date()
): OrderSlaEvaluation {
  const targetPrep = slaConfig.targetPreparationTimeMin;
  const warningThreshold = Math.max(1, targetPrep - slaConfig.slaWarningBufferMin);

  // 1. Regra para pedidos agendados ainda em 'confirmed'
  if (params.scheduleType === 'scheduled' && params.scheduledFor) {
    const schedMs = new Date(params.scheduledFor).getTime();
    const prepDueMs = params.preparationDueAt
      ? new Date(params.preparationDueAt).getTime()
      : schedMs - (targetPrep + slaConfig.schedulePreparationBufferMin) * 60000;

    if (now.getTime() > schedMs && params.status !== 'ready' && params.status !== 'delivered') {
      const overdueMin = Math.floor((now.getTime() - schedMs) / 60000);
      return {
        state: 'delayed',
        label: 'Atrasado',
        elapsedMin: params.prepElapsedMin || params.confirmedElapsedMin,
        targetMin: targetPrep,
        remainingMin: -overdueMin,
      };
    }

    if (params.status === 'confirmed') {
      const diffToPrepDueMin = Math.floor((prepDueMs - now.getTime()) / 60000);
      if (diffToPrepDueMin < -slaConfig.slaWarningBufferMin) {
        return {
          state: 'delayed',
          label: 'Atrasado',
          elapsedMin: Math.abs(diffToPrepDueMin),
          targetMin: slaConfig.targetConfirmationTimeMin,
          remainingMin: diffToPrepDueMin,
        };
      }
      if (diffToPrepDueMin <= 0) {
        return {
          state: 'warning',
          label: 'Atenção',
          elapsedMin: Math.abs(diffToPrepDueMin),
          targetMin: slaConfig.targetConfirmationTimeMin,
          remainingMin: 0,
        };
      }
      return {
        state: 'normal',
        label: 'Normal',
        elapsedMin: 0,
        targetMin: targetPrep,
        remainingMin: diffToPrepDueMin,
      };
    }
  }

  // 2. Pedido em preparo ('preparing')
  if (params.status === 'preparing') {
    const elapsed = params.prepElapsedMin;
    const remaining = targetPrep - elapsed;

    if (elapsed >= targetPrep) {
      return {
        state: 'delayed',
        label: 'Atrasado',
        elapsedMin: elapsed,
        targetMin: targetPrep,
        remainingMin: remaining,
      };
    }

    if (elapsed >= warningThreshold) {
      return {
        state: 'warning',
        label: 'Atenção',
        elapsedMin: elapsed,
        targetMin: targetPrep,
        remainingMin: remaining,
      };
    }

    return {
      state: 'normal',
      label: 'Normal',
      elapsedMin: elapsed,
      targetMin: targetPrep,
      remainingMin: remaining,
    };
  }

  // 3. Pedido confirmado aguardando início ('confirmed')
  if (params.status === 'confirmed') {
    const waitStartTarget = slaConfig.targetConfirmationTimeMin * 2;
    const warningStartTarget = slaConfig.targetConfirmationTimeMin;
    const elapsed = params.confirmedElapsedMin;
    const remaining = waitStartTarget - elapsed;

    if (elapsed >= waitStartTarget) {
      return {
        state: 'delayed',
        label: 'Atrasado',
        elapsedMin: elapsed,
        targetMin: waitStartTarget,
        remainingMin: remaining,
      };
    }

    if (elapsed >= warningStartTarget) {
      return {
        state: 'warning',
        label: 'Atenção',
        elapsedMin: elapsed,
        targetMin: waitStartTarget,
        remainingMin: remaining,
      };
    }

    return {
      state: 'normal',
      label: 'Normal',
      elapsedMin: elapsed,
      targetMin: waitStartTarget,
      remainingMin: remaining,
    };
  }

  // 4. Pedido pronto ('ready')
  return {
    state: 'normal',
    label: 'Normal',
    elapsedMin: params.prepElapsedMin,
    targetMin: targetPrep,
    remainingMin: Math.max(0, targetPrep - params.prepElapsedMin),
  };
}

/**
 * Função centralizada de scoring de prioridade operacional para o KDS.
 * Considera SLA/atraso, janela de agendamento, tempo em preparo, tempo desde confirmação e modalidade.
 */
export function calculateOperationalPriority(
  params: {
    status: CanonicalOrderStatus;
    fulfillmentType: FulfillmentType;
    scheduleType: ScheduleType;
    scheduledFor?: string | null;
    preparationDueAt?: string | null;
    confirmedElapsedMin: number;
    prepElapsedMin: number;
    sla: OrderSlaEvaluation;
  },
  slaConfig: TenantSlaConfig = DEFAULT_TENANT_SLA_CONFIG,
  now: Date = new Date()
): OrderPriorityEvaluation {
  let score = 0;
  const reasons: string[] = [];
  let isScheduledFutureHold = false;

  // 1. Tratamento especial para pedidos agendados
  if (params.scheduleType === 'scheduled' && params.scheduledFor) {
    const prepDueStr =
      params.preparationDueAt ||
      calculatePreparationDueAt(params.scheduledFor, slaConfig);
    if (prepDueStr) {
      const prepDueMs = new Date(prepDueStr).getTime();
      const minutesUntilPrepDue = (prepDueMs - now.getTime()) / 60000;

      if (minutesUntilPrepDue > 15) {
        // Agendado para mais tarde: não deve subir ao topo cedo demais
        score -= 100;
        isScheduledFutureHold = true;
        reasons.push('Agendado fora da janela imediata de preparo');
      } else if (minutesUntilPrepDue <= 0) {
        score += 75;
        reasons.push('Janela de preparo do agendamento atingida');
      } else {
        score += 35;
        reasons.push('Próximo do horário de início do agendamento');
      }
    }
  }

  // 2. Peso de SLA / Atraso
  if (params.sla.state === 'delayed') {
    score += 120;
    reasons.push('Ultrapassou limite de SLA');
  } else if (params.sla.state === 'warning') {
    score += 60;
    reasons.push('Próximo de estourar SLA');
  }

  // 3. Peso de tempo decorrido em preparo e desde confirmação
  score += Math.min(60, params.prepElapsedMin * 2);
  score += Math.min(45, params.confirmedElapsedMin * 1.5);

  // 4. Desempate logístico por modalidade (Delivery exige tempo extra de expedição)
  if (params.fulfillmentType === 'delivery') {
    score += 5;
  }

  const roundedScore = Math.round(score);
  let level: 'normal' | 'high' | 'critical' = 'normal';
  if (params.sla.state === 'delayed' || roundedScore >= 110) {
    level = 'critical';
  } else if (params.sla.state === 'warning' || roundedScore >= 55) {
    level = 'high';
  }

  return {
    score: roundedScore,
    level,
    isScheduledFutureHold,
    reasons,
  };
}

/**
 * Calcula os tempos operacionais por estágio do pedido com base nos eventos registrados.
 */
export function calculateStageTimings(params: {
  createdAt: string;
  status: CanonicalOrderStatus;
  events: Array<{ to_status: string; created_at: string }>;
  prepStartedAt?: string | null;
  now?: Date;
}): OrderStageTimings {
  const nowMs = (params.now || new Date()).getTime();
  const createdMs = new Date(params.createdAt).getTime();

  const confirmedEv = params.events.find((e) => e.to_status === 'confirmed');
  const preparingEv = params.events.find((e) => e.to_status === 'preparing');
  const readyEv = params.events.find((e) => e.to_status === 'ready');
  const postReadyEv = params.events.find(
    (e) => e.to_status === 'out_for_delivery' || e.to_status === 'delivered'
  );

  const confirmedMs = confirmedEv ? new Date(confirmedEv.created_at).getTime() : null;
  const prepStartMs = params.prepStartedAt
    ? new Date(params.prepStartedAt).getTime()
    : preparingEv
    ? new Date(preparingEv.created_at).getTime()
    : null;
  const readyMs = readyEv ? new Date(readyEv.created_at).getTime() : null;
  const postReadyMs = postReadyEv ? new Date(postReadyEv.created_at).getTime() : null;

  const timeToConfirmMin =
    confirmedMs !== null ? Math.max(0, Math.round((confirmedMs - createdMs) / 60000)) : null;

  const timeFromConfirmToStartMin =
    confirmedMs !== null && prepStartMs !== null
      ? Math.max(0, Math.round((prepStartMs - confirmedMs) / 60000))
      : null;

  let preparationDurationMin: number | null = null;
  if (prepStartMs !== null) {
    const endPrepMs = readyMs !== null ? readyMs : params.status === 'preparing' ? nowMs : null;
    if (endPrepMs !== null) {
      preparationDurationMin = Math.max(0, Math.round((endPrepMs - prepStartMs) / 60000));
    }
  }

  let readyWaitingDurationMin: number | null = null;
  if (readyMs !== null) {
    const endWaitMs = postReadyMs !== null ? postReadyMs : params.status === 'ready' ? nowMs : null;
    if (endWaitMs !== null) {
      readyWaitingDurationMin = Math.max(0, Math.round((endWaitMs - readyMs) / 60000));
    }
  }

  return {
    timeToConfirmMin,
    timeFromConfirmToStartMin,
    preparationDurationMin,
    readyWaitingDurationMin,
  };
}

/**
 * Analisa gargalos de produção ("Itens com maior tempo médio de preparo").
 * Não inventa conclusões quando a amostra for pequena: exige minSampleRequired.
 */
export function calculateKdsBottlenecks(
  completedItems: Array<{
    productName: string;
    startedAt?: string | null;
    completedAt?: string | null;
  }>,
  minSampleRequired = 2
): KdsBottleneckReport {
  const durationsByProduct = new Map<string, number[]>();

  for (const item of completedItems) {
    if (!item.startedAt || !item.completedAt || !item.productName) continue;
    const startMs = new Date(item.startedAt).getTime();
    const endMs = new Date(item.completedAt).getTime();
    if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs < startMs) continue;

    const durationMin = Math.max(1, Math.round((endMs - startMs) / 60000));
    const list = durationsByProduct.get(item.productName) || [];
    list.push(durationMin);
    durationsByProduct.set(item.productName, list);
  }

  const qualifiedItems: KdsBottleneckItem[] = [];
  for (const [productName, durations] of durationsByProduct.entries()) {
    if (durations.length >= minSampleRequired) {
      const sum = durations.reduce((acc, v) => acc + v, 0);
      const avg = Number((sum / durations.length).toFixed(1));
      const max = Math.max(...durations);
      qualifiedItems.push({
        productName,
        sampleCount: durations.length,
        avgPrepMinutes: avg,
        maxPrepMinutes: max,
      });
    }
  }

  qualifiedItems.sort((a, b) => b.avgPrepMinutes - a.avgPrepMinutes);

  if (qualifiedItems.length === 0) {
    return {
      hasSufficientData: false,
      message: 'Dados insuficientes',
      minSampleRequired,
      items: [],
    };
  }

  return {
    hasSufficientData: true,
    message: 'Gargalos identificados com base no histórico de preparo concluído.',
    minSampleRequired,
    items: qualifiedItems.slice(0, 5),
  };
}

/**
 * Mascara o nome do cliente para exibição enxuta na cozinha sem expor PII desnecessária.
 */
export function formatCustomerDisplayNameForKds(fullName?: string | null): string {
  if (!fullName || !fullName.trim()) return 'Cliente';
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  const lastInitial = parts[parts.length - 1][0]?.toUpperCase() || '';
  return `${parts[0]} ${lastInitial}.`;
}

