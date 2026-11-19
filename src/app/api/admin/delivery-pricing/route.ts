import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminAuthSession } from '@/lib/tenancy/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { validateDistanceBands } from '@/modules/delivery/delivery-pricing.engine';
import { sanitizePlainText } from '@/lib/security/sanitize';
import { logger } from '@/lib/observability/logger';

export const dynamic = 'force-dynamic';

const DistanceBandSchema = z.object({
  id: z.string().trim().min(1).max(60),
  minMeters: z.number().int().min(0),
  maxMeters: z.number().int().positive(),
  feeCents: z.number().int().min(0),
  label: z.string().trim().max(80).optional(),
  active: z.boolean(),
});

const UpdateDeliveryPricingSchema = z.object({
  pricingMode: z.enum(['fixed', 'distance', 'distance_band', 'external_quote']),
  maxDeliveryDistanceKm: z.number().positive().max(100),
  distanceBands: z.array(DistanceBandSchema).max(30),
  expectedRuleVersion: z.number().int().min(1).optional(),
  confirmActivation: z.boolean().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const session = await getAdminAuthSession(request);
    if (!session) {
      return NextResponse.json({ error: 'Acesso não autorizado.' }, { status: 401 });
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('tenant_commerce_settings')
      .select(
        'pricing_mode, pricing_rule_version, max_delivery_distance_km, distance_bands, route_provider, geocode_provider, origin_verified, fixed_delivery_fee_cents, contingency_policy'
      )
      .eq('tenant_id', session.tenant.id)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: 'Erro ao consultar regras de entrega.' }, { status: 500 });
    }

    return NextResponse.json(
      {
        pricingMode: data?.pricing_mode || 'fixed',
        pricingRuleVersion: Number(data?.pricing_rule_version || 1),
        maxDeliveryDistanceKm: Number(data?.max_delivery_distance_km ?? 10),
        distanceBands: Array.isArray(data?.distance_bands) ? data.distance_bands : [],
        routeProvider: data?.route_provider || 'google',
        geocodeProvider: data?.geocode_provider || null,
        originVerified: Boolean(data?.origin_verified),
        fixedDeliveryFeeCents: Number(data?.fixed_delivery_fee_cents ?? 1200),
        contingencyPolicy: data?.contingency_policy || 'block_on_failure',
      },
      { status: 200 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Erro ao carregar configurações de frete.' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getAdminAuthSession(request);
    if (!session) {
      return NextResponse.json({ error: 'Acesso não autorizado.' }, { status: 401 });
    }

    const raw = await request.json();
    const parsed = UpdateDeliveryPricingSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Dados inválidos de precificação.' },
        { status: 400 }
      );
    }

    const { pricingMode, maxDeliveryDistanceKm, distanceBands, expectedRuleVersion, confirmActivation } =
      parsed.data;

    if (pricingMode === 'distance_band' && !confirmActivation) {
      return NextResponse.json(
        { error: 'Confirme explicitamente a ativação do modo por faixas de distância.' },
        { status: 400 }
      );
    }

    const sanitizedBands = distanceBands.map((b) => ({
      ...b,
      label: b.label ? sanitizePlainText(b.label) : undefined,
    }));

    const bandValidation = validateDistanceBands(
      sanitizedBands,
      maxDeliveryDistanceKm,
      pricingMode === 'distance_band'
    );
    if (!bandValidation.valid) {
      return NextResponse.json(
        {
          error: bandValidation.errors[0] || 'Faixas de distância inválidas.',
          details: bandValidation.errors,
        },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();
    const { data: current, error: curErr } = await supabase
      .from('tenant_commerce_settings')
      .select('pricing_mode, pricing_rule_version, max_delivery_distance_km, distance_bands')
      .eq('tenant_id', session.tenant.id)
      .single();

    if (curErr || !current) {
      return NextResponse.json({ error: 'Configurações comerciais não encontradas.' }, { status: 404 });
    }

    const currentVersion = Number(current.pricing_rule_version || 1);
    if (expectedRuleVersion !== undefined && expectedRuleVersion !== currentVersion) {
      return NextResponse.json(
        {
          error:
            'As regras comerciais foram atualizadas por outro usuário. Recarregue antes de salvar.',
        },
        { status: 409 }
      );
    }

    const nextVersion = currentVersion + 1;

    // Atualização atômica condicionada à versão atual (optimistic locking)
    const { data: updated, error: updErr } = await supabase
      .from('tenant_commerce_settings')
      .update({
        pricing_mode: pricingMode,
        max_delivery_distance_km: maxDeliveryDistanceKm,
        distance_bands: sanitizedBands,
        pricing_rule_version: nextVersion,
        updated_at: new Date().toISOString(),
      })
      .eq('tenant_id', session.tenant.id)
      .eq('pricing_rule_version', currentVersion)
      .select('pricing_mode, pricing_rule_version, max_delivery_distance_km, distance_bands')
      .maybeSingle();

    if (updErr) {
      return NextResponse.json(
        { error: `Erro ao salvar faixas de entrega: ${updErr.message}` },
        { status: 400 }
      );
    }

    if (!updated) {
      return NextResponse.json(
        { error: 'Conflito de atualização concorrente. Tente salvar novamente.' },
        { status: 409 }
      );
    }

    logger.info('Regras de entrega atualizadas pelo admin', {
      tenantId: session.tenant.id,
      userId: session.user.id,
      pricingMode: updated.pricing_mode,
      previousRuleVersion: currentVersion,
      newRuleVersion: updated.pricing_rule_version,
    });

    return NextResponse.json(
      {
        pricingMode: updated.pricing_mode,
        pricingRuleVersion: updated.pricing_rule_version,
        maxDeliveryDistanceKm: Number(updated.max_delivery_distance_km),
        distanceBands: updated.distance_bands,
        warnings: bandValidation.warnings,
      },
      { status: 200 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Erro ao atualizar regras de entrega.' },
      { status: 500 }
    );
  }
}

