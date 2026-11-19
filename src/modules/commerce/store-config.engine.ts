import type { TenantCommerceSettings } from '@/types/database.types';
import { parseCouponCampaigns, type CouponCampaign } from './coupon.engine';

export type StorePaymentOption = 'pix' | 'cash' | 'card_on_delivery';
export type WeekdayKey = 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat';

export interface DaySchedule {
  open: string;   // HH:MM
  close: string;  // HH:MM
  closed: boolean;
}

export const DEFAULT_DELIVERED_THANK_YOU_MESSAGE =
  'Seu pedido foi entregue! 🤎 Obrigado por escolher a BENZA. Esperamos que cada garfada seja especial. Bom apetite!';

export interface ScheduleWindowConfig {
  value: string; // Ex: '11:30 - 13:30'
  label: string;
  fulfillmentTypes?: ('delivery' | 'pickup')[];
}

export const DEFAULT_SCHEDULE_WINDOWS: ScheduleWindowConfig[] = [
  { value: '11:30 - 13:30', label: 'Manhã / Almoço (11:30 às 13:30)', fulfillmentTypes: ['delivery', 'pickup'] },
  { value: '15:00 - 18:00', label: 'Tarde (15:00 às 18:00)', fulfillmentTypes: ['delivery', 'pickup'] },
  { value: '18:30 - 21:00', label: 'Noite (18:30 às 21:00)', fulfillmentTypes: ['delivery', 'pickup'] },
];

export interface StructuredBusinessHours {
  is_store_open: boolean;
  pause_reason?: string | null;
  enforce_schedule: boolean;
  timezone: string;
  weekly_hours: Record<WeekdayKey, DaySchedule>;
  enabled_payment_methods: StorePaymentOption[];
  min_schedule_lead_minutes?: number;
  schedule_windows?: ScheduleWindowConfig[];
  dine_in_enabled?: boolean;
  producao?: string;
  entregas?: string;
  delivered_thank_you_message?: string;
  coupon_campaigns?: CouponCampaign[];
  whatsapp_templates?: {
    confirmed?: string;
    ready?: string;
    out_for_delivery?: string;
    delivered?: string;
  };
}

export const DEFAULT_WEEKLY_HOURS: Record<WeekdayKey, DaySchedule> = {
  sun: { open: '10:00', close: '20:00', closed: false },
  mon: { open: '10:00', close: '20:00', closed: false },
  tue: { open: '10:00', close: '20:00', closed: false },
  wed: { open: '10:00', close: '20:00', closed: false },
  thu: { open: '10:00', close: '22:00', closed: false },
  fri: { open: '10:00', close: '22:00', closed: false },
  sat: { open: '10:00', close: '22:00', closed: false },
};

