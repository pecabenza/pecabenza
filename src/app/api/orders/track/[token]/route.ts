import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { getPublicOrderTracking } from '@/modules/orders/orders.service';
import { logger } from '@/lib/observability/logger';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    if (!token || typeof token !== 'string' || token.length < 16) {
      return NextResponse.json({ error: 'Token de acompanhamento inválido.' }, { status: 400 });
    }

    // Rate Limiting para consulta pública de pedidos: 60 req/min por IP
    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'anonymous';
    const rateLimit = await checkRateLimit(clientIp, {
      limit: 60,
      windowSeconds: 60,
      prefix: 'public_order_tracking',
    });

    if (!rateLimit.success) {
      return NextResponse.json(
        { error: 'Muitas consultas recentes. Aguarde alguns instantes.' },
        { status: 429 }
      );
    }

    const trackingData = await getPublicOrderTracking(token);

    if (!trackingData) {
      logger.warn('Tentativa de consulta com token de rastreio inexistente', {
        tokenPrefix: token.slice(0, 8),
      });
      return NextResponse.json({ error: 'Pedido não localizado.' }, { status: 404 });
    }

    return NextResponse.json(trackingData, { status: 200 });
  } catch (error: any) {
    logger.error('Erro na consulta pública de status de pedido', {
      error: error.message,
    });
    return NextResponse.json({ error: 'Erro ao carregar status do pedido.' }, { status: 500 });
  }
}

