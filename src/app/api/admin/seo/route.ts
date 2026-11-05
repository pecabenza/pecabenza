import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminAuthSession } from '@/lib/tenancy/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { createSafeErrorResponse } from '@/lib/security/error-response';
import { sanitizePlainText } from '@/lib/security/sanitize';

export const dynamic = 'force-dynamic';

const SeoSettingsSchema = z.object({
  ga4Id: z.string().max(30).optional().nullable(),
  gscTag: z.string().max(100).optional().nullable(),
  businessType: z.string().max(50).optional().nullable(),
  servesCuisine: z.string().max(50).optional().nullable(),
  priceRange: z.string().max(10).optional().nullable(),
});

export async function GET(request: NextRequest) {
  try {
    const session = await getAdminAuthSession(request);
    if (!session) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }

    const adminClient = createAdminClient();
    const { data: settings } = await adminClient
      .from('tenant_settings')
      .select('ga4_measurement_id, gsc_verification_tag, business_type, serves_cuisine, price_range')
      .eq('tenant_id', session.tenant.id)
      .maybeSingle();

    return NextResponse.json({
      success: true,
      ga4Id: settings?.ga4_measurement_id || '',
      gscTag: settings?.gsc_verification_tag || '',
      businessType: settings?.business_type || 'LocalBusiness',
      servesCuisine: settings?.serves_cuisine || '',
      priceRange: settings?.price_range || '',
    });
  } catch (error) {
    return createSafeErrorResponse(error, 500, { action: 'admin_get_seo_settings' });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAdminAuthSession(request);
    if (!session) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }

    const { tenant, user } = session;
    const body = await request.json();
    const validated = SeoSettingsSchema.parse(body);

    const adminClient = createAdminClient();

    const updatePayload = {
      ga4_measurement_id: validated.ga4Id ? sanitizePlainText(validated.ga4Id, 30) : null,
      gsc_verification_tag: validated.gscTag ? sanitizePlainText(validated.gscTag, 100) : null,
      business_type: validated.businessType ? sanitizePlainText(validated.businessType, 50) : null,
      serves_cuisine: validated.servesCuisine ? sanitizePlainText(validated.servesCuisine, 50) : null,
      price_range: validated.priceRange ? sanitizePlainText(validated.priceRange, 10) : null,
      updated_at: new Date().toISOString(),
    };

    const { error } = await adminClient
      .from('tenant_settings')
      .update(updatePayload)
      .eq('tenant_id', tenant.id);

    if (error) {
      return NextResponse.json({ error: 'Erro ao salvar configurações de SEO.' }, { status: 500 });
    }

    // Auditoria
    await adminClient.from('audit_logs').insert({
      tenant_id: tenant.id,
      user_id: user.id,
      resource_type: 'tenant_settings',
      resource_id: tenant.id,
      action: 'UPDATE_SEO_SETTINGS',
      payload_after: updatePayload,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Dados inválidos.', details: error.errors }, { status: 400 });
    }
    return createSafeErrorResponse(error, 500, { action: 'admin_save_seo_settings' });
  }
}