export function parseStructuredBusinessHours(raw?: Record<string, any> | null): StructuredBusinessHours {
  const obj = raw && typeof raw === 'object' ? raw : {};

  const weekly: Record<WeekdayKey, DaySchedule> = { ...DEFAULT_WEEKLY_HOURS };
  if (obj.weekly_hours && typeof obj.weekly_hours === 'object') {
    for (const day of Object.keys(DEFAULT_WEEKLY_HOURS) as WeekdayKey[]) {
      const candidate = obj.weekly_hours[day];
      if (candidate && typeof candidate === 'object') {
        weekly[day] = {
          open: typeof candidate.open === 'string' ? candidate.open : DEFAULT_WEEKLY_HOURS[day].open,
          close: typeof candidate.close === 'string' ? candidate.close : DEFAULT_WEEKLY_HOURS[day].close,
          closed: Boolean(candidate.closed),
        };
      }
    }
  }

  const validMethods: StorePaymentOption[] = ['pix', 'cash', 'card_on_delivery'];
  const parsedMethods = Array.isArray(obj.enabled_payment_methods)
    ? obj.enabled_payment_methods.filter((m: any): m is StorePaymentOption => validMethods.includes(m))
    : [];

  return {
    is_store_open: obj.is_store_open !== undefined ? Boolean(obj.is_store_open) : true,
    pause_reason: typeof obj.pause_reason === 'string' ? obj.pause_reason : null,
    enforce_schedule: Boolean(obj.enforce_schedule),
    timezone: typeof obj.timezone === 'string' && obj.timezone ? obj.timezone : 'America/Sao_Paulo',
    weekly_hours: weekly,
    enabled_payment_methods: parsedMethods.length > 0 ? parsedMethods : ['pix'],
    min_schedule_lead_minutes:
      typeof obj.min_schedule_lead_minutes === 'number' && obj.min_schedule_lead_minutes >= 0
        ? Math.floor(obj.min_schedule_lead_minutes)
        : 0,
    schedule_windows: Array.isArray(obj.schedule_windows)
      ? obj.schedule_windows.filter(
          (w: any): w is ScheduleWindowConfig =>
            Boolean(w) &&
            typeof w.value === 'string' &&
            /^\d{2}:\d{2}\s*-\s*\d{2}:\d{2}$/.test(w.value.trim()) &&
            typeof w.label === 'string' &&
            w.label.trim().length > 0
        )
      : undefined,
    dine_in_enabled: Boolean(obj.dine_in_enabled),
    producao: typeof obj.producao === 'string' ? obj.producao : undefined,
    entregas: typeof obj.entregas === 'string' ? obj.entregas : undefined,
    delivered_thank_you_message:
      typeof obj.delivered_thank_you_message === 'string' && obj.delivered_thank_you_message.trim()
        ? obj.delivered_thank_you_message.trim()
        : undefined,
    coupon_campaigns: parseCouponCampaigns(obj.coupon_campaigns),
    whatsapp_templates:
      obj.whatsapp_templates && typeof obj.whatsapp_templates === 'object'
        ? {
            confirmed:
              typeof obj.whatsapp_templates.confirmed === 'string'
                ? obj.whatsapp_templates.confirmed
                : undefined,
            ready:
              typeof obj.whatsapp_templates.ready === 'string'
                ? obj.whatsapp_templates.ready
                : undefined,
            out_for_delivery:
              typeof obj.whatsapp_templates.out_for_delivery === 'string'
                ? obj.whatsapp_templates.out_for_delivery
                : undefined,
            delivered:
              typeof obj.whatsapp_templates.delivered === 'string'
                ? obj.whatsapp_templates.delivered
                : undefined,
          }
        : undefined,
  };
}

/**
 * Calcula frete autoritativo no frontend/backend usando a mesma regra do servidor.
 */
export function calculateDynamicDeliveryFee(
  subtotalCents: number,
  fulfillmentType: 'delivery' | 'pickup',
  settings: Pick<TenantCommerceSettings, 'fixed_delivery_fee_cents' | 'free_delivery_threshold_cents'>
): number {
  if (fulfillmentType === 'pickup') return 0;

  if (
    settings.free_delivery_threshold_cents &&
    settings.free_delivery_threshold_cents > 0 &&
    subtotalCents >= settings.free_delivery_threshold_cents
  ) {
    return 0;
  }

  return Math.max(0, settings.fixed_delivery_fee_cents || 0);
}

/**
 * Avalia se a loja está aberta para receber pedidos no momento atual.
 */
