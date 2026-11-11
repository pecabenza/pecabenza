import type {
  ProductionStation,
  ProductionStationType,
  ProductProductionStep,
  OrderItemProductionStep,
  OrderItemProductionStepStatus,
  FulfillmentType,
  ScheduleType,
} from '@/types/database.types';
import type { TenantSlaConfig } from './kds.engine';
import { DEFAULT_TENANT_SLA_CONFIG } from './kds.engine';

export type StationSaturationState = 'normal' | 'warning' | 'saturated';
export type AdvancedSlaState = 'on_time' | 'at_risk' | 'delayed';

export interface ResolvedProductionStepTemplate {
  stepOrder: number;
  stationId: string | null;
  stationName: string;
  stationSlug: string;
  stationType: ProductionStationType;
  status: 'pending' | 'blocked';
  estimatedDurationSeconds: number;
  capacityWeight: number;
  source: 'variant' | 'product' | 'fallback';
}

export interface StationLoadMetrics {
  stationId: string;
  stationName: string;
  stationSlug: string;
  stationType: ProductionStationType;
  defaultCapacity: number;
  inUseUnits: number;
  pendingUnits: number;
  blockedUnits: number;
  preparingStepsCount: number;
  pendingStepsCount: number;
  blockedStepsCount: number;
  completedTodayCount: number;
  utilizationPct: number;
  estimatedQueueWaitSeconds: number;
  estimatedQueueWaitMin: number;
  saturationState: StationSaturationState;
  saturationLabel: 'Normal' | 'Alta Carga' | 'Saturada';
}

export interface ItemStepPrediction {
  stepId: string;
  stepOrder: number;
  stationId: string | null;
  stationName: string;
  stationSlug: string;
  stationType: ProductionStationType;
  status: OrderItemProductionStepStatus;
  estimatedDurationSeconds: number;
  queueWaitSeconds: number;
  remainingSeconds: number;
  startedAt: string | null;
  completedAt: string | null;
  overrideReason?: string | null;
}

export interface OrderItemPrediction {
  orderItemId: string;
  productName: string;
  variantName: string;
  quantity: number;
  currentStepOrder: number | null;
  currentStationName: string | null;
  currentStationSlug: string | null;
  nextStationName: string | null;
  allStepsCompleted: boolean;
  estimatedItemRemainingSeconds: number;
  estimatedItemCompletionAt: string;
  steps: ItemStepPrediction[];
}

export interface OrderCriticalPathPrediction {
  orderId: string;
  criticalPathDurationSeconds: number;
  criticalPathDurationMin: number;
  estimatedOrderReadyAt: string;
  bottleneckOrderItemId: string | null;
  bottleneckProductName: string | null;
  bottleneckStationName: string | null;
  bottleneckStationSlug: string | null;
  items: OrderItemPrediction[];
  totalStepsCount: number;
  completedStepsCount: number;
  allMandatoryStepsCompleted: boolean;
}

export interface AdvancedOrderSlaEvaluation {
  state: AdvancedSlaState;
  legacyState: 'normal' | 'warning' | 'delayed';
  label: 'No Prazo' | 'Em Risco' | 'Atrasado';
  promisedTimeAt: string;
  estimatedOrderReadyAt: string;
  predictedDelayMin: number;
  remainingToPromiseMin: number;
  isPredictedToDelay: boolean;
}

export interface StationHistoricalPerformance {
  stationId: string;
  stationName: string;
  stationSlug: string;
  sampleCount: number;
  hasSufficientData: boolean;
  message: string;
  avgExecutionSeconds: number | null;
  avgExecutionMinutes: number | null;
  configuredDefaultSeconds: number;
}

export interface ProductStepCalibrationSuggestion {
  productName: string;
  stationName: string;
  stepOrder: number;
  sampleCount: number;
  configuredDurationSeconds: number;
  observedAvgDurationSeconds: number;
  divergencePct: number;
  recommendation: 'Revisar estimativa' | 'Estimativa calibrada';
  suggestedDurationSeconds: number;
}

