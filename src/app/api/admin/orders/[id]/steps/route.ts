import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminAuthSession } from '@/lib/tenancy/admin-auth';
import { logger } from '@/lib/observability/logger';
import {
  startProductionStep,
  completeProductionStep,
  overrideProductionStep,
} from '@/modules/orders/orders.service';

export const dynamic = 'force-dynamic';

const StepActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('start_step'),
    stepId: z.string().uuid('ID da etapa inválido.'),
  }),
  z.object({
    action: z.literal('complete_step'),
    stepId: z.string().uuid('ID da etapa inválido.'),
  }),
  z.object({
    action: z.literal('override_step'),
    stepId: z.string().uuid('ID da etapa inválido.'),
    overrideAction: z.enum(['skip', 'force_complete']),
    reason: z
      .string()
      .trim()
      .min(3, 'Informe um motivo obrigatório com pelo menos 3 caracteres.'),
  }),
]);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAdminAuthSession(request);
    if (!session) {
      return NextResponse.json(
        { error: 'Acesso não autorizado ao KDS.' },
        { status: 401 }
      );
    }

    const { id: orderId } = await params;
    const body = await request.json();
    const parsed = StepActionSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Dados de ação de etapa inválidos.',
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const payload = parsed.data;
    const tenantId = session.tenant.id;
    const actorId = session.user.id;

    if (payload.action === 'start_step') {
      const result = await startProductionStep(tenantId, payload.stepId, actorId);
      logger.info('station_step_started', {
        tenantId,
        orderId,
        stepId: payload.stepId,
        actorId,
        eventType: 'station_step_started',
      });
      return NextResponse.json(result, { status: 200 });
    }

    if (payload.action === 'complete_step') {
      const result = await completeProductionStep(tenantId, payload.stepId, actorId);
      logger.info('station_step_completed', {
        tenantId,
        orderId,
        stepId: payload.stepId,
        actorId,
        eventType: 'station_step_completed',
      });
      return NextResponse.json(result, { status: 200 });
    }

    if (payload.action === 'override_step') {
      // Regra de Segurança Seção 11 e 43: Override exclusivo para tenant_admin
      if (session.role !== 'tenant_admin') {
        logger.warn('Tentativa de override de etapa sem permissão tenant_admin', {
          tenantId,
          orderId,
          stepId: payload.stepId,
          actorId,
          role: session.role,
          eventType: 'security_violation',
        });
        return NextResponse.json(
          {
            error:
              'Apenas administradores do restaurante (tenant_admin) podem realizar override de etapas de produção.',
          },
          { status: 403 }
        );
      }

      const result = await overrideProductionStep(
        tenantId,
        payload.stepId,
        payload.overrideAction,
        payload.reason,
        actorId
      );
      logger.warn('station_step_skipped', {
        tenantId,
        orderId,
        stepId: payload.stepId,
        overrideAction: payload.overrideAction,
        actorId,
        eventType: 'station_step_skipped',
      });
      return NextResponse.json(result, { status: 200 });
    }

    return NextResponse.json({ error: 'Ação não suportada.' }, { status: 400 });
  } catch (error: any) {
    logger.warn('Falha ao processar ação de etapa no KDS', {
      error: error.message,
    });
    return NextResponse.json(
      { error: error.message || 'Falha ao executar ação na etapa.' },
      { status: 400 }
    );
  }
}

