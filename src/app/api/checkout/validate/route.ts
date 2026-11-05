import { NextRequest, NextResponse } from 'next/server';
import { resolveTenantByHost } from '@/lib/tenancy/context';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { createSafeErrorResponse } from '@/lib/security/error-response';
import { logger } from '@/lib/observability/logger';
import { CartValidationInputSchema } from '@/modules/orders/orders.schema';
import { validateCartItems } from '@/modules/orders/orders.service';
import { isCommerceEnabled, getCommerceDisabledMessage } from '@/lib/tenancy/site-mode';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    // 1. Rate Limiting: 30 requisições por minuto por IP
    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'anonymous';
    const rateLimit = await checkRateLimit(clientIp, {
      limit: 30,
      windowSeconds: 60,
      prefix: 'checkout_validate',
    });

    if (!rateLimit.success) {
      return NextResponse.json(
        { error: 'Muitas verificações em curto período. Por favor, aguarde alguns instantes.' },
        { status: 429, headers: { 'Retry-After': String(rateLimit.reset) } }
      );
    }

    // 2. Resolução Segura de Tenant pelo Servidor
    const host =
      request.headers.get('x-tenant-host') ||
      request.headers.get('host') ||
      'localhost:3000';

    const tenantContext = await resolveTenantByHost(host);
    if (!tenantContext) {
      return NextResponse.json(
        { error: 'Estabelecimento não identificado para esta requisição.' },
        { status: 404 }
      );
    }

    const { tenant } = tenantContext;

    // 3. Verificação de Site Mode (Commerce Habilitado)
    if (!isCommerceEnabled(tenant.site_mode)) {
      return NextResponse.json(
        {
          isValid: false,
          commerceDisabled: true,
          error: getCommerceDisabledMessage(tenant.site_mode),
        },
        { status: 403 }
      );
    }

    // 4. Validação Zod do Payload
    const body = await request.json();
    const parseResult = CartValidationInputSchema.safeParse(body);

    if (!parseResult.success) {
      const errorDetails = parseResult.error.flatten().fieldErrors;
      return NextResponse.json(
        { error: 'Dados da sacola em formato inválido.', details: errorDetails },
        { status: 400 }
      );
    }

    // 5. Revalidação autoritativa pelo Servidor
    const validation = await validateCartItems(tenant.id, parseResult.data.items);

    return NextResponse.json(validation, { status: 200 });
  } catch (error: any) {
    logger.error('Erro ao revalidar carrinho de compras', {
      error: error.message,
    });
    return createSafeErrorResponse(error, 500, {
      path: '/api/checkout/validate',
      action: 'checkout_validate',
    });
  }
}
