import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminAuthSession } from '@/lib/tenancy/admin-auth';
import {
  getAdminStoreConfiguration,
  saveAdminStoreConfiguration,
} from '@/modules/commerce/store-config.service';
import { sanitizePlainText } from '@/lib/security/sanitize';

export const dynamic = 'force-dynamic';

const DayScheduleSchema = z.object({
  open: z.string().regex(/^\d{2}:\d{2}$/, 'Horário inicial inválido (HH:MM)'),
  close: z.string().regex(/^\d{2}:\d{2}$/, 'Horário final inválido (HH:MM)'),
  closed: z.boolean(),
});

const SaveStoreConfigSchema = z.object({
  siteMode: z.enum(['prelaunch', 'institutional', 'commerce']).optional(),
  deliveryEnabled: z.boolean(),
  pickupEnabled: z.boolean(),
  fixedDeliveryFeeCents: z.number().int().min(0),
  freeDeliveryThresholdCents: z.number().int().positive().nullable(),
  minOrderValueCents: z.number().int().min(0),
  asapEnabled: z.boolean(),
  scheduledEnabled: z.boolean(),
  estimatedDeliveryTimeMin: z.number().int().min(5).max(300),
  estimatedPickupTimeMin: z.number().int().min(5).max(300),
  businessHours: z.object({
    is_store_open: z.boolean(),
    pause_reason: z.string().max(255).nullable().optional(),
    enforce_schedule: z.boolean(),
    timezone: z.string().min(3).max(60).default('America/Sao_Paulo'),
    weekly_hours: z.object({
      sun: DayScheduleSchema,
      mon: DayScheduleSchema,
      tue: DayScheduleSchema,
      wed: DayScheduleSchema,
      thu: DayScheduleSchema,
      fri: DayScheduleSchema,
      sat: DayScheduleSchema,
    }),
    enabled_payment_methods: z
      .array(z.enum(['pix', 'cash', 'card_on_delivery']))
      .min(1, 'Selecione pelo menos uma forma de pagamento.'),
    producao: z.string().max(120).optional(),
    entregas: z.string().max(120).optional(),
    delivered_thank_you_message: z.string().max(600).optional(),
    whatsapp_templates: z
      .object({
        confirmed: z.string().max(1500).optional(),
        ready: z.string().max(1500).optional(),
        out_for_delivery: z.string().max(1500).optional(),
        delivered: z.string().max(1500).optional(),
      })
      .optional(),
  }),
  paymentGateway: z
    .object({
      provider: z.enum(['mock', 'asaas']),
      isActive: z.boolean(),
      pixEnabled: z.boolean(),
      pixExpirationMinutes: z.number().int().min(5).max(120),
      sandboxMode: z.boolean(),
      apiKey: z.string().max(300).optional(),
      webhookSecret: z.string().max(300).optional(),
    })
    .optional(),
});

export async function GET(request: NextRequest) {
  try {
    const session = await getAdminAuthSession(request);
    if (!session) {
      return NextResponse.json({ error: 'Acesso não autorizado.' }, { status: 401 });
    }

    const config = await getAdminStoreConfiguration(session.tenant.id);
    return NextResponse.json(config, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Erro ao carregar configurações da loja.' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAdminAuthSession(request);
    if (!session) {
      return NextResponse.json({ error: 'Acesso não autorizado.' }, { status: 401 });
    }

    const raw = await request.json();
    const parsed = SaveStoreConfigSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Dados inválidos de configuração.' },
        { status: 400 }
      );
    }

    const data = parsed.data;
    const updated = await saveAdminStoreConfiguration(
      session.tenant.id,
      {
        ...data,
        businessHours: {
          ...data.businessHours,
          pause_reason: data.businessHours.pause_reason
            ? sanitizePlainText(data.businessHours.pause_reason)
            : null,
          delivered_thank_you_message: data.businessHours.delivered_thank_you_message
            ? sanitizePlainText(data.businessHours.delivered_thank_you_message)
            : undefined,
        },
      },
      session.user.id
    );

    return NextResponse.json(updated, { status: 200 });
  } catch (err: any) {
    const isReadinessErr = err.message?.includes('Não foi possível ativar as vendas online');
    return NextResponse.json(
      { error: err.message || 'Erro ao salvar configurações da loja.' },
      { status: isReadinessErr ? 422 : 400 }
    );
  }
}

