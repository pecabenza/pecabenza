import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { logger } from '@/lib/observability/logger';
import { PaymentProviderName, WebhookEventInput } from '@/modules/payments/types';
import { PaymentService } from '@/modules/payments/payment.service';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const startTime = Date.now();
  try {
    const { provider } = await params;
    const providerName = provider as PaymentProviderName;

    if (!['mock', 'asaas', 'mercadopago'].includes(providerName)) {
      return NextResponse.json({ error: 'Provedor de pagamento não suportado.' }, { status: 400 });
    }

    // Coleta headers
    const headers: Record<string, string | string[] | undefined> = {};
    request.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });

    // 1. Verificação prévia de segurança específica do Asaas
    // Desde fev/2026, Asaas exige authToken específico enviado no header asaas-access-token
    if (providerName === 'asaas') {
      const asaasToken = headers['asaas-access-token'] || headers['x-asaas-access-token'];
      if (!asaasToken) {
        logger.warn('Webhook Asaas recusado: header asaas-access-token ausente');
        return NextResponse.json(
          { error: 'Não autorizado: token de autenticação de webhook ausente.' },
          { status: 401 }
        );
      }
    }

    const rawBody = await request.text();
    let parsedBody: any = {};
    try {
      parsedBody = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      return NextResponse.json({ error: 'Payload de webhook não é um JSON válido.' }, { status: 400 });
    }

    // 2. Resolução do Tenant ID
    // Estratégia A: Via query param ?tenant_id=... ou header x-tenant-id
    const url = new URL(request.url);
    let tenantId = url.searchParams.get('tenant_id') || (request.headers.get('x-tenant-id') as string);

    // Estratégia B: Fallback seguro via Lookup por provider_payment_id no banco
    if (!tenantId) {
      const providerPaymentId =
        parsedBody.id ||
        parsedBody.paymentId ||
        parsedBody.payment?.id ||
        parsedBody.providerPaymentId;

      if (providerPaymentId) {
        const supabase = getSupabaseAdmin();
        const { data: matchedPayment } = await supabase
          .from('payments')
          .select('tenant_id')
          .or(`provider_payment_id.eq.${providerPaymentId},id.eq.${providerPaymentId}`)
          .maybeSingle();

        if (matchedPayment) {
          tenantId = matchedPayment.tenant_id;
        }
      }
    }

    if (!tenantId) {
      logger.warn('Webhook recebido sem identificação do tenant associado', {
        provider,
        event: parsedBody.event || parsedBody.eventType,
      });
      return NextResponse.json(
        { error: 'Tenant não identificado para este evento de webhook.' },
        { status: 400 }
      );
    }

    const webhookInput: WebhookEventInput = {
      tenantId,
      provider: providerName,
      headers,
      rawBody,
      parsedBody,
    };

    const result = await PaymentService.processWebhook(webhookInput);

    if (!result.success) {
      if (result.error?.includes('Assinatura') || result.error?.includes('Não autorizado')) {
        return NextResponse.json({ error: result.error }, { status: 401 });
      }
      if (result.error?.includes('não localizado')) {
        return NextResponse.json({ error: result.error }, { status: 404 });
      }
      return NextResponse.json(
        { error: result.error || 'Falha no processamento do webhook.' },
        { status: 400 }
      );
    }

    const durationMs = Date.now() - startTime;
    return NextResponse.json(
      {
        ...result,
        durationMs,
      },
      { status: 200 }
    );
  } catch (error: any) {
    logger.error('Exceção ao processar webhook de pagamento', {
      error: error.message,
    });
    return NextResponse.json({ error: 'Erro interno ao processar webhook.' }, { status: 500 });
  }
}
