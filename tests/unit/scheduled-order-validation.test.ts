import { describe, it, expect } from 'vitest';
import {
  parseStructuredBusinessHours,
  validateScheduledOrderSlot,
  zonedDateTimeToIso,
  getAvailableScheduleWindowsForDate,
} from '@/modules/commerce/store-config.engine';

describe('P0 — Validação Autoritativa de Agendamento (Fuso, Dia Aberto, Janela e Modalidade)', () => {
  const baseBusinessHours = parseStructuredBusinessHours({
    is_store_open: true,
    enforce_schedule: true,
    timezone: 'America/Sao_Paulo',
    min_schedule_lead_minutes: 60,
    weekly_hours: {
      sun: { open: '11:00', close: '21:00', closed: false },
      mon: { open: '11:00', close: '19:00', closed: true }, // Segunda fechada
      tue: { open: '11:00', close: '19:00', closed: false }, // Terça fecha às 19:00 (janela noite 18:30-21:00 não cabe)
      wed: { open: '11:00', close: '22:00', closed: false },
      thu: { open: '11:00', close: '22:00', closed: false },
      fri: { open: '11:00', close: '22:00', closed: false },
      sat: { open: '11:00', close: '22:00', closed: false },
    },
    schedule_windows: [
      { value: '11:30 - 13:30', label: 'Almoço', fulfillmentTypes: ['delivery', 'pickup'] },
      { value: '15:00 - 18:00', label: 'Tarde (Retirada)', fulfillmentTypes: ['pickup'] },
      { value: '18:30 - 21:00', label: 'Noite', fulfillmentTypes: ['delivery', 'pickup'] },
    ],
  });

  const commerceSettings = {
    scheduled_enabled: true,
    delivery_enabled: true,
    pickup_enabled: true,
  };

  // Referência fixa: Terça-feira 2026-11-17 09:00 America/Sao_Paulo (12:00 UTC)
  const nowRef = new Date('2026-11-17T12:00:00.000Z');

  it('deve aceitar agendamento futuro em dia aberto e janela integralmente compatível', () => {
    // Quarta-feira 2026-11-18 18:30 - 21:00 (Quarta abre 11:00 às 22:00)
    const scheduledFor = zonedDateTimeToIso('2026-11-18', '18:30', 'America/Sao_Paulo');
    const res = validateScheduledOrderSlot(baseBusinessHours, commerceSettings, {
      scheduledFor,
      scheduledWindow: '18:30 - 21:00',
      fulfillmentType: 'delivery',
      now: nowRef,
    });
    expect(res.valid).toBe(true);
  });

  it('deve rejeitar agendamento no passado', () => {
    const pastFor = zonedDateTimeToIso('2026-11-16', '11:30', 'America/Sao_Paulo');
    const res = validateScheduledOrderSlot(baseBusinessHours, commerceSettings, {
      scheduledFor: pastFor,
      scheduledWindow: '11:30 - 13:30',
      fulfillmentType: 'delivery',
      now: nowRef,
    });
    expect(res.valid).toBe(false);
    expect(res.reason).toContain('passado');
  });

  it('deve rejeitar agendamento em dia marcado como fechado (Segunda-feira)', () => {
    // Próxima segunda: 2026-11-23
    const closedDayFor = zonedDateTimeToIso('2026-11-23', '11:30', 'America/Sao_Paulo');
    const res = validateScheduledOrderSlot(baseBusinessHours, commerceSettings, {
      scheduledFor: closedDayFor,
      scheduledWindow: '11:30 - 13:30',
      fulfillmentType: 'delivery',
      now: nowRef,
    });
    expect(res.valid).toBe(false);
    expect(res.reason).toContain('não funciona');
  });

  it('deve rejeitar janela que ultrapassa o horário de fechamento do dia (Terça fecha 19:00, janela 18:30-21:00)', () => {
    const tueEveningFor = zonedDateTimeToIso('2026-11-17', '18:30', 'America/Sao_Paulo');
    const res = validateScheduledOrderSlot(baseBusinessHours, commerceSettings, {
      scheduledFor: tueEveningFor,
      scheduledWindow: '18:30 - 21:00',
      fulfillmentType: 'delivery',
      now: nowRef,
    });
    expect(res.valid).toBe(false);
    expect(res.reason).toContain('ultrapassa o horário de funcionamento');
  });

  it('deve rejeitar janela restrita a retirada quando modalidade for entrega', () => {
    const wedAfternoonFor = zonedDateTimeToIso('2026-11-18', '15:00', 'America/Sao_Paulo');
    const deliveryRes = validateScheduledOrderSlot(baseBusinessHours, commerceSettings, {
      scheduledFor: wedAfternoonFor,
      scheduledWindow: '15:00 - 18:00',
      fulfillmentType: 'delivery',
      now: nowRef,
    });
    expect(deliveryRes.valid).toBe(false);
    expect(deliveryRes.reason).toContain('não está disponível para entrega');

    const pickupRes = validateScheduledOrderSlot(baseBusinessHours, commerceSettings, {
      scheduledFor: wedAfternoonFor,
      scheduledWindow: '15:00 - 18:00',
      fulfillmentType: 'pickup',
      now: nowRef,
    });
    expect(pickupRes.valid).toBe(true);
  });

  it('deve rejeitar janela adulterada ou não configurada na loja', () => {
    const wedCustomFor = zonedDateTimeToIso('2026-11-18', '12:00', 'America/Sao_Paulo');
    const res = validateScheduledOrderSlot(baseBusinessHours, commerceSettings, {
      scheduledFor: wedCustomFor,
      scheduledWindow: '12:00 - 14:00',
      fulfillmentType: 'delivery',
      now: nowRef,
    });
    expect(res.valid).toBe(false);
    expect(res.reason).toContain('não é permitida');
  });

  it('deve rejeitar manipulação onde scheduledFor não corresponde ao início da scheduledWindow', () => {
    const mismatchedFor = zonedDateTimeToIso('2026-11-18', '11:30', 'America/Sao_Paulo');
    const res = validateScheduledOrderSlot(baseBusinessHours, commerceSettings, {
      scheduledFor: mismatchedFor,
      scheduledWindow: '18:30 - 21:00',
      fulfillmentType: 'delivery',
      now: nowRef,
    });
    expect(res.valid).toBe(false);
    expect(res.reason).toContain('não corresponde ao início');
  });

  it('deve respeitar antecedência mínima configurada (min_schedule_lead_minutes)', () => {
    // Terça 2026-11-17 11:00 America/Sao_Paulo; tentativa para 11:30 (apenas 30 min < 60 min)
    const nowLate = new Date('2026-11-17T14:00:00.000Z');
    const tooSoonFor = zonedDateTimeToIso('2026-11-17', '11:30', 'America/Sao_Paulo');
    const res = validateScheduledOrderSlot(baseBusinessHours, commerceSettings, {
      scheduledFor: tooSoonFor,
      scheduledWindow: '11:30 - 13:30',
      fulfillmentType: 'delivery',
      now: nowLate,
    });
    expect(res.valid).toBe(false);
    expect(res.reason).toContain('antecedência mínima');
  });

  it('deve respeitar o fuso horário próprio do tenant (ex: America/Manaus -04:00)', () => {
    const manausHours = parseStructuredBusinessHours({
      ...baseBusinessHours,
      timezone: 'America/Manaus',
    });
    const scheduledFor = zonedDateTimeToIso('2026-11-18', '11:30', 'America/Manaus');
    // 11:30 em Manaus (-04:00) equivale a 15:30 UTC
    expect(scheduledFor).toBe('2026-11-18T15:30:00.000Z');

    const res = validateScheduledOrderSlot(manausHours, commerceSettings, {
      scheduledFor,
      scheduledWindow: '11:30 - 13:30',
      fulfillmentType: 'delivery',
      now: nowRef,
    });
    expect(res.valid).toBe(true);
  });

  it('getAvailableScheduleWindowsForDate deve filtrar janelas por dia aberto, fechamento e modalidade', () => {
    expect(getAvailableScheduleWindowsForDate(baseBusinessHours, '2026-11-23', 'delivery')).toHaveLength(0);
    expect(
      getAvailableScheduleWindowsForDate(baseBusinessHours, '2026-11-17', 'delivery').map((w) => w.value)
    ).toEqual(['11:30 - 13:30']);
    expect(
      getAvailableScheduleWindowsForDate(baseBusinessHours, '2026-11-18', 'pickup').map((w) => w.value)
    ).toEqual(['11:30 - 13:30', '15:00 - 18:00', '18:30 - 21:00']);
  });
});

