import { NextRequest, NextResponse } from 'next/server';
import { resolveTenantByHost } from '@/lib/tenancy/context';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { createSafeErrorResponse } from '@/lib/security/error-response';
import { isCommerceEnabled, getCommerceDisabledMessage } from '@/lib/tenancy/site-mode';
import { PaymentService } from '@/modules/payments/payment.service';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: orderId } = await params;
    if (!orderId) {
      return NextResponse.json({ error: 'ID do pedido é obrigatório.' }, { status: 400 });
    }

    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'anonymous';
    const rateLimit = await checkRateLimit(clientIp, {
      limit: 20,
      windowSeconds: 300,
      prefix: 'card_checkout_generate',
    });

    if (!rateLimit.success) {
      return NextResponse.json(
        { error: 'Muitas solicitações de pagamento. Aguarde alguns instantes.' },
        { status: 429 }
      );
    }

    const host =
      request.headers.get('x-tenant-host') ||
      request.headers.get('host') ||
      'localhost:3000';

    const tenantContext = await resolveTenantByHost(host);
    if (!tenantContext) {
      return NextResponse.json({ error: 'Estabelecimento não identificado.' }, { status: 404 });
    }

    const { tenant } = tenantContext;
    if (!isCommerceEnabled(tenant.site_mode)) {
      return NextResponse.json(
        { error: getCommerceDisabledMessage(tenant.site_mode) },
        { status: 403 }
      );
    }

    let successUrl: string | undefined;
    try {
      const body = await request.json();
      if (typeof body?.successUrl === 'string' && body.successUrl.startsWith('http')) {
        successUrl = body.successUrl;
      }
    } catch {
      // Body opcional
    }

    const cardPayment = await PaymentService.createCardCheckoutPayment(
      tenant.id,
      orderId,
      successUrl
    );

    return NextResponse.json(cardPayment, { status: 200 });
  } catch (error: any) {
    if (
      error.message?.includes('não localizado') ||
      error.message?.includes('pago') ||
      error.message?.includes('cancelado')
    ) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return createSafeErrorResponse(error, 500, {
      path: '/api/orders/[id]/pay/card',
      action: 'card_checkout_generate',
    });
  }
}

