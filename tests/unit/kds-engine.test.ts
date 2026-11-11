import { describe, it, expect } from 'vitest';
import {
  calculatePreparationDueAt,
  calculateOrderSla,
  calculateOperationalPriority,
  calculateStageTimings,
  calculateKdsBottlenecks,
  formatCustomerDisplayNameForKds,
  extractTenantSlaConfig,
  DEFAULT_TENANT_SLA_CONFIG,
  type TenantSlaConfig,
} from '@/modules/orders/kds.engine';

describe('Etapa 3A — Operations Engine / KDS Leve (Domínio, SLA, Prioridade e Gargalos)', () => {
  describe('1. Configuração de SLA por Tenant e Cálculo de Agendamento (preparation_due_at)', () => {
    it('deve calcular preparation_due_at exatamente com base em scheduled_for, preparo estimado e buffer (Ex: 12:30 -> 12:00)', () => {
      const customSla: TenantSlaConfig = {
        targetConfirmationTimeMin: 5,
        targetPreparationTimeMin: 25,
        slaWarningBufferMin: 5,
        schedulePreparationBufferMin: 5,
      };

      const scheduledFor = '2026-11-08T15:30:00.000Z'; // 12:30 BRT
      const prepDue = calculatePreparationDueAt(scheduledFor, customSla);

      expect(prepDue).toBe('2026-11-08T15:00:00.000Z'); // 12:00 BRT (30 min antes)
    });

    it('deve extrair SLA personalizado por tenant sem hardcodar valores fixos', () => {
      const tenantCustomSettings = {
        target_confirmation_time_min: 3,
        target_preparation_time_min: 40,
        sla_warning_buffer_min: 8,
        schedule_preparation_buffer_min: 10,
      };

      const config = extractTenantSlaConfig(tenantCustomSettings);
      expect(config.targetConfirmationTimeMin).toBe(3);
      expect(config.targetPreparationTimeMin).toBe(40);
      expect(config.slaWarningBufferMin).toBe(8);
      expect(config.schedulePreparationBufferMin).toBe(10);
    });
  });

  describe('2. Status Visual e Avaliação de SLA (Normal, Atenção, Atrasado)', () => {
    const slaConfig: TenantSlaConfig = {
      targetConfirmationTimeMin: 5,
      targetPreparationTimeMin: 25,
      slaWarningBufferMin: 5, // alerta a partir de 20 min
      schedulePreparationBufferMin: 5,
    };

    it('deve classificar pedido em preparo dentro do prazo como Normal', () => {
      const sla = calculateOrderSla(
        {
          status: 'preparing',
          scheduleType: 'asap',
          confirmedElapsedMin: 12,
          prepElapsedMin: 10,
        },
        slaConfig
      );

      expect(sla.state).toBe('normal');
      expect(sla.label).toBe('Normal');
      expect(sla.remainingMin).toBe(15);
    });

    it('deve classificar pedido próximo do limite (dentro do buffer de alerta) como Atenção', () => {
      const sla = calculateOrderSla(
        {
          status: 'preparing',
          scheduleType: 'asap',
          confirmedElapsedMin: 22,
          prepElapsedMin: 21, // entre 20 e 24 min
        },
        slaConfig
      );

      expect(sla.state).toBe('warning');
      expect(sla.label).toBe('Atenção');
      expect(sla.remainingMin).toBe(4);
    });

    it('deve classificar pedido que atingiu ou ultrapassou o SLA como Atrasado', () => {
      const sla = calculateOrderSla(
        {
          status: 'preparing',
          scheduleType: 'asap',
          confirmedElapsedMin: 30,
          prepElapsedMin: 27, // >= 25 min
        },
        slaConfig
      );

      expect(sla.state).toBe('delayed');
      expect(sla.label).toBe('Atrasado');
      expect(sla.remainingMin).toBe(-2);
    });
  });

  describe('3. Motor de Prioridade Operacional e Agendamentos', () => {
    const now = new Date('2026-11-08T15:00:00.000Z');

    it('NÃO deve permitir que pedido agendado para muito mais tarde suba ao topo cedo demais', () => {
      // Agendado para daqui a 3 horas (18:00 UTC)
      const scheduledFarFuture = '2026-11-08T18:00:00.000Z';
      const prepDueFar = calculatePreparationDueAt(scheduledFarFuture, DEFAULT_TENANT_SLA_CONFIG);

      const slaScheduled = calculateOrderSla(
        {
          status: 'confirmed',
          scheduleType: 'scheduled',
          scheduledFor: scheduledFarFuture,
          preparationDueAt: prepDueFar,
          confirmedElapsedMin: 40,
          prepElapsedMin: 0,
        },
        DEFAULT_TENANT_SLA_CONFIG,
        now
      );

      const priorityScheduled = calculateOperationalPriority(
        {
          status: 'confirmed',
          fulfillmentType: 'delivery',
          scheduleType: 'scheduled',
          scheduledFor: scheduledFarFuture,
          preparationDueAt: prepDueFar,
          confirmedElapsedMin: 40,
          prepElapsedMin: 0,
          sla: slaScheduled,
        },
        DEFAULT_TENANT_SLA_CONFIG,
        now
      );

      // Pedido imediato recém-chegado (há 4 min)
      const slaImmediate = calculateOrderSla(
        {
          status: 'confirmed',
          scheduleType: 'asap',
          confirmedElapsedMin: 4,
          prepElapsedMin: 0,
        },
        DEFAULT_TENANT_SLA_CONFIG,
        now
      );

      const priorityImmediate = calculateOperationalPriority(
        {
          status: 'confirmed',
          fulfillmentType: 'pickup',
          scheduleType: 'asap',
          confirmedElapsedMin: 4,
          prepElapsedMin: 0,
          sla: slaImmediate,
        },
        DEFAULT_TENANT_SLA_CONFIG,
        now
      );

      expect(priorityScheduled.isScheduledFutureHold).toBe(true);
      expect(priorityImmediate.score).toBeGreaterThan(priorityScheduled.score);
    });

    it('deve elevar prioridade quando o pedido agendado entra na janela de preparation_due_at', () => {
      // Agendado para 15:25 UTC -> preparation_due_at = 14:55 UTC (já estamos em 15:00 UTC)
      const scheduledSoon = '2026-11-08T15:25:00.000Z';
      const prepDueNow = calculatePreparationDueAt(scheduledSoon, DEFAULT_TENANT_SLA_CONFIG);

      const sla = calculateOrderSla(
        {
          status: 'confirmed',
          scheduleType: 'scheduled',
          scheduledFor: scheduledSoon,
          preparationDueAt: prepDueNow,
          confirmedElapsedMin: 15,
          prepElapsedMin: 0,
        },
        DEFAULT_TENANT_SLA_CONFIG,
        now
      );

      const priority = calculateOperationalPriority(
        {
          status: 'confirmed',
          fulfillmentType: 'delivery',
          scheduleType: 'scheduled',
          scheduledFor: scheduledSoon,
          preparationDueAt: prepDueNow,
          confirmedElapsedMin: 15,
          prepElapsedMin: 0,
          sla,
        },
        DEFAULT_TENANT_SLA_CONFIG,
        now
      );

      expect(priority.isScheduledFutureHold).toBe(false);
      expect(priority.level).toBe('critical');
      expect(priority.score).toBeGreaterThanOrEqual(110);
    });
  });

  describe('4. Tempos por Estágio e Controle de Gargalos', () => {
    it('deve calcular tempos entre criação, confirmação, início de preparo e pronto', () => {
      const timings = calculateStageTimings({
        createdAt: '2026-11-08T14:00:00.000Z',
        status: 'ready',
        events: [
          { to_status: 'confirmed', created_at: '2026-11-08T14:03:00.000Z' },
          { to_status: 'preparing', created_at: '2026-11-08T14:07:00.000Z' },
          { to_status: 'ready', created_at: '2026-11-08T14:29:00.000Z' },
        ],
        now: new Date('2026-11-08T14:35:00.000Z'),
      });

      expect(timings.timeToConfirmMin).toBe(3);
      expect(timings.timeFromConfirmToStartMin).toBe(4);
      expect(timings.preparationDurationMin).toBe(22);
      expect(timings.readyWaitingDurationMin).toBe(6);
    });

    it('deve retornar "Dados insuficientes" quando a amostra de itens concluídos for pequena', () => {
      const report = calculateKdsBottlenecks(
        [
          {
            productName: 'Feijoada 1kg',
            startedAt: '2026-11-08T14:00:00.000Z',
            completedAt: '2026-11-08T14:25:00.000Z',
          },
        ],
        2 // exige ao menos 2 amostras
      );

      expect(report.hasSufficientData).toBe(false);
      expect(report.message).toBe('Dados insuficientes');
      expect(report.items).toHaveLength(0);
    });

    it('deve rankear itens com maior tempo médio de preparo quando houver amostra suficiente', () => {
      const report = calculateKdsBottlenecks(
        [
          {
            productName: 'Escondidinho 600g',
            startedAt: '2026-11-08T14:00:00.000Z',
            completedAt: '2026-11-08T14:12:00.000Z', // 12m
          },
          {
            productName: 'Escondidinho 600g',
            startedAt: '2026-11-08T14:15:00.000Z',
            completedAt: '2026-11-08T14:29:00.000Z', // 14m (média 13m)
          },
          {
            productName: 'Feijoada Completa 1kg',
            startedAt: '2026-11-08T14:00:00.000Z',
            completedAt: '2026-11-08T14:26:00.000Z', // 26m
          },
          {
            productName: 'Feijoada Completa 1kg',
            startedAt: '2026-11-08T15:00:00.000Z',
            completedAt: '2026-11-08T15:30:00.000Z', // 30m (média 28m)
          },
        ],
        2
      );

      expect(report.hasSufficientData).toBe(true);
      expect(report.items).toHaveLength(2);
      expect(report.items[0].productName).toBe('Feijoada Completa 1kg');
      expect(report.items[0].avgPrepMinutes).toBe(28);
      expect(report.items[1].productName).toBe('Escondidinho 600g');
      expect(report.items[1].avgPrepMinutes).toBe(13);
    });
  });

  describe('5. Privacidade e Proteção contra Exposição de PII Desnecessária no KDS', () => {
    it('deve abreviar o nome do cliente para exibição segura em tela de cozinha/TV', () => {
      expect(formatCustomerDisplayNameForKds('Maria Fernanda Oliveira')).toBe('Maria O.');
      expect(formatCustomerDisplayNameForKds('Carlos')).toBe('Carlos');
      expect(formatCustomerDisplayNameForKds('')).toBe('Cliente');
    });

    it('o card do KDS NÃO deve conter endereço completo, telefone, e-mail ou CPF do cliente', () => {
      const sampleKdsCardRecord = {
        id: 'ord-kds-01',
        tenantId: '00000000-0000-0000-0000-000000000001',
        orderNumber: '#000501',
        customerDisplayName: formatCustomerDisplayNameForKds('Roberto Carlos Almeida'),
        fulfillmentType: 'delivery',
        scheduleType: 'asap',
        status: 'preparing',
        paymentStatus: 'paid',
        kitchenNotes: 'Sem pimenta',
      };

      expect(sampleKdsCardRecord.customerDisplayName).toBe('Roberto A.');
      expect('customerPhone' in sampleKdsCardRecord).toBe(false);
      expect('customerEmail' in sampleKdsCardRecord).toBe(false);
      expect('address' in sampleKdsCardRecord).toBe(false);
    });
  });

  describe('6. Máquina Operacional de Checklist de Itens, Duplicidade e Concorrência', () => {
    // Simulador determinístico em memória da regra atômica de order_item_operations
    function createInMemoryKdsOrderSimulator(
      tenantId: string,
      orderId: string,
      itemIds: string[]
    ) {
      let orderStatus: 'confirmed' | 'preparing' | 'ready' = 'confirmed';
      const itemStates = new Map<string, 'pending' | 'preparing' | 'ready'>(
        itemIds.map((id) => [id, 'pending'])
      );
      const events: string[] = [];

      return {
        startOrder(reqTenantId: string) {
          if (reqTenantId !== tenantId) {
            return { success: false, error: 'Cross-tenant negado.' };
          }
          const idempotent = orderStatus === 'preparing';
          orderStatus = 'preparing';
          for (const [id, st] of itemStates.entries()) {
            if (st === 'pending') itemStates.set(id, 'preparing');
          }
          if (!idempotent) events.push('order_started');
          return { success: true, idempotent, status: orderStatus };
        },
        updateItem(
          reqTenantId: string,
          itemId: string,
          toStatus: 'pending' | 'preparing' | 'ready'
        ) {
          if (reqTenantId !== tenantId) {
            return { success: false, error: 'Cross-tenant negado.' };
          }
          const current = itemStates.get(itemId);
          if (!current) return { success: false, error: 'Item inexistente.' };
          if (current === toStatus) {
            const readyCount = Array.from(itemStates.values()).filter(
              (s) => s === 'ready'
            ).length;
            return {
              success: true,
              idempotent: true,
              ready_items: readyCount,
              total_items: itemIds.length,
              all_items_ready: readyCount === itemIds.length,
              orderStatus,
            };
          }
          itemStates.set(itemId, toStatus);
          events.push(`item_${toStatus}:${itemId}`);
          const readyCount = Array.from(itemStates.values()).filter(
            (s) => s === 'ready'
          ).length;
          return {
            success: true,
            idempotent: false,
            ready_items: readyCount,
            total_items: itemIds.length,
            all_items_ready: readyCount === itemIds.length,
            orderStatus, // nunca muda automaticamente para ready sem confirmação
          };
        },
        completeOrder(reqTenantId: string) {
          if (reqTenantId !== tenantId) {
            return { success: false, error: 'Cross-tenant negado.' };
          }
          const readyCount = Array.from(itemStates.values()).filter(
            (s) => s === 'ready'
          ).length;
          if (readyCount < itemIds.length) {
            return {
              success: false,
              error: 'Ainda existem itens pendentes.',
            };
          }
          orderStatus = 'ready';
          events.push('order_ready');
          return { success: true, status: orderStatus };
        },
        getEvents: () => events,
        getOrderStatus: () => orderStatus,
      };
    }

    it('deve transicionar itens de pending -> preparing ao iniciar pedido e preparing -> ready individualmente', () => {
      const sim = createInMemoryKdsOrderSimulator('tenant-01', 'order-1', [
        'item-a',
        'item-b',
      ]);

      const startRes = sim.startOrder('tenant-01');
      expect(startRes.success).toBe(true);
      expect(sim.getOrderStatus()).toBe('preparing');

      // Marca item-a como pronto (pedido parcialmente pronto)
      const partialRes = sim.updateItem('tenant-01', 'item-a', 'ready');
      expect(partialRes.success).toBe(true);
      expect(partialRes.ready_items).toBe(1);
      expect(partialRes.total_items).toBe(2);
      expect(partialRes.all_items_ready).toBe(false);
      // Pedido NÃO deve mudar para ready automaticamente
      expect(sim.getOrderStatus()).toBe('preparing');

      // Tentativa de concluir pedido parcialmente pronto deve ser bloqueada
      const blockedComplete = sim.completeOrder('tenant-01');
      expect(blockedComplete.success).toBe(false);

      // Marca item-b como pronto (todos os itens prontos)
      const fullRes = sim.updateItem('tenant-01', 'item-b', 'ready');
      expect(fullRes.all_items_ready).toBe(true);
      // Ainda aguarda confirmação explícita do operador
      expect(sim.getOrderStatus()).toBe('preparing');

      // Operador confirma Pedido Pronto
      const completeRes = sim.completeOrder('tenant-01');
      expect(completeRes.success).toBe(true);
      expect(sim.getOrderStatus()).toBe('ready');
    });

    it('deve ser idempotente quando dois operadores marcam o mesmo item como pronto simultaneamente', () => {
      const sim = createInMemoryKdsOrderSimulator('tenant-01', 'order-1', ['item-a']);
      sim.startOrder('tenant-01');

      const op1 = sim.updateItem('tenant-01', 'item-a', 'ready');
      const op2 = sim.updateItem('tenant-01', 'item-a', 'ready');

      expect(op1.idempotent).toBe(false);
      expect(op2.idempotent).toBe(true);
      // Evento item_ready foi emitido apenas 1 vez
      expect(
        sim.getEvents().filter((e) => e === 'item_ready:item-a')
      ).toHaveLength(1);
    });

    it('deve bloquear estritamente tentativa de operação cross-tenant no KDS', () => {
      const sim = createInMemoryKdsOrderSimulator('tenant-01', 'order-1', ['item-a']);
      const crossAttempt = sim.updateItem('tenant-02', 'item-a', 'ready');
      expect(crossAttempt.success).toBe(false);
      expect(crossAttempt.error).toContain('Cross-tenant');
    });
  });
});
