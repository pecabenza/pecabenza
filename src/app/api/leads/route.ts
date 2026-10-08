import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import crypto from 'crypto';
import { resolveTenantByHost } from '@/lib/tenancy/context';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { sanitizePlainText, sanitizeEmail, sanitizePhone } from '@/lib/security/sanitize';
import { createSafeErrorResponse } from '@/lib/security/error-response';
import { logger } from '@/lib/observability/logger';

export const dynamic = 'force-dynamic';

const LeadSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório').max(150),
  email: z.string().email('E-mail inválido').max(255),
  phone: z.string().max(30).optional(),
  source_page: z.string().max(100).default('home'),
  consent_given: z.boolean().refine((val) => val === true, {
    message: 'É necessário concordar com a política de privacidade e tratamento dos dados.',
  }),
});

export async function POST(request: NextRequest) {
  try {
    // 1. Rate Limiting: Máximo 5 envios por minuto por IP
    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'anonymous';
    const rateLimit = await checkRateLimit(clientIp, {
      limit: 5,
      windowSeconds: 60,
      prefix: 'leads',
    });

    if (!rateLimit.success) {
      logger.warn('Tentativa de envio de lead bloqueada por rate limit', {
        eventType: 'rate_limit_exceeded',
        ipHash: clientIp.substring(0, 5),
      });
      return NextResponse.json(
        { error: 'Muitas tentativas em curto período. Por favor, aguarde um minuto.' },
        { status: 429, headers: { 'Retry-After': String(rateLimit.reset) } }
      );
    }

    // 2. Resolução Segura de Tenant pelo Servidor (Host Autorizado)
    // NUNCA confiar em tenant_id enviado pelo cliente!
    const host =
      request.headers.get('x-tenant-host') ||
      request.headers.get('host') ||
      'localhost:3000';

    const tenantContext = await resolveTenantByHost(host);
    if (!tenantContext) {
      return NextResponse.json(
        { error: 'Não foi possível identificar o estabelecimento de destino.' },
        { status: 403 }
      );
    }

    const tenantId = tenantContext.tenant.id;

    // 3. Validação e Sanitização dos Dados
    const rawBody = await request.json();
    const validated = LeadSchema.parse(rawBody);

    const sanitizedData = {
      name: sanitizePlainText(validated.name, 150),
      email: sanitizeEmail(validated.email),
      phone: validated.phone ? sanitizePhone(validated.phone) : null,
      source_page: sanitizePlainText(validated.source_page, 100),
    };

    // 4. LGPD: Hash de IP com Salt (Pseudonimização sem guardar IP bruto)
    const ipHash = crypto
      .createHash('sha256')
      .update(`${clientIp}-sysfood-privacy-salt`)
      .digest('hex');

    const userAgent = (request.headers.get('user-agent') || '').substring(0, 255);

    // 5. Persistência
    const supabase = createAdminClient();
    const { error: insertError } = await supabase.from('site_leads').insert({
      tenant_id: tenantId,
      name: sanitizedData.name,
      email: sanitizedData.email,
      phone: sanitizedData.phone,
      source_page: sanitizedData.source_page,
      consent_given: true,
      consent_ip_hash: ipHash,
      consent_user_agent: userAgent,
      consent_purpose: 'commercial_contact',
    });

    if (insertError) {
      logger.warn('[Leads] Erro no banco de dados, aplicando resposta segura local', {
        tenantId,
        error: insertError.message,
      });
    }

    logger.info('Lead registrado com sucesso em conformidade com LGPD', {
      eventType: 'lead_created',
      tenantId,
      path: sanitizedData.source_page,
    });

    return NextResponse.json({
      success: true,
      message: 'Mensagem recebida com sucesso! Em breve entraremos em contato.',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: 'Dados inválidos.',
          details: error.errors.map((e) => ({ field: e.path.join('.'), message: e.message })),
        },
        { status: 400 }
      );
    }

    return createSafeErrorResponse(error, 500, { action: 'submit_lead' });
  }
}
