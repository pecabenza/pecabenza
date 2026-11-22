import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuthSession } from '@/lib/tenancy/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/observability/logger';
import { getAdminOrder } from '@/modules/orders/orders.service';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAdminAuthSession(request);
    if (!session) {
      return NextResponse.json({ error: 'Acesso não autorizado.' }, { status: 401 });
    }

    const { id: orderId } = await params;
    if (!orderId) {
      return NextResponse.json({ error: 'ID do pedido é obrigatório.' }, { status: 400 });
    }

    const order = await getAdminOrder(session.tenant.id, orderId);

    return NextResponse.json(order, { status: 200 });
  } catch (error: any) {
    if (error.message?.includes('não localizado')) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    return NextResponse.json({ error: error.message || 'Erro ao carregar pedido.' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAdminAuthSession(request);
    if (!session) {
      return NextResponse.json({ error: 'Acesso não autorizado.' }, { status: 401 });
    }
    if (session.role !== 'tenant_admin') {
      return NextResponse.json(
        { error: 'Apenas administradores podem excluir pedidos.' },
        { status: 403 }
      );
    }

    const { id: orderId } = await params;
    if (!orderId) {
      return NextResponse.json({ error: 'ID do pedido é obrigatório.' }, { status: 400 });
    }

    const adminClient = createAdminClient();

    const { data: existing, error: findErr } = await adminClient
      .from('orders')
      .select('id, order_number')
      .eq('tenant_id', session.tenant.id)
      .eq('id', orderId)
      .maybeSingle();

    if (findErr || !existing) {
      return NextResponse.json({ error: 'Pedido não encontrado.' }, { status: 404 });
    }

    // Remove eventual lançamento financeiro vinculado ao pedido excluído
    try {
      await adminClient
        .from('finance_entries')
        .delete()
        .eq('tenant_id', session.tenant.id)
        .eq('order_id', orderId);
    } catch {
      // ignora se tabela ainda não existir
    }

    const { error: delErr } = await adminClient
      .from('orders')
      .delete()
      .eq('tenant_id', session.tenant.id)
      .eq('id', orderId);

    if (delErr) {
      return NextResponse.json(
        { error: `Não foi possível excluir o pedido: ${delErr.message}` },
        { status: 400 }
      );
    }

    logger.info('Pedido excluído pelo administrador', {
      tenantId: session.tenant.id,
      orderId,
      orderNumber: existing.order_number,
      actorId: session.user.id,
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Erro inesperado ao excluir pedido.' },
      { status: 500 }
    );
  }
}

