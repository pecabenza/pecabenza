import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveTenantByHost } from '@/lib/tenancy/context';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { sanitizeEmail, sanitizePlainText } from '@/lib/security/sanitize';
import { createSafeErrorResponse } from '@/lib/security/error-response';
import { logger } from '@/lib/observability/logger';

export const dynamic = 'force-dynamic';

const PrivacyRequestSchema = z.object({
  email: z.string().email('E-mail inválido').max(255),
  request_type: z.enum(['access', 'deletion', 'rectification']),
  notes: z.string().max(1000).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'anonymous';
    const rateLimit = await checkRateLimit(clientIp, {
      limit: 3,
      windowSeconds: 60,
      prefix: 'privacy_req',
    });

    if (!rateLimit.success) {
      return NextResponse.json(
        { error: 'Muitas solicitações enviadas. Aguarde alguns instantes.' },
        { status: 429 }
      );
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
    const validated = PrivacyRequestSchema.parse(body);

    const email = sanitizeEmail(validated.email);
    const notes = validated.notes ? sanitizePlainText(validated.notes, 1000) : null;

    const supabase = createAdminClient();
    await supabase.from('privacy_requests').insert({
      tenant_id: tenantId,
      email,
      request_type: validated.request_type,
      notes,
      status: 'pending',
    });

    logger.info('Solicitação de direitos de titular LGPD recebida', {
      tenantId,
      requestType: validated.request_type,
    });

    return NextResponse.json({
      success: true,
      message: 'Sua solicitação foi registrada com sucesso. O prazo legal de resposta é de até 15 dias úteis.',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'E-mail ou tipo de solicitação inválido.' }, { status: 400 });
    }
    return createSafeErrorResponse(error, 500, { action: 'privacy_request' });
  }
}