export interface CalibrationReport {
  hasSufficientData: boolean;
  minSampleRequired: number;
  message: string;
  suggestions: ProductStepCalibrationSuggestion[];
}

/**
 * 1. Regra de Precedência de Fluxo de Produção por Item (Seção 5 e 10):
 *    Variante Ativa > Produto Ativo > Etapa Padrão Fallback (1 etapa)
 */
export function resolveItemProductionFlow(params: {
  productId: string;
  variantId?: string | null;
  quantity: number;
  stations: ProductionStation[];
  productSteps: ProductProductionStep[];
  fallbackDurationSeconds?: number;
}): ResolvedProductionStepTemplate[] {
  const activeStationMap = new Map<string, ProductionStation>();
  const sortedActiveStations = [...params.stations]
    .filter((s) => s.is_active)
    .sort((a, b) => a.display_order - b.display_order);

  for (const st of sortedActiveStations) {
    activeStationMap.set(st.id, st);
  }

  const safeQuantity = Math.max(1, params.quantity || 1);

  // 1. Tenta etapas específicas da variante em estações ativas
  if (params.variantId) {
    const variantSteps = params.productSteps
      .filter(
        (s) =>
          s.is_active &&
          s.product_id === params.productId &&
          s.variant_id === params.variantId &&
          activeStationMap.has(s.station_id)
      )
      .sort((a, b) => a.step_order - b.step_order);

    if (variantSteps.length > 0) {
      return variantSteps.map((s, idx) => {
        const st = activeStationMap.get(s.station_id)!;
        const seqOrder = idx + 1;
        return {
          stepOrder: seqOrder,
          stationId: st.id,
          stationName: st.name,
          stationSlug: st.slug,
          stationType: st.station_type,
          status: seqOrder === 1 ? 'pending' : 'blocked',
          estimatedDurationSeconds: Math.max(5, s.estimated_duration_seconds),
          capacityWeight: Math.max(1, (s.capacity_weight || 1) * safeQuantity),
          source: 'variant',
        };
      });
    }
  }

  // 2. Tenta etapas gerais do produto (variant_id == null) em estações ativas
  const productLevelSteps = params.productSteps
    .filter(
      (s) =>
        s.is_active &&
        s.product_id === params.productId &&
        !s.variant_id &&
        activeStationMap.has(s.station_id)
    )
    .sort((a, b) => a.step_order - b.step_order);

  if (productLevelSteps.length > 0) {
    return productLevelSteps.map((s, idx) => {
      const st = activeStationMap.get(s.station_id)!;
      const seqOrder = idx + 1;
      return {
        stepOrder: seqOrder,
        stationId: st.id,
        stationName: st.name,
        stationSlug: st.slug,
        stationType: st.station_type,
        status: seqOrder === 1 ? 'pending' : 'blocked',
        estimatedDurationSeconds: Math.max(5, s.estimated_duration_seconds),
        capacityWeight: Math.max(1, (s.capacity_weight || 1) * safeQuantity),
        source: 'product',
      };
    });
  }

  // 3. Fallback: 1 etapa operacional padrão
  const defaultStation = sortedActiveStations[0] || null;
  return [
    {
      stepOrder: 1,
      stationId: defaultStation ? defaultStation.id : null,
      stationName: defaultStation ? defaultStation.name : 'Cozinha Geral',
      stationSlug: defaultStation ? defaultStation.slug : 'cozinha-geral',
      stationType: defaultStation ? defaultStation.station_type : 'kitchen',
      status: 'pending',
      estimatedDurationSeconds:
        defaultStation?.default_duration_seconds ??
        params.fallbackDurationSeconds ??
        600,
      capacityWeight: safeQuantity,
      source: 'fallback',
    },
  ];
}

/**
 * 2. Cálculo Determinístico de Capacidade, Carga Atual e Saturação por Estação (Seções 13 a 16)
 */
