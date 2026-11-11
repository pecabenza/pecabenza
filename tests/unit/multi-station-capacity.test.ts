import { describe, it, expect } from 'vitest';
import {
  resolveItemProductionFlow,
  calculateStationLoad,
  calculateOrderCriticalPathAndPrediction,
  calculateAdvancedOrderSla,
  calculateRecommendedStartAt,
  calculateMultiStationPriority,
  calculateStationOperationalMetrics,
  calculateProductCalibrationSuggestions,
} from '@/modules/orders/station-capacity.engine';
import type {
  ProductionStation,
  ProductProductionStep,
  OrderItemProductionStep,
} from '@/types/database.types';
import { DEFAULT_TENANT_SLA_CONFIG } from '@/modules/orders/kds.engine';

const TENANT_ID = '00000000-0000-0000-0000-000000000001';

const STATIONS: ProductionStation[] = [
  {
    id: 'st-grill',
    tenant_id: TENANT_ID,
    name: 'Chapa Quente',
    slug: 'chapa-quente',
    description: 'Chapa e grelhados',
    display_order: 1,
    station_type: 'grill',
    is_active: true,
    default_capacity: 4,
    default_duration_seconds: 480,
    created_at: '2026-11-08T10:00:00Z',
    updated_at: '2026-11-08T10:00:00Z',
  },
  {
    id: 'st-assembly',
    tenant_id: TENANT_ID,
    name: 'Montagem',
    slug: 'montagem',
    description: 'Montagem de pratos',
    display_order: 2,
    station_type: 'assembly',
    is_active: true,
    default_capacity: 3,
    default_duration_seconds: 300,
    created_at: '2026-11-08T10:00:00Z',
    updated_at: '2026-11-08T10:00:00Z',
  },
  {
    id: 'st-expedition',
    tenant_id: TENANT_ID,
    name: 'Expedição',
    slug: 'expedicao',
    description: 'Conferência final',
    display_order: 3,
    station_type: 'expedition',
    is_active: true,
    default_capacity: 6,
    default_duration_seconds: 180,
    created_at: '2026-11-08T10:00:00Z',
    updated_at: '2026-11-08T10:00:00Z',
  },
];

