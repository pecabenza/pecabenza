import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminAuthSession } from '@/lib/tenancy/admin-auth';
import {
  listProductionStations,
  saveProductionStation,
  listProductsWithProductionSteps,
  saveProductProductionSteps,
} from '@/modules/orders/orders.service';
import { logger } from '@/lib/observability/logger';

export const dynamic = 'force-dynamic';

const StationSchema = z.object({
  type: z.literal('save_station'),
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2, 'Nome da estação obrigatório.'),
  slug: z
    .string()
    .trim()
    .min(2)
    .regex(/^[a-z0-9-]+$/, 'Slug deve conter apenas letras minúsculas, números e hífens.'),
  description: z.string().optional().nullable(),
  display_order: z.number().int().min(0).default(0),
  station_type: z.enum([
    'kitchen',
    'grill',
    'oven',
    'assembly',
    'drinks',
    'dessert',
    'expedition',
    'custom',
  ]),
  is_active: z.boolean().default(true),
  default_capacity: z.number().int().min(1, 'Capacidade deve ser >= 1.'),
  default_duration_seconds: z
    .number()
    .int()
    .min(10, 'Duração padrão deve ser de pelo menos 10 segundos.'),
});

const ProductFlowSchema = z.object({
  type: z.literal('save_product_flow'),
  productId: z.string().uuid('ID do produto inválido.'),
  variantId: z.string().uuid().optional().nullable(),
  steps: z.array(
    z.object({
      station_id: z.string().uuid('Estação inválida.'),
      estimated_duration_seconds: z
        .number()
        .int()
        .min(5, 'Tempo estimado deve ser >= 5 segundos.'),
      capacity_weight: z.number().int().min(1).default(1),
      is_active: z.boolean().default(true),
    })
  ),
});

const ConfigMutationSchema = z.discriminatedUnion('type', [
  StationSchema,
  ProductFlowSchema,
]);

export async function GET(request: NextRequest) {
  try {
    const session = await getAdminAuthSession(request);
    if (!session) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }

    const [stations, catalogFlow] = await Promise.all([
      listProductionStations(session.tenant.id, true),
      listProductsWithProductionSteps(session.tenant.id),
    ]);

    return NextResponse.json(
      {
        stations,
        products: catalogFlow.products,
        variants: catalogFlow.variants,
        productSteps: catalogFlow.steps,
        role: session.role,
      },
      { status: 200 }
    );
  } catch (error: any) {
    logger.error('Erro ao carregar configurações operacionais', {
      error: error.message,
    });
    return NextResponse.json(
      { error: error.message || 'Erro ao carregar configurações.' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAdminAuthSession(request);
    if (!session) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }

    if (session.role !== 'tenant_admin') {
      return NextResponse.json(
        { error: 'Apenas administradores podem alterar configurações de estações e fluxos.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const parsed = ConfigMutationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Dados de configuração inválidos.',
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const payload = parsed.data;
    if (payload.type === 'save_station') {
      const station = await saveProductionStation(session.tenant.id, payload);
      return NextResponse.json({ station }, { status: 200 });
    }

    if (payload.type === 'save_product_flow') {
      const steps = await saveProductProductionSteps(
        session.tenant.id,
        payload.productId,
        payload.variantId || null,
        payload.steps
      );
      return NextResponse.json({ steps }, { status: 200 });
    }

    return NextResponse.json({ error: 'Operação inválida.' }, { status: 400 });
  } catch (error: any) {
    logger.warn('Erro ao salvar configuração operacional', {
      error: error.message,
    });
    return NextResponse.json(
      { error: error.message || 'Erro ao salvar configuração.' },
      { status: 400 }
    );
  }
}