export function calculateStationLoad(params: {
  station: Pick<
    ProductionStation,
    'id' | 'name' | 'slug' | 'station_type' | 'default_capacity' | 'default_duration_seconds'
  >;
  activeSteps: Array<
    Pick<
      OrderItemProductionStep,
      | 'id'
      | 'station_id'
      | 'snapshot_station_slug'
      | 'status'
      | 'estimated_duration_seconds'
      | 'capacity_weight'
      | 'started_at'
    >
  >;
  completedTodayCount?: number;
  now?: Date;
}): StationLoadMetrics {
  const nowMs = (params.now || new Date()).getTime();
  const capacity = Math.max(1, params.station.default_capacity || 1);

  const stationSteps = params.activeSteps.filter(
    (s) =>
      s.station_id === params.station.id ||
      (!s.station_id && s.snapshot_station_slug === params.station.slug)
  );

  const preparingSteps = stationSteps.filter((s) => s.status === 'preparing');
  const pendingSteps = stationSteps.filter((s) => s.status === 'pending');
  const blockedSteps = stationSteps.filter((s) => s.status === 'blocked');

  const inUseUnits = preparingSteps.reduce(
    (sum, s) => sum + Math.max(1, s.capacity_weight || 1),
    0
  );
  const pendingUnits = pendingSteps.reduce(
    (sum, s) => sum + Math.max(1, s.capacity_weight || 1),
    0
  );
  const blockedUnits = blockedSteps.reduce(
    (sum, s) => sum + Math.max(1, s.capacity_weight || 1),
    0
  );

  // Calcula carga de trabalho restante nas etapas em preparo + etapas aguardando na fila ('pending')
  let activeRemainingWeightedSec = 0;
  for (const step of preparingSteps) {
    const weight = Math.max(1, step.capacity_weight || 1);
    const estSec = Math.max(
      10,
      step.estimated_duration_seconds || params.station.default_duration_seconds || 300
    );
    const elapsedSec = step.started_at
      ? Math.max(0, Math.floor((nowMs - new Date(step.started_at).getTime()) / 1000))
      : 0;
    const remainingSec = Math.max(15, estSec - elapsedSec);
    activeRemainingWeightedSec += remainingSec * weight;
  }

  let pendingWeightedSec = 0;
  for (const step of pendingSteps) {
    const weight = Math.max(1, step.capacity_weight || 1);
    const estSec = Math.max(
      10,
      step.estimated_duration_seconds || params.station.default_duration_seconds || 300
    );
    pendingWeightedSec += estSec * weight;
  }

  // Se ainda há slots livres na estação e não há fila pendente, tempo de espera de fila = 0
  let estimatedQueueWaitSeconds = 0;
  if (inUseUnits < capacity && pendingUnits === 0) {
    estimatedQueueWaitSeconds = 0;
  } else if (inUseUnits < capacity && pendingUnits > 0) {
    const freeSlots = capacity - inUseUnits;
    const overflowPendingUnits = Math.max(0, pendingUnits - freeSlots);
    if (overflowPendingUnits === 0) {
      estimatedQueueWaitSeconds = 0;
    } else {
      const avgPendingDuration =
        pendingUnits > 0 ? pendingWeightedSec / pendingUnits : 300;
      estimatedQueueWaitSeconds = Math.round(
        (overflowPendingUnits * avgPendingDuration + activeRemainingWeightedSec * 0.5) /
          capacity
      );
    }
  } else {
    // Estação com capacidade 100% tomada ou excedida
    estimatedQueueWaitSeconds = Math.round(
      (activeRemainingWeightedSec + pendingWeightedSec) / capacity
    );
  }

  const utilizationPct = Math.round((inUseUnits / capacity) * 100);

  let saturationState: StationSaturationState = 'normal';
  let saturationLabel: 'Normal' | 'Alta Carga' | 'Saturada' = 'Normal';

  if (
    inUseUnits > capacity ||
    (inUseUnits >= capacity && pendingUnits >= capacity) ||
    estimatedQueueWaitSeconds >= 900
  ) {
    saturationState = 'saturated';
    saturationLabel = 'Saturada';
  } else if (
    inUseUnits === capacity ||
    pendingUnits > Math.ceil(capacity * 0.5) ||
    estimatedQueueWaitSeconds >= 300
  ) {
    saturationState = 'warning';
    saturationLabel = 'Alta Carga';
  }

  return {
    stationId: params.station.id,
    stationName: params.station.name,
    stationSlug: params.station.slug,
    stationType: params.station.station_type,
    defaultCapacity: capacity,
    inUseUnits,
    pendingUnits,
    blockedUnits,
    preparingStepsCount: preparingSteps.length,
    pendingStepsCount: pendingSteps.length,
    blockedStepsCount: blockedSteps.length,
    completedTodayCount: params.completedTodayCount ?? 0,
    utilizationPct,
    estimatedQueueWaitSeconds,
    estimatedQueueWaitMin: Math.round(estimatedQueueWaitSeconds / 60),
    saturationState,
    saturationLabel,
  };
}

