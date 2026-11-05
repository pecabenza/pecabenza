import { NextRequest, NextResponse } from 'next/server';
import { resolveTenantByHost } from '@/lib/tenancy/context';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { createSafeErrorResponse } from '@/lib/security/error-response';
import { PaymentService } from '@/modules/payments/payment.service';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: paymentId } = await params;

    if (!paymentId) {
      return NextResponse.json({ error: 'ID do pagamento é obrigatório.' }, { status: 400 });
    }

    // Rate Limiting brando para polling: 120 requisições por minuto
    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'anonymous';
    const rateLimit = await checkRateLimit(clientIp, {
      limit: 120,
      windowSeconds: 60,
      prefix: 'payment_status_polling',
    });

    if (!rateLimit.success) {
      return NextResponse.json(
        { error: 'Taxa de atualização excedida. Aguarde alguns instantes.' },
        { status: 429 }
      );
    }

    // Resolução do Tenant
    const host =
      request.headers.get('x-tenant-host') ||
      request.headers.get('host') ||
      'localhost:3000';

    const tenantContext = await resolveTenantByHost(host);
    if (!tenantContext) {
      return NextResponse.json(
        { error: 'Estabelecimento não identificado.' },
        { status: 404 }
      );
    }

    const { tenant } = tenantContext;

    const statusResult = await PaymentService.getPaymentStatus(tenant.id, paymentId);

    return NextResponse.json(statusResult, { status: 200 });
  } catch (error: any) {
    if (error.message?.includes('não localizado')) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    return createSafeErrorResponse(error, 500, {
      path: '/api/payments/[id]/status',
      action: 'payment_status_check',
    });
  }
}
