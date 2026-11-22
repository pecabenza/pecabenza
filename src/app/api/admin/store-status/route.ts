import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminAuthSession } from '@/lib/tenancy/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { invalidateTenantCache } from '@/lib/tenancy/context';
import { parseStructuredBusinessHours } from '@/modules/commerce/store-config.engine';
import { sanitizePlainText } from '@/lib/security/sanitize';

export const dynamic = 'force-dynamic';

const PatchStoreStatusSchema = z.object({
  isStoreOpen: z.boolean(),
  pauseReason: z.string().trim().max(200).nullable().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const session = await getAdminAuthSession(request);
    if (!session) {
      return NextResponse.json({ error: 'Acesso não autorizado.' }, { status: 401 });
    }

    const supabase = createAdminClient();
    const { data: settings } = await supabase
      .from('tenant_settings')
      .select('business_hours')
      .eq('tenant_id', session.tenant.id)
      .maybeSingle();

    const parsed = parseStructuredBusinessHours(
      (settings?.business_hours as Record<string, any> | null) || null
    );

    return NextResponse.json(
      {
        isStoreOpen: parsed.is_store_open,
        enforceSchedule: parsed.enforce_schedule,
        pauseReason: parsed.pause_reason || null,
      },
      { status: 200 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Erro ao consultar status da loja.' },
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
    const parsedBody = PatchStoreStatusSchema.safeParse(raw);
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: parsedBody.error.issues[0]?.message || 'Dados inválidos.' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();
    const { data: settings } = await supabase
      .from('tenant_settings')
      .select('business_hours')
      .eq('tenant_id', session.tenant.id)
      .maybeSingle();

    const currentHours =
      settings?.business_hours && typeof settings.business_hours === 'object'
        ? (settings.business_hours as Record<string, any>)
        : {};

    const nextHours = {
      ...currentHours,
      is_store_open: parsedBody.data.isStoreOpen,
      ...(parsedBody.data.pauseReason !== undefined
        ? {
            pause_reason: parsedBody.data.pauseReason
              ? sanitizePlainText(parsedBody.data.pauseReason)
              : null,
          }
        : {}),
    };

    const { error: updErr } = await supabase
      .from('tenant_settings')
      .update({
        business_hours: nextHours,
        updated_at: new Date().toISOString(),
      })
      .eq('tenant_id', session.tenant.id);

    if (updErr) {
      return NextResponse.json(
        { error: `Erro ao atualizar status da loja: ${updErr.message}` },
        { status: 400 }
      );
    }

    invalidateTenantCache(session.tenant.id);

    return NextResponse.json(
      {
        success: true,
        isStoreOpen: parsedBody.data.isStoreOpen,
      },
      { status: 200 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Erro ao atualizar status da loja.' },
      { status: 500 }
    );
  }
}