/**
 * 3. Previsão de Conclusão por Item e por Pedido via Caminho Crítico (Seções 17 e 18)
 * - Etapas sequenciais do mesmo item somam tempos (fila da estação + duração da etapa).
 * - Itens independentes do mesmo pedido progridem em paralelo, logo o tempo do pedido
 *   é determinado pelo maior caminho crítico entre seus itens.
 */
export function calculateOrderCriticalPathAndPrediction(params: {
  orderId: string;
  items: Array<{
    orderItemId: string;
    productName: string;
    variantName: string;
    quantity: number;
    steps: OrderItemProductionStep[];
  }>;
  stationLoadsBySlug: Map<string, StationLoadMetrics>;
  now?: Date;
}): OrderCriticalPathPrediction {
  const nowMs = (params.now || new Date()).getTime();
  const itemPredictions: OrderItemPrediction[] = [];

  let maxItemRemainingSeconds = 0;
  let bottleneckOrderItemId: string | null = null;
  let bottleneckProductName: string | null = null;
  let bottleneckStationName: string | null = null;
  let bottleneckStationSlug: string | null = null;

  let totalStepsCount = 0;
  let completedStepsCount = 0;

  for (const item of params.items) {
    const sortedSteps = [...item.steps].sort((a, b) => a.step_order - b.step_order);
    let itemRemainingSeconds = 0;
    const stepPredictions: ItemStepPrediction[] = [];

    let currentStepOrder: number | null = null;
    let currentStationName: string | null = null;
    let currentStationSlug: string | null = null;
    let nextStationName: string | null = null;
    let slowestStepInItemSeconds = -1;
    let slowestStationInItemName: string | null = null;
    let slowestStationInItemSlug: string | null = null;

    for (let idx = 0; idx < sortedSteps.length; idx++) {
      const step = sortedSteps[idx];
      totalStepsCount += 1;

      const isDone =
        step.status === 'ready' ||
        step.status === 'skipped' ||
        step.status === 'cancelled';

      if (isDone) {
        completedStepsCount += 1;
        stepPredictions.push({
          stepId: step.id,
          stepOrder: step.step_order,
          stationId: step.station_id || null,
          stationName: step.snapshot_station_name,
          stationSlug: step.snapshot_station_slug,
          stationType: step.snapshot_station_type,
          status: step.status,
          estimatedDurationSeconds: step.estimated_duration_seconds,
          queueWaitSeconds: 0,
          remainingSeconds: 0,
          startedAt: step.started_at || null,
          completedAt: step.completed_at || null,
          overrideReason: step.override_reason || null,
        });
        continue;
      }

      if (currentStepOrder === null) {
        currentStepOrder = step.step_order;
        currentStationName = step.snapshot_station_name;
        currentStationSlug = step.snapshot_station_slug;
        const nextStep = sortedSteps[idx + 1];
        if (nextStep) {
          nextStationName = nextStep.snapshot_station_name;
        }
      }

      const stationLoad = params.stationLoadsBySlug.get(step.snapshot_station_slug);
      const queueWaitSec =
        step.status === 'preparing'
          ? 0
          : stationLoad?.estimatedQueueWaitSeconds ?? 0;

      let stepExecRemainingSec = step.estimated_duration_seconds;
      if (step.status === 'preparing' && step.started_at) {
        const elapsedSec = Math.max(
          0,
          Math.floor((nowMs - new Date(step.started_at).getTime()) / 1000)
        );
        stepExecRemainingSec = Math.max(
          30,
          step.estimated_duration_seconds - elapsedSec
        );
      }

      const totalStepRemSec = queueWaitSec + stepExecRemainingSec;
      itemRemainingSeconds += totalStepRemSec;

      if (totalStepRemSec > slowestStepInItemSeconds) {
        slowestStepInItemSeconds = totalStepRemSec;
        slowestStationInItemName = step.snapshot_station_name;
        slowestStationInItemSlug = step.snapshot_station_slug;
      }

      stepPredictions.push({
        stepId: step.id,
        stepOrder: step.step_order,
        stationId: step.station_id || null,
        stationName: step.snapshot_station_name,
        stationSlug: step.snapshot_station_slug,
        stationType: step.snapshot_station_type,
        status: step.status,
        estimatedDurationSeconds: step.estimated_duration_seconds,
        queueWaitSeconds: queueWaitSec,
        remainingSeconds: totalStepRemSec,
        startedAt: step.started_at || null,
        completedAt: step.completed_at || null,
        overrideReason: step.override_reason || null,
      });
    }

    const allStepsCompleted =
      sortedSteps.length > 0 &&
      sortedSteps.every(
        (s) =>
          s.status === 'ready' ||
          s.status === 'skipped' ||
          s.status === 'cancelled'
      );

    const estimatedItemCompletionAt = new Date(
      nowMs + itemRemainingSeconds * 1000
    ).toISOString();

    if (itemRemainingSeconds > maxItemRemainingSeconds) {
      maxItemRemainingSeconds = itemRemainingSeconds;
      bottleneckOrderItemId = item.orderItemId;
      bottleneckProductName = item.productName;
      bottleneckStationName = slowestStationInItemName || currentStationName;
      bottleneckStationSlug = slowestStationInItemSlug || currentStationSlug;
    }

    itemPredictions.push({
      orderItemId: item.orderItemId,
      productName: item.productName,
      variantName: item.variantName,
      quantity: item.quantity,
      currentStepOrder,
      currentStationName,
      currentStationSlug,
      nextStationName,
      allStepsCompleted,
      estimatedItemRemainingSeconds: itemRemainingSeconds,
      estimatedItemCompletionAt,
      steps: stepPredictions,
    });
  }

  const estimatedOrderReadyAt = new Date(
    nowMs + maxItemRemainingSeconds * 1000
  ).toISOString();

  const allMandatoryStepsCompleted =
    totalStepsCount > 0 && completedStepsCount === totalStepsCount;

  return {
    orderId: params.orderId,
    criticalPathDurationSeconds: maxItemRemainingSeconds,
    criticalPathDurationMin: Math.ceil(maxItemRemainingSeconds / 60),
    estimatedOrderReadyAt,
    bottleneckOrderItemId,
    bottleneckProductName,
    bottleneckStationName,
    bottleneckStationSlug,
    items: itemPredictions,
    totalStepsCount,
    completedStepsCount,
    allMandatoryStepsCompleted,
  };
}