export function evaluateStoreAvailability(
  businessHours: StructuredBusinessHours,
  commerceSettings: Pick<TenantCommerceSettings, 'scheduled_enabled'>,
  scheduleType: 'asap' | 'scheduled' = 'asap',
  now: Date = new Date()
): { open: boolean; allowsScheduled: boolean; reason?: string } {
  const allowsScheduled = Boolean(commerceSettings.scheduled_enabled);

  if (!businessHours.is_store_open) {
    return {
      open: false,
      allowsScheduled: false,
      reason:
        businessHours.pause_reason?.trim() ||
        'A loja está temporariamente pausada e não está aceitando pedidos no momento.',
    };
  }

  if (!businessHours.enforce_schedule) {
    return { open: true, allowsScheduled };
  }

  // Se o cliente está escolhendo pedido agendado e o agendamento está habilitado, permite mesmo fora do horário imediato
  if (scheduleType === 'scheduled' && allowsScheduled) {
    return { open: true, allowsScheduled };
  }

  const tz = businessHours.timezone || 'America/Sao_Paulo';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);

  const weekdayRaw = parts.find((p) => p.type === 'weekday')?.value?.toLowerCase() || 'mon';
  const dayMap: Record<string, WeekdayKey> = {
    sun: 'sun',
    mon: 'mon',
    tue: 'tue',
    wed: 'wed',
    thu: 'thu',
    fri: 'fri',
    sat: 'sat',
  };
  const dayKey = dayMap[weekdayRaw.slice(0, 3)] || 'mon';
  const hourStr = parts.find((p) => p.type === 'hour')?.value || '12';
  const minStr = parts.find((p) => p.type === 'minute')?.value || '00';
  const currentHm = `${hourStr === '24' ? '00' : hourStr}:${minStr}`;

  const todaySchedule = businessHours.weekly_hours[dayKey];
  if (!todaySchedule || todaySchedule.closed) {
    return {
      open: false,
      allowsScheduled,
      reason: allowsScheduled
        ? 'Loja fechada hoje para entrega imediata. Você pode fazer um pedido agendado.'
        : 'Loja fechada hoje para novos pedidos.',
    };
  }

  if (currentHm < todaySchedule.open || currentHm > todaySchedule.close) {
    return {
      open: false,
      allowsScheduled,
      reason: allowsScheduled
        ? `Fora do horário imediato (${todaySchedule.open} às ${todaySchedule.close}). Escolha a opção Agendar Pedido.`
        : `Estamos fechados no momento. Horário de atendimento hoje: ${todaySchedule.open} às ${todaySchedule.close}.`,
    };
  }

  return { open: true, allowsScheduled };
}

const WEEKDAY_MAP: Record<string, WeekdayKey> = {
  sun: 'sun',
  mon: 'mon',
  tue: 'tue',
  wed: 'wed',
  thu: 'thu',
  fri: 'fri',
  sat: 'sat',
};

export function getZonedDateParts(
  date: Date,
  timeZone: string
): { weekday: WeekdayKey; dateStr: string; hm: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const weekdayRaw = (parts.find((p) => p.type === 'weekday')?.value || 'mon').toLowerCase().slice(0, 3);
  const year = parts.find((p) => p.type === 'year')?.value || '1970';
  const month = parts.find((p) => p.type === 'month')?.value || '01';
  const day = parts.find((p) => p.type === 'day')?.value || '01';
  const hourRaw = parts.find((p) => p.type === 'hour')?.value || '00';
  const minute = parts.find((p) => p.type === 'minute')?.value || '00';
  const hour = hourRaw === '24' ? '00' : hourRaw;

  return {
    weekday: WEEKDAY_MAP[weekdayRaw] || 'mon',
    dateStr: `${year}-${month}-${day}`,
    hm: `${hour}:${minute}`,
  };
}

/**
 * Converte data (YYYY-MM-DD) + horário (HH:MM) no fuso do estabelecimento para ISO UTC.
 */
export function zonedDateTimeToIso(dateStr: string, hm: string, timeZone: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = hm.split(':').map(Number);
  const desiredUtcMs = Date.UTC(y, m - 1, d, hh, mm, 0);
  let candidate = new Date(desiredUtcMs);

  for (let i = 0; i < 2; i++) {
    const parts = getZonedDateParts(candidate, timeZone);
    const [zy, zm, zd] = parts.dateStr.split('-').map(Number);
    const [zhh, zmm] = parts.hm.split(':').map(Number);
    const actualAsUtcMs = Date.UTC(zy, zm - 1, zd, zhh, zmm, 0);
    const diffMs = desiredUtcMs - actualAsUtcMs;
    if (diffMs === 0) break;
    candidate = new Date(candidate.getTime() + diffMs);
  }

  return candidate.toISOString();
}

