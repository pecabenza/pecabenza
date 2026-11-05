import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuthSession } from '@/lib/tenancy/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { createSafeErrorResponse } from '@/lib/security/error-response';

export const dynamic = 'force-dynamic';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAdminAuthSession(_request);
    if (!session) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }

    const { id } = await params;
    const adminClient = createAdminClient();

    const { error } = await adminClient
      .from('products')
      .delete()
      .eq('id', id)
      .eq('tenant_id', session.tenant.id);

    if (error) {
      return NextResponse.json({ error: 'Erro ao remover produto.' }, { status: 500 });
    }

    // Auditoria
    await adminClient.from('audit_logs').insert({
      tenant_id: session.tenant.id,
      user_id: session.user.id,
      resource_type: 'products',
      resource_id: id,
      action: 'DELETE_PRODUCT',
      payload_after: { deleted: true },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return createSafeErrorResponse(error, 500, { action: 'admin_delete_product' });
  }
}