/**
 * 4. SLA Avançado com Detecção Preditiva de Atraso ("at_risk") (Seção 19)
 * Detecta atraso provável ANTES de estourar o prazo final quando
 * estimatedOrderReadyAt ultrapassa ou se aproxima perigosamente de promisedTimeAt.
 */
export function calculateAdvancedOrderSla(params: {
  status: 'confirmed' | 'preparing' | 'ready';
  promisedTimeAt: string;
  estimatedOrderReadyAt: string;
  slaConfig?: TenantSlaConfig;
  now?: Date;
}): AdvancedOrderSlaEvaluation {
  const nowMs = (params.now || new Date()).getTime();
  const slaConfig = params.slaConfig || DEFAULT_TENANT_SLA_CONFIG;
  const promisedMs = new Date(params.promisedTimeAt).getTime();
  const estimatedReadyMs = new Date(params.estimatedOrderReadyAt).getTime();

  const remainingToPromiseMin = Math.floor((promisedMs - nowMs) / 60000);
  const predictedDelayMin = Math.max(
    0,
    Math.ceil((estimatedReadyMs - promisedMs) / 60000)
  );

  // Pedido já pronto
  if (params.status === 'ready') {
    return {
      state: 'on_time',
      legacyState: 'normal',
      label: 'No Prazo',
      promisedTimeAt: params.promisedTimeAt,
      estimatedOrderReadyAt: params.estimatedOrderReadyAt,
      predictedDelayMin: 0,
      remainingToPromiseMin: Math.max(0, remainingToPromiseMin),
      isPredictedToDelay: false,
    };
  }

  // 1. Prazo prometido já estourado no relógio atual
  if (nowMs >= promisedMs) {
    return {
      state: 'delayed',
      legacyState: 'delayed',
      label: 'Atrasado',
      promisedTimeAt: params.promisedTimeAt,
      estimatedOrderReadyAt: params.estimatedOrderReadyAt,
      predictedDelayMin: Math.max(1, Math.abs(remainingToPromiseMin)),
      remainingToPromiseMin,
      isPredictedToDelay: true,
    };
  }

  // 2. Detecção preditiva: ainda estamos antes do horário prometido, mas a previsão
  // do caminho crítico + fila das estações indica que vai passar do horário prometido
  // ou ficar dentro da margem crítica de alerta (slaWarningBufferMin)
  const bufferMs = slaConfig.slaWarningBufferMin * 60000;
  if (
    estimatedReadyMs > promisedMs ||
    promisedMs - estimatedReadyMs <= bufferMs ||
    remainingToPromiseMin <= slaConfig.slaWarningBufferMin
  ) {
    return {
      state: 'at_risk',
      legacyState: 'warning',
      label: 'Em Risco',
      promisedTimeAt: params.promisedTimeAt,
      estimatedOrderReadyAt: params.estimatedOrderReadyAt,
      predictedDelayMin,
      remainingToPromiseMin,
      isPredictedToDelay: estimatedReadyMs > promisedMs,
    };
  }

  return {
    state: 'on_time',
    legacyState: 'normal',
    label: 'No Prazo',
    promisedTimeAt: params.promisedTimeAt,
    estimatedOrderReadyAt: params.estimatedOrderReadyAt,
    predictedDelayMin: 0,
    remainingToPromiseMin,
    isPredictedToDelay: false,
  };
}