export function getConfiguredScheduleWindows(
  businessHours: Pick<StructuredBusinessHours, 'schedule_windows'>
): ScheduleWindowConfig[] {
  if (businessHours.schedule_windows && businessHours.schedule_windows.length > 0) {
    return businessHours.schedule_windows;
  }
  return DEFAULT_SCHEDULE_WINDOWS;
}

export function getAvailableScheduleWindowsForDate(
  businessHours: StructuredBusinessHours,
  dateStr: string,
  fulfillmentType: 'delivery' | 'pickup'
): ScheduleWindowConfig[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return [];
  const [y, m, d] = dateStr.split('-').map(Number);
  const utcMidday = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const tz = businessHours.timezone || 'America/Sao_Paulo';
  const { weekday } = getZonedDateParts(utcMidday, tz);
  const daySchedule = businessHours.weekly_hours[weekday];
  if (!daySchedule || daySchedule.closed) return [];

  return getConfiguredScheduleWindows(businessHours).filter((win) => {
    const allowedTypes = win.fulfillmentTypes && win.fulfillmentTypes.length > 0
      ? win.fulfillmentTypes
      : ['delivery', 'pickup'];
    if (!allowedTypes.includes(fulfillmentType)) return false;

    const match = win.value.trim().match(/^(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})$/);
    if (!match) return false;
    const [, startHm, endHm] = match;
    return startHm >= daySchedule.open && endHm <= daySchedule.close && startHm < endHm;
  });
}

/**
 * Validação autoritativa compartilhada (frontend/backend) de data, janela e disponibilidade de agendamento.
 */
