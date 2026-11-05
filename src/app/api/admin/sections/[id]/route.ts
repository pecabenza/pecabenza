import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuthSession } from '@/lib/tenancy/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { createSafeErrorResponse } from '@/lib/security/error-response';

export const dynamic = 'force-dynamic';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAdminAuthSession(request);
    if (!session) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const adminClient = createAdminClient();

    const updatePayload: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (typeof body.is_active === 'boolean') {
      updatePayload.is_active = body.is_active;
    }
    if (typeof body.display_order === 'number') {
      updatePayload.display_order = body.display_order;
    }

    const { data, error } = await adminClient
      .from('tenant_page_sections')
      .update(updatePayload)
      .eq('id', id)
      .eq('tenant_id', session.tenant.id)
      .select('*')
      .single();

    if (error) {
      return NextResponse.json({ error: 'Erro ao atualizar seção.' }, { status: 500 });
    }

    // Auditoria
    await adminClient.from('audit_logs').insert({
      tenant_id: session.tenant.id,
      user_id: session.user.id,
      resource_type: 'tenant_page_sections',
      resource_id: id,
      action: 'PATCH_SECTION',
      payload_after: updatePayload,
    });

    return NextResponse.json({ success: true, section: data });
  } catch (error) {
    return createSafeErrorResponse(error, 500, { action: 'admin_patch_section' });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAdminAuthSession(request);
    if (!session) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }

    const { id } = await params;
    const adminClient = createAdminClient();

    const { error } = await adminClient
      .from('tenant_page_sections')
      .delete()
      .eq('id', id)
      .eq('tenant_id', session.tenant.id);

    if (error) {
      return NextResponse.json({ error: 'Erro ao remover seção.' }, { status: 500 });
    }

    // Auditoria
    await adminClient.from('audit_logs').insert({
      tenant_id: session.tenant.id,
      user_id: session.user.id,
      resource_type: 'tenant_page_sections',
      resource_id: id,
      action: 'DELETE_SECTION',
      payload_after: { deleted: true },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return createSafeErrorResponse(error, 500, { action: 'admin_delete_section' });
  }
}

