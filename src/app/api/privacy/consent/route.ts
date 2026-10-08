import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import crypto from 'crypto';
import { resolveTenantByHost } from '@/lib/tenancy/context';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { createSafeErrorResponse } from '@/lib/security/error-response';
import { logger } from '@/lib/observability/logger';

export const dynamic = 'force-dynamic';

const ConsentSchema = z.object({
  consent_type: z.enum(['cookies_analytics', 'essential_only', 'marketing']).default('cookies_analytics'),
  purpose: z.string().max(100).default('visitor_preference'),
  consent_given: z.boolean(),
});

export async function POST(request: NextRequest) {
  try {
    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'anonymous';
    const rateLimit = await checkRateLimit(clientIp, {
      limit: 15,
      windowSeconds: 60,
      prefix: 'consent',
    });

    if (!rateLimit.success) {
      return NextResponse.json({ error: 'Muitas requisições.' }, { status: 429 });
    }

    const host =
      request.headers.get('x-tenant-host') ||
      request.headers.get('host') ||
      'localhost:3000';

    const tenantContext = await resolveTenantByHost(host);
    if (!tenantContext) {
      return NextResponse.json({ error: 'Tenant não encontrado.' }, { status: 403 });
    }

    const tenantId = tenantContext.tenant.id;
    const body = await request.json();
    const validated = ConsentSchema.parse(body);

    const ipHash = crypto
      .createHash('sha256')
      .update(`${clientIp}-sysfood-consent-salt`)
      .digest('hex');

    const userAgent = (request.headers.get('user-agent') || '').substring(0, 255);

    const supabase = createAdminClient();
    await supabase.from('user_consents').insert({
      tenant_id: tenantId,
      consent_type: validated.consent_type,
      purpose: validated.purpose,
      ip_hash: ipHash,
      user_agent: userAgent,
      consent_given: validated.consent_given,
    });

    logger.info('Consentimento registrado com sucesso', {
      tenantId,
      consentType: validated.consent_type,
      given: validated.consent_given,
    });

    return NextResponse.json({ success: true, message: 'Preferência de privacidade gravada.' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 });
    }
    return createSafeErrorResponse(error, 500, { action: 'register_consent' });
  }
}
