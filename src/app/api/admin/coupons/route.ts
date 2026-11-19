import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminAuthSession } from '@/lib/tenancy/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { sanitizePlainText } from '@/lib/security/sanitize';
import {
  normalizeCouponCode,
  parseCouponCampaigns,
  type CouponCampaign,
} from '@/modules/commerce/coupon.engine';

export const dynamic = 'force-dynamic';

const CouponPayloadSchema = z.object({
  id: z.string().max(100).optional(),
  code: z
    .string()
    .trim()
    .min(3, 'O código do cupom deve ter pelo menos 3 caracteres.')
    .max(30, 'O código do cupom deve ter no máximo 30 caracteres.')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Use apenas letras, números, hífen ou underline no código.'),
  name: z.string().trim().min(2, 'Informe o nome da campanha.').max(120),
  description: z.string().trim().max(240).optional(),
  discountType: z.enum(['percentage', 'fixed']),
  discountValue: z.number().int().positive('Informe um valor de desconto maior que zero.'),
  minOrderCents: z.number().int().nonnegative().optional(),
  maxDiscountCents: z.number().int().positive().nullable().optional(),
  maxUses: z.number().int().positive().nullable().optional(),
  startsAt: z.string().nullable().optional(),
  expiresAt: z.string().nullable().optional(),
  isActive: z.boolean().default(true),
});

async function loadTenantCampaigns(tenantId: string) {
  const supabase = createAdminClient();
  const { data: settingsRow } = await supabase
    .from('tenant_settings')
    .select('business_hours')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  const existingHours =
    settingsRow?.business_hours && typeof settingsRow.business_hours === 'object'
      ? (settingsRow.business_hours as Record<string, unknown>)
      : {};

  const campaigns = parseCouponCampaigns(existingHours.coupon_campaigns);
  return { supabase, existingHours, campaigns };
}

async function saveTenantCampaigns(
  tenantId: string,
  existingHours: Record<string, unknown>,
  campaigns: CouponCampaign[]
) {
  const supabase = createAdminClient();
  const nextHours = {
    ...existingHours,
    coupon_campaigns: campaigns,
  };

  const { error } = await supabase
    .from('tenant_settings')
    .upsert(
      {
        tenant_id: tenantId,
        business_hours: nextHours,
      },
      { onConflict: 'tenant_id' }
    );

  if (error) {
    throw new Error(`Erro ao salvar campanhas de cupons: ${error.message}`);
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getAdminAuthSession(request);
    if (!session) {
      return NextResponse.json({ error: 'Acesso não autorizado.' }, { status: 401 });
    }

    const { campaigns } = await loadTenantCampaigns(session.tenant.id);
    return NextResponse.json({ campaigns }, { status: 200 });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: (err as { message?: string })?.message || 'Erro ao carregar cupons.' },
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

    const body = await request.json();
    const parsed = CouponPayloadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Dados inválidos do cupom.' },
        { status: 400 }
      );
    }

    const data = parsed.data;
    if (data.discountType === 'percentage' && data.discountValue > 100) {
      return NextResponse.json(
        { error: 'O desconto em porcentagem não pode ultrapassar 100%.' },
        { status: 400 }
      );
    }

    const normalizedCode = normalizeCouponCode(data.code);
    const { existingHours, campaigns } = await loadTenantCampaigns(session.tenant.id);

    const duplicate = campaigns.find(
      (c) => normalizeCouponCode(c.code) === normalizedCode && c.id !== data.id
    );
    if (duplicate) {
      return NextResponse.json(
        { error: `Já existe uma campanha com o código "${normalizedCode}".` },
        { status: 400 }
      );
    }

    const existing = data.id ? campaigns.find((c) => c.id === data.id) : undefined;
    const savedCampaign: CouponCampaign = {
      id: existing?.id || `cup_${crypto.randomUUID().slice(0, 8)}`,
      code: normalizedCode,
      name: sanitizePlainText(data.name, 120),
      description: data.description ? sanitizePlainText(data.description, 240) : undefined,
      discountType: data.discountType,
      discountValue: data.discountValue,
      minOrderCents: data.minOrderCents && data.minOrderCents > 0 ? data.minOrderCents : undefined,
      maxDiscountCents:
        data.maxDiscountCents && data.maxDiscountCents > 0 ? data.maxDiscountCents : undefined,
      maxUses: data.maxUses && data.maxUses > 0 ? data.maxUses : null,
      usedCount: existing?.usedCount ?? 0,
      startsAt: data.startsAt || null,
      expiresAt: data.expiresAt || null,
      isActive: data.isActive,
      createdAt: existing?.createdAt || new Date().toISOString(),
    };

    const nextCampaigns = existing
      ? campaigns.map((c) => (c.id === existing.id ? savedCampaign : c))
      : [savedCampaign, ...campaigns];

    await saveTenantCampaigns(session.tenant.id, existingHours, nextCampaigns);

    return NextResponse.json({ campaign: savedCampaign, campaigns: nextCampaigns }, { status: 200 });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: (err as { message?: string })?.message || 'Erro ao salvar cupom.' },
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

    const body = await request.json();
    const id = typeof body?.id === 'string' ? body.id : '';
    if (!id) {
      return NextResponse.json({ error: 'ID da campanha é obrigatório.' }, { status: 400 });
    }

    const { existingHours, campaigns } = await loadTenantCampaigns(session.tenant.id);
    const target = campaigns.find((c) => c.id === id);
    if (!target) {
      return NextResponse.json({ error: 'Campanha não encontrada.' }, { status: 404 });
    }

    const nextCampaigns = campaigns.map((c) =>
      c.id === id
        ? {
            ...c,
            isActive: typeof body.isActive === 'boolean' ? body.isActive : c.isActive,
          }
        : c
    );

    await saveTenantCampaigns(session.tenant.id, existingHours, nextCampaigns);
    return NextResponse.json({ campaigns: nextCampaigns }, { status: 200 });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: (err as { message?: string })?.message || 'Erro ao atualizar cupom.' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getAdminAuthSession(request);
    if (!session) {
      return NextResponse.json({ error: 'Acesso não autorizado.' }, { status: 401 });
    }

    const url = new URL(request.url);
    const id = url.searchParams.get('id') || '';
    if (!id) {
      return NextResponse.json({ error: 'ID da campanha é obrigatório.' }, { status: 400 });
    }

    const { existingHours, campaigns } = await loadTenantCampaigns(session.tenant.id);
    const nextCampaigns = campaigns.filter((c) => c.id !== id);
    await saveTenantCampaigns(session.tenant.id, existingHours, nextCampaigns);

    return NextResponse.json({ campaigns: nextCampaigns }, { status: 200 });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: (err as { message?: string })?.message || 'Erro ao remover cupom.' },
      { status: 500 }
    );
  }
}