describe('Etapa 3B — Motor Multiestação, Etapas Sequenciais, Capacidade e Caminho Crítico', () => {
  it('1. Deve resolver produto com 1 única etapa configurada', () => {
    const productSteps: ProductProductionStep[] = [
      {
        id: 'ps-1',
        tenant_id: TENANT_ID,
        product_id: 'prod-feijoada',
        variant_id: null,
        station_id: 'st-expedition',
        step_order: 1,
        estimated_duration_seconds: 240,
        capacity_weight: 1,
        is_active: true,
        created_at: '2026-11-08T10:00:00Z',
        updated_at: '2026-11-08T10:00:00Z',
      },
    ];

    const flow = resolveItemProductionFlow({
      productId: 'prod-feijoada',
      variantId: 'var-500g',
      quantity: 2,
      stations: STATIONS,
      productSteps,
    });

    expect(flow).toHaveLength(1);
    expect(flow[0].stepOrder).toBe(1);
    expect(flow[0].stationSlug).toBe('expedicao');
    expect(flow[0].status).toBe('pending');
    expect(flow[0].estimatedDurationSeconds).toBe(240);
    expect(flow[0].capacityWeight).toBe(2);
    expect(flow[0].source).toBe('product');
  });

  it('2 e 5. Deve resolver produto com 3 etapas sequenciais onde Etapa 1 inicia pending e Etapas 2 e 3 iniciam blocked', () => {
    const productSteps: ProductProductionStep[] = [
      {
        id: 'ps-1',
        tenant_id: TENANT_ID,
        product_id: 'prod-burger',
        variant_id: null,
        station_id: 'st-grill',
        step_order: 1,
        estimated_duration_seconds: 420,
        capacity_weight: 1,
        is_active: true,
        created_at: '2026-11-08T10:00:00Z',
        updated_at: '2026-11-08T10:00:00Z',
      },
      {
        id: 'ps-2',
        tenant_id: TENANT_ID,
        product_id: 'prod-burger',
        variant_id: null,
        station_id: 'st-assembly',
        step_order: 2,
        estimated_duration_seconds: 240,
        capacity_weight: 1,
        is_active: true,
        created_at: '2026-11-08T10:00:00Z',
        updated_at: '2026-11-08T10:00:00Z',
      },
      {
        id: 'ps-3',
        tenant_id: TENANT_ID,
        product_id: 'prod-burger',
        variant_id: null,
        station_id: 'st-expedition',
        step_order: 3,
        estimated_duration_seconds: 120,
        capacity_weight: 1,
        is_active: true,
        created_at: '2026-11-08T10:00:00Z',
        updated_at: '2026-11-08T10:00:00Z',
      },
    ];

    const flow = resolveItemProductionFlow({
      productId: 'prod-burger',
      variantId: null,
      quantity: 1,
      stations: STATIONS,
      productSteps,
    });

    expect(flow).toHaveLength(3);
    expect(flow[0]).toMatchObject({
      stepOrder: 1,
      stationSlug: 'chapa-quente',
      status: 'pending',
    });
    expect(flow[1]).toMatchObject({
      stepOrder: 2,
      stationSlug: 'montagem',
      status: 'blocked',
    });
    expect(flow[2]).toMatchObject({
      stepOrder: 3,
      stationSlug: 'expedicao',
      status: 'blocked',
    });
  });

  it('3. Deve garantir precedência da Variante sobre o fluxo padrão do Produto', () => {
    const productSteps: ProductProductionStep[] = [
      // Fluxo do produto geral (1 etapa)
      {
        id: 'ps-prod',
        tenant_id: TENANT_ID,
        product_id: 'prod-feijoada',
        variant_id: null,
        station_id: 'st-expedition',
        step_order: 1,
        estimated_duration_seconds: 180,
        capacity_weight: 1,
        is_active: true,
        created_at: '2026-11-08T10:00:00Z',
        updated_at: '2026-11-08T10:00:00Z',
      },
      // Fluxo específico da variante Família (2 etapas)
      {
        id: 'ps-var-1',
        tenant_id: TENANT_ID,
        product_id: 'prod-feijoada',
        variant_id: 'var-familia',
        station_id: 'st-grill',
        step_order: 1,
        estimated_duration_seconds: 600,
        capacity_weight: 2,
        is_active: true,
        created_at: '2026-11-08T10:00:00Z',
        updated_at: '2026-11-08T10:00:00Z',
      },
      {
        id: 'ps-var-2',
        tenant_id: TENANT_ID,
        product_id: 'prod-feijoada',
        variant_id: 'var-familia',
        station_id: 'st-assembly',
        step_order: 2,
        estimated_duration_seconds: 300,
        capacity_weight: 2,
        is_active: true,
        created_at: '2026-11-08T10:00:00Z',
        updated_at: '2026-11-08T10:00:00Z',
      },
    ];

    const variantFlow = resolveItemProductionFlow({
      productId: 'prod-feijoada',
      variantId: 'var-familia',
      quantity: 1,
      stations: STATIONS,
      productSteps,
    });

    expect(variantFlow).toHaveLength(2);
    expect(variantFlow[0].source).toBe('variant');
    expect(variantFlow[0].stationSlug).toBe('chapa-quente');
    expect(variantFlow[0].estimatedDurationSeconds).toBe(600);
    expect(variantFlow[1].stationSlug).toBe('montagem');
    expect(variantFlow[1].status).toBe('blocked');
  });

  it('4. Deve gerar fallback automático de 1 etapa quando o produto não possui etapas configuradas', () => {
    const flow = resolveItemProductionFlow({
      productId: 'prod-sem-fluxo',
      variantId: 'var-1',
      quantity: 1,
      stations: STATIONS,
      productSteps: [],
    });

    expect(flow).toHaveLength(1);
    expect(flow[0].source).toBe('fallback');
    expect(flow[0].stepOrder).toBe(1);
    expect(flow[0].status).toBe('pending');
    expect(flow[0].stationSlug).toBe('chapa-quente');
  });

  it('6, 7, 8 e 9. Deve simular máquina de estados de etapas sequenciais, bloqueio de etapa futura, desbloqueio e conclusão somente quando todas as estações terminarem', () => {
    // Simulador determinístico em memória das regras das RPCs start/complete/override
    const steps: OrderItemProductionStep[] = [
      {
        id: 'step-item1-1',
        tenant_id: TENANT_ID,
        order_id: 'ord-1',
        order_item_id: 'item-1',
        station_id: 'st-grill',
        snapshot_station_name: 'Chapa Quente',
        snapshot_station_slug: 'chapa-quente',
        snapshot_station_type: 'grill',
        step_order: 1,
        status: 'pending',
        estimated_duration_seconds: 300,
        capacity_weight: 1,
        created_at: '2026-11-08T12:00:00Z',
        updated_at: '2026-11-08T12:00:00Z',
      },
      {
        id: 'step-item1-2',
        tenant_id: TENANT_ID,
        order_id: 'ord-1',
        order_item_id: 'item-1',
        station_id: 'st-assembly',
        snapshot_station_name: 'Montagem',
        snapshot_station_slug: 'montagem',
        snapshot_station_type: 'assembly',
        step_order: 2,
        status: 'blocked',
        estimated_duration_seconds: 180,
        capacity_weight: 1,
        created_at: '2026-11-08T12:00:00Z',
        updated_at: '2026-11-08T12:00:00Z',
      },
      {
        id: 'step-item2-1',
        tenant_id: TENANT_ID,
        order_id: 'ord-1',
        order_item_id: 'item-2',
        station_id: 'st-expedition',
        snapshot_station_name: 'Expedição',
        snapshot_station_slug: 'expedicao',
        snapshot_station_type: 'expedition',
        step_order: 1,
        status: 'pending',
        estimated_duration_seconds: 120,
        capacity_weight: 1,
        created_at: '2026-11-08T12:00:00Z',
        updated_at: '2026-11-08T12:00:00Z',
      },
    ];

    const completeStepSim = (stepId: string) => {
      const step = steps.find((s) => s.id === stepId)!;
      if (step.status === 'blocked') {
        return {
          success: false,
          error: 'Não é permitido concluir uma etapa bloqueada.',
        };
      }
      if (step.status === 'ready') {
        return { success: true, idempotent: true };
      }
      step.status = 'ready';
      step.completed_at = '2026-11-08T12:05:00Z';

      const nextBlocked = steps
        .filter(
          (s) =>
            s.order_item_id === step.order_item_id &&
            s.step_order > step.step_order &&
            s.status === 'blocked'
        )
        .sort((a, b) => a.step_order - b.step_order)[0];

      if (nextBlocked) {
        nextBlocked.status = 'pending';
      }

      const allOrderStepsDone = steps.every((s) =>
        ['ready', 'skipped'].includes(s.status)
      );
      return {
        success: true,
        idempotent: false,
        unlockedNextStepId: nextBlocked?.id || null,
        allOrderStepsDone,
      };
    };

    // Cenário 7: Tentativa de concluir etapa 2 bloqueada -> REJEITADA
    const blockedAttempt = completeStepSim('step-item1-2');
    expect(blockedAttempt.success).toBe(false);
    expect(blockedAttempt.error).toContain('bloqueada');

    // Cenário 6: Conclusão da etapa 1 desbloqueia etapa 2
    const step1Done = completeStepSim('step-item1-1');
    expect(step1Done.success).toBe(true);
    expect(step1Done.unlockedNextStepId).toBe('step-item1-2');
    expect(steps.find((s) => s.id === 'step-item1-2')?.status).toBe('pending');
    expect(step1Done.allOrderStepsDone).toBe(false);

    // Cenário 8 e 9: Conclui item 2 na expedição, mas etapa 2 do item 1 ainda está pending -> pedido não pode liberar
    const item2Done = completeStepSim('step-item2-1');
    expect(item2Done.allOrderStepsDone).toBe(false);

    // Conclui etapa 2 do item 1 -> agora todas as etapas de todos os itens terminaram
    const step2Done = completeStepSim('step-item1-2');
    expect(step2Done.allOrderStepsDone).toBe(true);
  });

  it('10 e 11. Deve calcular carga da estação e classificar saturação em normal, warning e saturated', () => {
    const now = new Date('2026-11-08T12:10:00Z');
    const station = STATIONS[1]; // Montagem: default_capacity = 3

    // Caso 1: Normal (1 em preparo, 0 na fila)
    const normalLoad = calculateStationLoad({
      station,
      activeSteps: [
        {
          id: 's1',
          station_id: station.id,
          snapshot_station_slug: station.slug,
          status: 'preparing',
          estimated_duration_seconds: 300,
          capacity_weight: 1,
          started_at: '2026-11-08T12:08:00Z',
        },
      ],
      now,
    });
    expect(normalLoad.inUseUnits).toBe(1);
    expect(normalLoad.saturationState).toBe('normal');
    expect(normalLoad.estimatedQueueWaitSeconds).toBe(0);

    // Caso 2: Alta Carga / Warning (3 em preparo = 100% da capacidade)
    const warningLoad = calculateStationLoad({
      station,
      activeSteps: [
        {
          id: 's1',
          station_id: station.id,
          snapshot_station_slug: station.slug,
          status: 'preparing',
          estimated_duration_seconds: 300,
          capacity_weight: 2,
          started_at: '2026-11-08T12:09:00Z',
        },
        {
          id: 's2',
          station_id: station.id,
          snapshot_station_slug: station.slug,
          status: 'preparing',
          estimated_duration_seconds: 300,
          capacity_weight: 1,
          started_at: '2026-11-08T12:09:00Z',
        },
      ],
      now,
    });
    expect(warningLoad.inUseUnits).toBe(3);
    expect(warningLoad.saturationState).toBe('warning');
    expect(warningLoad.saturationLabel).toBe('Alta Carga');

    // Caso 3: Saturada (3 em preparo + 4 aguardando na fila)
    const saturatedLoad = calculateStationLoad({
      station,
      activeSteps: [
        {
          id: 's1',
          station_id: station.id,
          snapshot_station_slug: station.slug,
          status: 'preparing',
          estimated_duration_seconds: 600,
          capacity_weight: 3,
          started_at: '2026-11-08T12:09:00Z',
        },
        {
          id: 's2',
          station_id: station.id,
          snapshot_station_slug: station.slug,
          status: 'pending',
          estimated_duration_seconds: 600,
          capacity_weight: 4,
          started_at: null,
        },
      ],
      now,
    });
    expect(saturatedLoad.saturationState).toBe('saturated');
    expect(saturatedLoad.saturationLabel).toBe('Saturada');
    expect(saturatedLoad.estimatedQueueWaitSeconds).toBeGreaterThan(600);
  });

  it('12 e 13. Deve calcular previsão de conclusão pelo caminho crítico (paralelismo entre itens) e detectar pedido at_risk antes de estourar o prazo', () => {
    const now = new Date('2026-11-08T12:00:00Z');
    const stationLoadsBySlug = new Map();

    // Item A leva 18 min (Chapa 10m + Montagem 8m). Item B leva 4 min (Expedição 4m).
    // Como Item A e Item B são itens diferentes do pedido, o caminho crítico do pedido deve ser 18 min (1080s), NÃO 22 min!
    const critical = calculateOrderCriticalPathAndPrediction({
      orderId: 'ord-crit',
      items: [
        {
          orderItemId: 'item-A',
          productName: 'Hambúrguer Artesanal',
          variantName: 'Duplo',
          quantity: 1,
          steps: [
            {
              id: 'st-a1',
              tenant_id: TENANT_ID,
              order_id: 'ord-crit',
              order_item_id: 'item-A',
              station_id: 'st-grill',
              snapshot_station_name: 'Chapa Quente',
              snapshot_station_slug: 'chapa-quente',
              snapshot_station_type: 'grill',
              step_order: 1,
              status: 'pending',
              estimated_duration_seconds: 600,
              capacity_weight: 1,
              created_at: now.toISOString(),
              updated_at: now.toISOString(),
            },
            {
              id: 'st-a2',
              tenant_id: TENANT_ID,
              order_id: 'ord-crit',
              order_item_id: 'item-A',
              station_id: 'st-assembly',
              snapshot_station_name: 'Montagem',
              snapshot_station_slug: 'montagem',
              snapshot_station_type: 'assembly',
              step_order: 2,
              status: 'blocked',
              estimated_duration_seconds: 480,
              capacity_weight: 1,
              created_at: now.toISOString(),
              updated_at: now.toISOString(),
            },
          ],
        },
        {
          orderItemId: 'item-B',
          productName: 'Refrigerante Lata',
          variantName: '350ml',
          quantity: 1,
          steps: [
            {
              id: 'st-b1',
              tenant_id: TENANT_ID,
              order_id: 'ord-crit',
              order_item_id: 'item-B',
              station_id: 'st-expedition',
              snapshot_station_name: 'Expedição',
              snapshot_station_slug: 'expedicao',
              snapshot_station_type: 'expedition',
              step_order: 1,
              status: 'pending',
              estimated_duration_seconds: 240,
              capacity_weight: 1,
              created_at: now.toISOString(),
              updated_at: now.toISOString(),
            },
          ],
        },
      ],
      stationLoadsBySlug,
      now,
    });

    expect(critical.criticalPathDurationSeconds).toBe(1080); // 600 + 480
    expect(critical.criticalPathDurationMin).toBe(18);
    expect(critical.bottleneckProductName).toBe('Hambúrguer Artesanal');
    expect(critical.bottleneckStationName).toBe('Chapa Quente');

    // Cenário 13: Horário prometido é 12:12 (daqui a 12 min), mas o caminho crítico prevê conclusão às 12:18 (+6m de atraso previsto).
    // Mesmo faltando 12 min no relógio, o SLA avançado deve detectar 'at_risk' preditivamente!
    const promisedTimeAt = new Date('2026-11-08T12:12:00Z').toISOString();
    const advSla = calculateAdvancedOrderSla({
      status: 'preparing',
      promisedTimeAt,
      estimatedOrderReadyAt: critical.estimatedOrderReadyAt,
      slaConfig: DEFAULT_TENANT_SLA_CONFIG,
      now,
    });

    expect(advSla.state).toBe('at_risk');
    expect(advSla.isPredictedToDelay).toBe(true);
    expect(advSla.predictedDelayMin).toBe(6);
  });

  it('14. Deve calcular recommended_start_at para pedido agendado considerando caminho crítico e buffer', () => {
    // Pedido agendado para 13:00. Caminho crítico de 35 min (2100s) + Buffer de 5 min (300s) = 40 min antes -> 12:20!
    const scheduledFor = '2026-11-08T13:00:00.000Z';
    const recommended = calculateRecommendedStartAt({
      scheduledFor,
      criticalPathDurationSeconds: 2100,
      slaConfig: DEFAULT_TENANT_SLA_CONFIG,
    });

    expect(recommended).toBe('2026-11-08T12:20:00.000Z');

    // Priority evaluation quando faltam 90 min para o recommended_start_at -> fica em hold
    const priorityHold = calculateMultiStationPriority({
      status: 'confirmed',
      fulfillmentType: 'delivery',
      scheduleType: 'scheduled',
      scheduledFor,
      recommendedStartAt: recommended,
      confirmedElapsedMin: 5,
      prepElapsedMin: 0,
      criticalPathDurationMin: 35,
      advancedSla: {
        state: 'on_time',
        legacyState: 'normal',
        label: 'No Prazo',
        promisedTimeAt: scheduledFor,
        estimatedOrderReadyAt: '2026-11-08T12:35:00.000Z',
        predictedDelayMin: 0,
        remainingToPromiseMin: 120,
        isPredictedToDelay: false,
      },
      now: new Date('2026-11-08T10:30:00.000Z'),
    });

    expect(priorityHold.isScheduledFutureHold).toBe(true);
  });

  it('15 e 16. Deve proteger amostra mínima ("Dados insuficientes") e sugerir calibração sem alterar configuração automaticamente', () => {
    // Amostra insuficiente (apenas 2 execuções quando mínimo = 3)
    const insufficientMetrics = calculateStationOperationalMetrics({
      stations: [STATIONS[0]],
      completedSteps: [
        {
          station_id: 'st-grill',
          snapshot_station_slug: 'chapa-quente',
          started_at: '2026-11-08T10:00:00Z',
          completed_at: '2026-11-08T10:10:00Z',
        },
        {
          station_id: 'st-grill',
          snapshot_station_slug: 'chapa-quente',
          started_at: '2026-11-08T10:20:00Z',
          completed_at: '2026-11-08T10:30:00Z',
        },
      ],
      minSampleRequired: 3,
    });

    expect(insufficientMetrics[0].hasSufficientData).toBe(false);
    expect(insufficientMetrics[0].message).toBe('Dados insuficientes');

    // Auto-calibração com 3 amostras reais levando 12 min (720s) enquanto a estimativa configurada era 5 min (300s)
    const originalConfiguredSec = 300;
    const calibration = calculateProductCalibrationSuggestions({
      completedItemSteps: [
        {
          productName: 'Lasanha Artesanal',
          stationName: 'Forno',
          stepOrder: 1,
          estimatedDurationSeconds: originalConfiguredSec,
          startedAt: '2026-11-08T10:00:00Z',
          completedAt: '2026-11-08T10:12:00Z',
        },
        {
          productName: 'Lasanha Artesanal',
          stationName: 'Forno',
          stepOrder: 1,
          estimatedDurationSeconds: originalConfiguredSec,
          startedAt: '2026-11-08T10:20:00Z',
          completedAt: '2026-11-08T10:32:00Z',
        },
        {
          productName: 'Lasanha Artesanal',
          stationName: 'Forno',
          stepOrder: 1,
          estimatedDurationSeconds: originalConfiguredSec,
          startedAt: '2026-11-08T10:40:00Z',
          completedAt: '2026-11-08T10:52:00Z',
        },
      ],
      minSampleRequired: 3,
    });

    expect(calibration.hasSufficientData).toBe(true);
    expect(calibration.suggestions).toHaveLength(1);
    expect(calibration.suggestions[0].recommendation).toBe('Revisar estimativa');
    expect(calibration.suggestions[0].observedAvgDurationSeconds).toBe(720);
    // Confirma que a estimativa original informada permanece preservada como referência
    expect(calibration.suggestions[0].configuredDurationSeconds).toBe(300);
  });
});