export function validateScheduledOrderSlot(
  businessHours: StructuredBusinessHours,
  commerceSettings: Pick<TenantCommerceSettings, 'scheduled_enabled' | 'delivery_enabled' | 'pickup_enabled'>,
  params: {
    scheduledFor?: string | null;
    scheduledWindow?: string | null;
    fulfillmentType: 'delivery' | 'pickup';
    now?: Date;
  }
): { valid: boolean; reason?: string } {
  if (!commerceSettings.scheduled_enabled) {
    return { valid: false, reason: 'Pedidos agendados estão desabilitados no momento.' };
  }

  if (!businessHours.is_store_open) {
    return {
      valid: false,
      reason:
        businessHours.pause_reason?.trim() ||
        'A loja está temporariamente pausada e não está aceitando agendamentos.',
    };
  }

  if (params.fulfillmentType === 'delivery' && !commerceSettings.delivery_enabled) {
    return { valid: false, reason: 'Entrega está desabilitada para agendamentos.' };
  }
  if (params.fulfillmentType === 'pickup' && !commerceSettings.pickup_enabled) {
    return { valid: false, reason: 'Retirada está desabilitada para agendamentos.' };
  }

  if (!params.scheduledFor) {
    return { valid: false, reason: 'Horário de agendamento não informado.' };
  }

  const scheduledDate = new Date(params.scheduledFor);
  const now = params.now || new Date();
  if (isNaN(scheduledDate.getTime()) || scheduledDate.getTime() < now.getTime() - 60_000) {
    return { valid: false, reason: 'O horário de agendamento não pode estar no passado.' };
  }

  const leadMinutes = businessHours.min_schedule_lead_minutes || 0;
  if (leadMinutes > 0 && scheduledDate.getTime() < now.getTime() + leadMinutes * 60_000 - 60_000) {
    return {
      valid: false,
      reason: `Agendamentos exigem antecedência mínima de ${leadMinutes} minutos.`,
    };
  }

  const tz = businessHours.timezone || 'America/Sao_Paulo';
  const zonedTarget = getZonedDateParts(scheduledDate, tz);
  const daySchedule = businessHours.weekly_hours[zonedTarget.weekday];

  if (!daySchedule || daySchedule.closed) {
    return {
      valid: false,
      reason: 'O estabelecimento não funciona no dia selecionado para agendamentos.',
    };
  }

  if (zonedTarget.hm < daySchedule.open || zonedTarget.hm > daySchedule.close) {
    return {
      valid: false,
      reason: `O horário selecionado (${zonedTarget.hm}) está fora do funcionamento (${daySchedule.open} às ${daySchedule.close}).`,
    };
  }

  if (params.scheduledWindow !== undefined && params.scheduledWindow !== null) {
    const normalizedWindow = params.scheduledWindow.trim();
    const match = normalizedWindow.match(/^(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})$/);
    if (!match) {
      return { valid: false, reason: 'Formato de janela de agendamento inválido.' };
    }
    const [, winStart, winEnd] = match;
    if (winStart >= winEnd) {
      return { valid: false, reason: 'Janela de agendamento inválida.' };
    }

    const configuredWindows = getConfiguredScheduleWindows(businessHours);
    const matchedConfig = configuredWindows.find(
      (w) => w.value.replace(/\s+/g, '') === normalizedWindow.replace(/\s+/g, '')
    );
    if (!matchedConfig) {
      return { valid: false, reason: 'A janela de agendamento selecionada não é permitida.' };
    }

    const allowedTypes =
      matchedConfig.fulfillmentTypes && matchedConfig.fulfillmentTypes.length > 0
        ? matchedConfig.fulfillmentTypes
        : ['delivery', 'pickup'];
    if (!allowedTypes.includes(params.fulfillmentType)) {
      return {
        valid: false,
        reason: `A janela ${normalizedWindow} não está disponível para ${params.fulfillmentType === 'delivery' ? 'entrega' : 'retirada'}.`,
      };
    }

    if (winStart < daySchedule.open || winEnd > daySchedule.close) {
      return {
        valid: false,
        reason: `A janela ${normalizedWindow} ultrapassa o horário de funcionamento (${daySchedule.open} às ${daySchedule.close}).`,
      };
    }

    if (zonedTarget.hm !== winStart) {
      return {
        valid: false,
        reason: 'O horário enviado não corresponde ao início da janela de agendamento selecionada.',
      };
    }
  }

  return { valid: true };
}

export interface CommercialReadinessInput {
  rlsAnonOrdersBlocked: boolean;
  activeProductsWithAvailableVariants: number;
  commerceSettings: Pick<
    TenantCommerceSettings,
    'delivery_enabled' | 'pickup_enabled' | 'fixed_delivery_fee_cents' | 'min_order_value_cents'
  > | null;
  enabledPaymentMethods: StorePaymentOption[];
  pixGatewayConfigured: boolean; // true se provedor != mock com apiKey ativa
  trackedVariantsCount: number;
  trackedVariantsWithAvailableStock: number;
}

export interface ReadinessCheckItem {
  id: string;
  label: string;
  passed: boolean;
  blocking: boolean;
  message: string;
}

export interface CommercialReadinessResult {
  canActivate: boolean;
  checks: ReadinessCheckItem[];
  blockers: string[];
}

/**
 * Verificação obrigatória antes de permitir `site_mode = 'commerce'`.
 * Não exige gateway Asaas caso o estabelecimento tenha habilitado Dinheiro ou Cartão na entrega.
 */
