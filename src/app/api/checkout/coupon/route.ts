import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveTenantByHost } from '@/lib/tenancy/context';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { createAdminClient } from '@/lib/supabase/admin';
import { parseStructuredBusinessHours } from '@/modules/commerce/store-config.engine';
import { evaluateCouponApplication } from '@/modules/commerce/coupon.engine';
import { formatBrl } from '@/modules/cart/cart.utils';

export const dynamic = 'force-dynamic';

const ValidateCouponSchema = z.object({
  code: z.string().trim().min(1, 'Informe o código do cupom.').max(40),
  subtotalInCents: z.number().int().nonnegative(),
});

export async function POST(request: NextRequest) {
  try {
    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'anonymous';
    const rateLimit = await checkRateLimit(clientIp, {
      limit: 60,
      windowSeconds: 60,
      prefix: 'checkout_coupon_validate',
    });

    if (!rateLimit.success) {
      return NextResponse.json(
        { valid: false, error: 'Muitas tentativas. Aguarde alguns instantes.' },
        { status: 429 }
      );
    }

    const host =
      request.headers.get('x-tenant-host') ||
      request.headers.get('host') ||
      'localhost:3000';

    const tenantContext = await resolveTenantByHost(host);
    if (!tenantContext) {
      return NextResponse.json(
        { valid: false, error: 'Estabelecimento não identificado.' },
        { status: 404 }
      );
    }

    const raw = await request.json();
    const parsed = ValidateCouponSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { valid: false, error: parsed.error.issues[0]?.message || 'Cupom inválido.' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();
    const { data: settingsRow } = await supabase
      .from('tenant_settings')
      .select('business_hours')
      .eq('tenant_id', tenantContext.tenant.id)
      .maybeSingle();

    const businessHours = parseStructuredBusinessHours(
      (settingsRow?.business_hours as Record<string, unknown> | null) ||
        (tenantContext.settings.business_hours as Record<string, unknown> | null)
    );

    const evaluation = evaluateCouponApplication(
      businessHours.coupon_campaigns || [],
      parsed.data.code,
      parsed.data.subtotalInCents
    );

    if (!evaluation.valid || !evaluation.coupon) {
      return NextResponse.json(
        { valid: false, error: evaluation.error || 'Cupom inválido ou expirado.' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        valid: true,
        code: evaluation.coupon.code,
        name: evaluation.coupon.name,
        discountType: evaluation.coupon.discountType,
        discountValue: evaluation.coupon.discountValue,
        discountCents: evaluation.discountCents,
        formattedDiscount: formatBrl(evaluation.discountCents),
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    return NextResponse.json(
      { valid: false, error: (err as { message?: string })?.message || 'Erro ao validar cupom.' },
      { status: 500 }
    );
  }
}

