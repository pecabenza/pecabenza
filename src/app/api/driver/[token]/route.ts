import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { getDriverPortalByToken } from '@/modules/delivery/delivery.service';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    if (!token || token.trim().length < 24) {
      return NextResponse.json({ error: 'Token de rota inválido.' }, { status: 400 });
    }

    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'anonymous';
    const rateLimit = await checkRateLimit(clientIp, {
      limit: 90,
      windowSeconds: 60,
      prefix: 'driver_portal_get',
    });

    if (!rateLimit.success) {
      return NextResponse.json(
        { error: 'Muitas requisições recentes. Aguarde alguns instantes.' },
        { status: 429 }
      );
    }

    const portal = await getDriverPortalByToken(token);
    if (!portal) {
      return NextResponse.json({ error: 'Rota de entrega não encontrada.' }, { status: 404 });
    }

    if (portal.expired) {
      return NextResponse.json(
        { expired: true, error: portal.reason, runCode: portal.runCode, status: portal.status },
        { status: 410 }
      );
    }

    return NextResponse.json(portal, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Erro ao carregar rota do entregador.' },
      { status: 500 }
    );
  }
}