export function evaluateCommercialReadiness(
  input: CommercialReadinessInput
): CommercialReadinessResult {
  const checks: ReadinessCheckItem[] = [];

  // 1. Segurança RLS
  checks.push({
    id: 'rls_secured',
    label: 'Segurança RLS & Privacidade de Pedidos',
    passed: input.rlsAnonOrdersBlocked,
    blocking: true,
    message: input.rlsAnonOrdersBlocked
      ? 'Acesso anônimo direto às tabelas de pedidos bloqueado.'
      : 'Políticas públicas legadas ainda expõem leitura direta em pedidos/endereços.',
  });

  // 2. Produtos e variantes ativos
  const hasProducts = input.activeProductsWithAvailableVariants > 0;
  checks.push({
    id: 'active_catalog',
    label: 'Cardápio com Produtos & Preços Disponíveis',
    passed: hasProducts,
    blocking: true,
    message: hasProducts
      ? `${input.activeProductsWithAvailableVariants} produto(s) ativo(s) pronto(s) para venda.`
      : 'Cadastre pelo menos 1 produto ativo com porção/variação disponível.',
  });

  // 3. Configurações comerciais (entrega ou retirada)
  const cs = input.commerceSettings;
  const hasFulfillment =
    Boolean(cs) &&
    (Boolean(cs?.delivery_enabled) || Boolean(cs?.pickup_enabled)) &&
    (cs?.fixed_delivery_fee_cents ?? -1) >= 0 &&
    (cs?.min_order_value_cents ?? -1) >= 0;

  checks.push({
    id: 'commerce_settings',
    label: 'Entrega / Retirada & Taxas Configuradas',
    passed: hasFulfillment,
    blocking: true,
    message: hasFulfillment
      ? 'Configurações comerciais de entrega/retirada gravadas e válidas.'
      : 'Salve as configurações comerciais da loja habilitando Entrega e/ou Retirada.',
  });

  // 4. Formas de pagamento efetivamente operacionais
  const methods = input.enabledPaymentMethods || [];
  const hasOfflineMethod = methods.includes('cash') || methods.includes('card_on_delivery');
  const hasPixSelected = methods.includes('pix');

  let paymentPassed = false;
  let paymentMsg = '';

  if (methods.length === 0) {
    paymentPassed = false;
    paymentMsg = 'Selecione pelo menos 1 forma de pagamento (Pix, Dinheiro ou Cartão na entrega).';
  } else if (hasPixSelected && !input.pixGatewayConfigured) {
    paymentPassed = false;
    paymentMsg =
      'Pix online está habilitado, mas o provedor real (Asaas) não possui chave configurada. Configure o Asaas ou desmarque Pix online e utilize Dinheiro/Cartão na entrega.';
  } else if (hasOfflineMethod || (hasPixSelected && input.pixGatewayConfigured)) {
    paymentPassed = true;
    paymentMsg = 'Formas de pagamento habilitadas e operacionais.';
  }

  checks.push({
    id: 'payment_methods',
    label: 'Formas de Pagamento Operacionais',
    passed: paymentPassed,
    blocking: true,
    message: paymentMsg,
  });

  // 5. Estoque disponível quando o controle estrito está ativado
  const stockPassed =
    input.trackedVariantsCount === 0 || input.trackedVariantsWithAvailableStock > 0;
  checks.push({
    id: 'inventory_readiness',
    label: 'Saldo em Estoque (Itens Controlados)',
    passed: stockPassed,
    blocking: true,
    message:
      input.trackedVariantsCount === 0
        ? 'Nenhum item exige saldo prévio em lote (ou controle desligado).'
        : stockPassed
        ? `${input.trackedVariantsWithAvailableStock} de ${input.trackedVariantsCount} variante(s) controlada(s) com saldo ativo.`
        : 'Todas as variantes com controle de estoque ativo estão zeradas. Lance lotes no estoque ou ajuste o controle.',
  });

  const blockers = checks.filter((c) => c.blocking && !c.passed).map((c) => c.message);

  return {
    canActivate: blockers.length === 0,
    checks,
    blockers,
  };
}

