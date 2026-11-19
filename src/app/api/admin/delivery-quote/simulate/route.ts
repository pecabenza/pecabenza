import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminAuthSession } from '@/lib/tenancy/admin-auth';
import { DeliveryQuoteService } from '@/modules/delivery/delivery-quote.service';
import { MapProviderNotConfiguredError } from '@/modules/delivery/providers/google-routes.adapter';

export const dynamic = 'force-dynamic';

const SimulateSchema = z.object({
  origin: z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  }),
  confirmedPin: z
    .object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
    })
    .nullable()
    .optional(),
  destination: z.object({
    zipCode: z.string().trim().min(8, 'Informe um CEP válido'),
    street: z.string().trim().min(2, 'Informe a rua/avenida'),
    number: z.string().trim().min(1, 'Informe o número'),
    neighborhood: z.string().trim().min(2, 'Informe o bairro'),
    city: z.string().trim().min(2, 'Informe a cidade'),
    state: z.string().trim().length(2, 'Informe a UF (2 letras)'),
  }),
  simulatedSubtotalCents: z.number().int().min(0),
  surchargeCents: z.number().int().min(0).optional(),
  config: z.object({
    pricingMode: z.enum(['fixed', 'distance', 'external_quote']).default('distance'),
    pricingRuleVersion: z.number().int().min(1).default(1),
    originVerified: z.boolean().default(true),
    fixedDeliveryFeeCents: z.number().int().min(0),
    baseDeliveryFeeCents: z.number().int().min(0),
    perKmFeeCents: z.number().int().min(0),
    minDeliveryFeeCents: z.number().int().min(0),
    maxDeliveryFeeCents: z.number().int().min(0),
    maxDeliveryDistanceKm: z.number().positive(),
    distanceRoundingMode: z.enum(['exact', 'tenth_km', 'ceil_km']).default('tenth_km'),
    freeDeliveryThresholdCents: z.number().int().positive().nullable(),
    freeDeliveryMaxDistanceKm: z.number().positive().nullable(),
    maxDeliverySubsidyCents: z.number().int().min(0).nullable(),
    contingencyPolicy: z
      .enum(['block_on_failure', 'fixed_fallback', 'neighborhood_fallback'])
      .default('block_on_failure'),
    neighborhoodRates: z
      .array(
        z.object({
          neighborhood: z.string().trim().min(1),
          feeCents: z.number().int().min(0),
          estimatedMinutes: z.number().int().positive().optional(),
          active: z.boolean().default(true),
        })
      )
      .optional(),
  }),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getAdminAuthSession(request);
    if (!session) {
      return NextResponse.json({ error: 'Acesso não autorizado.' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = SimulateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Parâmetros de simulação inválidos.' },
        { status: 400 }
      );
    }

    const result = await DeliveryQuoteService.simulateAdminQuote(parsed.data);
    return NextResponse.json(result, { status: 200 });
  } catch (err: unknown) {
    if (err instanceof MapProviderNotConfiguredError) {
      return NextResponse.json(
        { error: err.message, notConfigured: true },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { error: (err as { message?: string })?.message || 'Erro ao simular cotação.' },
      { status: 500 }
    );
  }
}

