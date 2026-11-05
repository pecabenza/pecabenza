import { NextRequest, NextResponse } from 'next/server';
import { resolveTenantByHost } from '@/lib/tenancy/context';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { createSafeErrorResponse } from '@/lib/security/error-response';
import { logger } from '@/lib/observability/logger';
import { sanitizePlainText, sanitizePhone, sanitizeEmail } from '@/lib/security/sanitize';
import { CreateOrderInputSchema } from '@/modules/orders/orders.schema';
import { createOrderAtomic } from '@/modules/orders/orders.service';
import { isCommerceEnabled, getCommerceDisabledMessage } from '@/lib/tenancy/site-mode';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    // 1. Rate Limiting: 10 criações de pedido a cada 10 minutos por IP
    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'anonymous';
    const rateLimit = await checkRateLimit(clientIp, {
      limit: 10,
      windowSeconds: 600,
      prefix: 'order_create',
    });

    if (!rateLimit.success) {
      return NextResponse.json(
        { error: 'Muitos pedidos criados em sequência. Por favor, aguarde alguns minutos.' },
        { status: 429, headers: { 'Retry-After': String(rateLimit.reset) } }
      );
    }

    // 2. Resolução Segura do Tenant
    const host =
      request.headers.get('x-tenant-host') ||
      request.headers.get('host') ||
      'localhost:3000';

    const tenantContext = await resolveTenantByHost(host);
    if (!tenantContext) {
      return NextResponse.json(
        { error: 'Estabelecimento não identificado para este pedido.' },
        { status: 404 }
      );
    }

    const { tenant } = tenantContext;

    // 3. Verificação de Site Mode (Commerce Habilitado)
    if (!isCommerceEnabled(tenant.site_mode)) {
      return NextResponse.json(
        { error: getCommerceDisabledMessage(tenant.site_mode) },
        { status: 403 }
      );
    }

    // 4. Validação Zod do Payload
    const body = await request.json();
    const parseResult = CreateOrderInputSchema.safeParse(body);

    if (!parseResult.success) {
      const errorDetails = parseResult.error.flatten().fieldErrors;
      return NextResponse.json(
        { error: 'Dados do pedido inválidos. Verifique as informações preenchidas.', details: errorDetails },
        { status: 400 }
      );
    }

    const rawData = parseResult.data;

    // 5. Sanitização estrita contra XSS e injeção de dados de cliente
    const sanitizedInput = {
      ...rawData,
      customer: {
        name: sanitizePlainText(rawData.customer.name),
        phone: sanitizePhone(rawData.customer.phone),
        email: rawData.customer.email ? sanitizeEmail(rawData.customer.email) : undefined,
      },
      address: rawData.address
        ? {
            zipCode: sanitizePlainText(rawData.address.zipCode),
            street: sanitizePlainText(rawData.address.street),
            number: sanitizePlainText(rawData.address.number),
            complement: rawData.address.complement ? sanitizePlainText(rawData.address.complement) : undefined,
            neighborhood: sanitizePlainText(rawData.address.neighborhood),
            city: sanitizePlainText(rawData.address.city),
            state: sanitizePlainText(rawData.address.state).toUpperCase(),
            reference: rawData.address.reference ? sanitizePlainText(rawData.address.reference) : undefined,
          }
        : undefined,
      notes: rawData.notes ? sanitizePlainText(rawData.notes) : undefined,
    };

    // 6. Criação Atômica com Servidor como Única Autoridade de Preço e Subtotal
    const orderResult = await createOrderAtomic(tenant.id, sanitizedInput, tenant.site_mode);

    logger.info('Pedido transacional criado com sucesso', {
      tenantId: tenant.id,
      orderId: orderResult.orderId,
      orderNumber: orderResult.orderNumber,
      totalCents: orderResult.totalInCents,
      fulfillmentType: orderResult.fulfillmentType,
    });

    return NextResponse.json(orderResult, { status: 201 });
  } catch (error: any) {
    logger.error('Falha na criação do pedido transacional', {
      error: error.message,
    });

    // Se for erro de regra de negócio (ex: pedido mínimo, item esgotado), retornar 400 com mensagem amigável
    if (
      error.message?.includes('mínimo') ||
      error.message?.includes('esgotada') ||
      error.message?.includes('atualizado') ||
      error.message?.includes('indisponível') ||
      error.message?.includes('agendamento')
    ) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return createSafeErrorResponse(error, 500, {
      path: '/api/orders',
      action: 'order_create',
    });
  }
}