/**
 * 5. Cálculo de recommended_start_at para Pedidos Agendados (Seção 21)
 * Considera:
 * - horário agendado (scheduledFor);
 * - duração total sequencial do caminho crítico;
 * - fila atual das estações no caminho crítico;
 * - buffer configurável do tenant (schedulePreparationBufferMin).
 */
export function calculateRecommendedStartAt(params: {
  scheduledFor?: string | null;
  criticalPathDurationSeconds: number;
  slaConfig?: TenantSlaConfig;
}): string | null {
  if (!params.scheduledFor) return null;
  const scheduledMs = new Date(params.scheduledFor).getTime();
  if (Number.isNaN(scheduledMs)) return null;

  const slaConfig = params.slaConfig || DEFAULT_TENANT_SLA_CONFIG;
  const bufferSec = slaConfig.schedulePreparationBufferMin * 60;
  const minPrepSec = Math.max(
    params.criticalPathDurationSeconds,
    slaConfig.targetPreparationTimeMin * 60
  );

  const totalLeadMs = (minPrepSec + bufferSec) * 1000;
  return new Date(scheduledMs - totalLeadMs).toISOString();
}

/**
 * 6. Repriorização Dinâmica Multiestação (Seção 20)
 */
export function calculateMultiStationPriority(params: {
  status: 'confirmed' | 'preparing' | 'ready';
  fulfillmentType: FulfillmentType;
  scheduleType: ScheduleType;
  scheduledFor?: string | null;
  recommendedStartAt?: string | null;
  confirmedElapsedMin: number;
  prepElapsedMin: number;
  criticalPathDurationMin: number;
  advancedSla: AdvancedOrderSlaEvaluation;
  bottleneckStationSaturation?: StationSaturationState;
  now?: Date;
}): {
  score: number;
  level: 'normal' | 'high' | 'critical';
  isScheduledFutureHold: boolean;
  reasons: string[];
} {
  const nowMs = (params.now || new Date()).getTime();
  let score = 0;
  const reasons: string[] = [];
  let isScheduledFutureHold = false;

  // 1. Janela de agendamento inteligente com recommendedStartAt
  if (params.scheduleType === 'scheduled' && params.scheduledFor) {
    const startTargetIso = params.recommendedStartAt || params.scheduledFor;
    const startTargetMs = new Date(startTargetIso).getTime();
    const minUntilRecommendedStart = (startTargetMs - nowMs) / 60000;

    if (minUntilRecommendedStart > 15) {
      score -= 100;
      isScheduledFutureHold = true;
      reasons.push('Agendado fora da janela imediata de início');
    } else if (minUntilRecommendedStart <= 0) {
      score += 80;
      reasons.push('Horário recomendado de início atingido');
    } else {
      score += 40;
      reasons.push('Próximo do horário recomendado de início');
    }
  }

  // 2. Peso de SLA Avançado (Delayed > At Risk > On Time)
  if (params.advancedSla.state === 'delayed') {
    score += 130;
    reasons.push('SLA estourado');
  } else if (params.advancedSla.state === 'at_risk') {
    score += 75;
    reasons.push(
      params.advancedSla.isPredictedToDelay
        ? `Atraso previsto (+${params.advancedSla.predictedDelayMin}m)`
        : 'Em risco de SLA'
    );
  }

  // 3. Peso de gargalo na estação crítica
  if (params.bottleneckStationSaturation === 'saturated') {
    score += 25;
    reasons.push('Estação crítica saturada');
  } else if (params.bottleneckStationSaturation === 'warning') {
    score += 10;
  }

  // 4. Peso de caminho crítico restante + tempo decorrido
  score += Math.min(40, Math.round(params.criticalPathDurationMin * 1.2));
  score += Math.min(50, params.prepElapsedMin * 2);
  score += Math.min(40, Math.round(params.confirmedElapsedMin * 1.5));

  if (params.fulfillmentType === 'delivery') {
    score += 5;
  }

  const rounded = Math.round(score);
  let level: 'normal' | 'high' | 'critical' = 'normal';
  if (params.advancedSla.state === 'delayed' || rounded >= 115) {
    level = 'critical';
  } else if (params.advancedSla.state === 'at_risk' || rounded >= 60) {
    level = 'high';
  }

  return {
    score: rounded,
    level,
    isScheduledFutureHold,
    reasons,
  };
}

