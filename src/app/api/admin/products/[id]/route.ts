import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminAuthSession } from '@/lib/tenancy/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { createSafeErrorResponse } from '@/lib/security/error-response';

export const dynamic = 'force-dynamic';

const patchProductStatusSchema = z.object({
  status: z.enum(['active', 'draft']),
});

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAdminAuthSession(request);
    if (!session) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }

    const { id } = await context.params;
    const body = await request.json();
    const parsed = patchProductStatusSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Status inválido. Use "active" ou "draft".' },
        { status: 400 }
      );
    }

    const adminSupabase = createAdminClient();
    const { status } = parsed.data;

    const { data: product, error } = await adminSupabase
      .from('products')
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('tenant_id', session.tenant.id)
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: 'Erro ao atualizar status do prato.' },
        { status: 500 }
      );
    }

    if (!product) {
      return NextResponse.json(
        { error: 'Produto não encontrado.' },
        { status: 404 }
      );
    }

    await adminSupabase.from('audit_logs').insert({
      tenant_id: session.tenant.id,
      actor_id: session.user.id,
      resource_type: 'products',
      resource_id: id,
      action: status === 'draft' ? 'PAUSE_PRODUCT' : 'ACTIVATE_PRODUCT',
      payload_after: { status },
    });

    return NextResponse.json({ success: true, product });
  } catch (error) {
    return createSafeErrorResponse(error, 500, {
      action: 'admin_patch_product_status',
    });
  }
}

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
      // Produto referenciado em pedidos, receitas ou lotes de estoque: arquiva com segurança
      const isConstraintError = error.code === '23503' || error.code === '23502';
      if (!isConstraintError) {
        return NextResponse.json(
          { error: `Erro ao remover produto: ${error.message}` },
          { status: 500 }
        );
      }

      const { error: archiveErr } = await adminClient
        .from('products')
        .update({
          status: 'archived',
          is_featured: false,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('tenant_id', session.tenant.id);

      if (archiveErr) {
        return NextResponse.json(
          { error: `Erro ao arquivar produto: ${archiveErr.message}` },
          { status: 500 }
        );
      }

      await adminClient
        .from('product_variants')
        .update({ is_available: false })
        .eq('product_id', id)
        .eq('tenant_id', session.tenant.id);

      await adminClient.from('audit_logs').insert({
        tenant_id: session.tenant.id,
        actor_id: session.user.id,
        resource_type: 'products',
        resource_id: id,
        action: 'ARCHIVE_PRODUCT',
        payload_after: { status: 'archived', reason: 'referenced_by_history' },
      });

      return NextResponse.json({
        success: true,
        archived: true,
        message:
          'Prato arquivado com segurança (possui histórico em pedidos/estoque e foi ocultado do cardápio).',
      });
    }

    // Auditoria de exclusão definitiva
    await adminClient.from('audit_logs').insert({
      tenant_id: session.tenant.id,
      actor_id: session.user.id,
      resource_type: 'products',
      resource_id: id,
      action: 'DELETE_PRODUCT',
      payload_after: { deleted: true },
    });

    return NextResponse.json({ success: true, archived: false });
  } catch (error) {
    return createSafeErrorResponse(error, 500, { action: 'admin_delete_product' });
  }
}