/**
 * 7. Métricas Históricas por Estação com Amostra Mínima (Seções 36 e 38)
 */
export function calculateStationOperationalMetrics(params: {
  stations: ProductionStation[];
  completedSteps: Array<{
    station_id?: string | null;
    snapshot_station_slug: string;
    started_at?: string | null;
    completed_at?: string | null;
  }>;
  minSampleRequired?: number;
}): StationHistoricalPerformance[] {
  const minSample = params.minSampleRequired ?? 3;

  return params.stations.map((station) => {
    const durationsSec: number[] = [];

    for (const s of params.completedSteps) {
      const matches =
        s.station_id === station.id || s.snapshot_station_slug === station.slug;
      if (!matches || !s.started_at || !s.completed_at) continue;

      const startMs = new Date(s.started_at).getTime();
      const endMs = new Date(s.completed_at).getTime();
      if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs < startMs) continue;

      durationsSec.push(Math.max(5, Math.round((endMs - startMs) / 1000)));
    }

    if (durationsSec.length < minSample) {
      return {
        stationId: station.id,
        stationName: station.name,
        stationSlug: station.slug,
        sampleCount: durationsSec.length,
        hasSufficientData: false,
        message: 'Dados insuficientes',
        avgExecutionSeconds: null,
        avgExecutionMinutes: null,
        configuredDefaultSeconds: station.default_duration_seconds,
      };
    }

    const avgSec = Math.round(
      durationsSec.reduce((acc, v) => acc + v, 0) / durationsSec.length
    );

    return {
      stationId: station.id,
      stationName: station.name,
      stationSlug: station.slug,
      sampleCount: durationsSec.length,
      hasSufficientData: true,
      message: 'Amostra estatística válida',
      avgExecutionSeconds: avgSec,
      avgExecutionMinutes: Number((avgSec / 60).toFixed(1)),
      configuredDefaultSeconds: station.default_duration_seconds,
    };
  });
}

/**
 * 8. Base para Auto-Calibração Futura sem Alteração Automática (Seções 37, 38 e 39)
 * Quando o tempo médio real divergir significativamente (>= 25% e >= 60s) da estimativa
 * configurada e houver amostra suficiente (>= minSampleRequired), gera sugestão
 * "Revisar estimativa" sem sobrescrever automaticamente a configuração.
 */
export function calculateProductCalibrationSuggestions(params: {
  completedItemSteps: Array<{
    productName: string;
    stationName: string;
    stepOrder: number;
    estimatedDurationSeconds: number;
    startedAt?: string | null;
    completedAt?: string | null;
  }>;
  minSampleRequired?: number;
}): CalibrationReport {
  const minSample = params.minSampleRequired ?? 3;
  const groups = new Map<
    string,
    {
      productName: string;
      stationName: string;
      stepOrder: number;
      configuredDurationSeconds: number;
      observedDurations: number[];
    }
  >();

  for (const entry of params.completedItemSteps) {
    if (!entry.startedAt || !entry.completedAt || !entry.productName) continue;
    const sMs = new Date(entry.startedAt).getTime();
    const eMs = new Date(entry.completedAt).getTime();
    if (Number.isNaN(sMs) || Number.isNaN(eMs) || eMs < sMs) continue;

    const realSec = Math.max(5, Math.round((eMs - sMs) / 1000));
    const key = `${entry.productName}::${entry.stepOrder}::${entry.stationName}`;
    const existing = groups.get(key) || {
      productName: entry.productName,
      stationName: entry.stationName,
      stepOrder: entry.stepOrder,
      configuredDurationSeconds: entry.estimatedDurationSeconds,
      observedDurations: [],
    };
    existing.observedDurations.push(realSec);
    groups.set(key, existing);
  }

  const suggestions: ProductStepCalibrationSuggestion[] = [];

  for (const group of groups.values()) {
    if (group.observedDurations.length < minSample) continue;

    const avgSec = Math.round(
      group.observedDurations.reduce((a, b) => a + b, 0) /
        group.observedDurations.length
    );
    const diffSec = Math.abs(avgSec - group.configuredDurationSeconds);
    const divergencePct = Math.round(
      ((avgSec - group.configuredDurationSeconds) /
        Math.max(1, group.configuredDurationSeconds)) *
        100
    );

    const needsReview = Math.abs(divergencePct) >= 25 && diffSec >= 60;

    suggestions.push({
      productName: group.productName,
      stationName: group.stationName,
      stepOrder: group.stepOrder,
      sampleCount: group.observedDurations.length,
      configuredDurationSeconds: group.configuredDurationSeconds,
      observedAvgDurationSeconds: avgSec,
      divergencePct,
      recommendation: needsReview ? 'Revisar estimativa' : 'Estimativa calibrada',
      suggestedDurationSeconds: Math.round(avgSec / 30) * 30 || 60,
    });
  }

  suggestions.sort((a, b) => Math.abs(b.divergencePct) - Math.abs(a.divergencePct));

  if (suggestions.length === 0) {
    return {
      hasSufficientData: false,
      minSampleRequired: minSample,
      message: 'Dados insuficientes',
      suggestions: [],
    };
  }

  return {
    hasSufficientData: true,
    minSampleRequired: minSample,
    message: 'Análise de calibração calculada com base no histórico real.',
    suggestions,
  };
}

