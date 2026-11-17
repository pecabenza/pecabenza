import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminAuthSession } from '@/lib/tenancy/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { createSafeErrorResponse } from '@/lib/security/error-response';
import { sanitizePlainText } from '@/lib/security/sanitize';

export const dynamic = 'force-dynamic';

const hexColorRegex = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;

const BrandingUpdateSchema = z.object({
  logo_url: z.string().nullable().optional(),
  favicon_url: z.string().nullable().optional(),
  font_family_heading: z.string().min(1).max(50).default('Playfair Display'),
  font_family_body: z.string().min(1).max(50).default('Plus Jakarta Sans'),
  color_primary: z.string().regex(hexColorRegex, 'Cor primária inválida'),
  color_secondary: z.string().regex(hexColorRegex, 'Cor secundária inválida'),
  color_accent: z.string().regex(hexColorRegex, 'Cor de destaque inválida'),
  color_background: z.string().regex(hexColorRegex, 'Cor de fundo inválida'),
  color_surface: z.string().regex(hexColorRegex, 'Cor de superfície inválida'),
  color_text: z.string().regex(hexColorRegex, 'Cor de texto inválida'),
  color_admin_sidebar: z.string().regex(hexColorRegex, 'Cor do menu lateral inválida').optional(),
  color_button: z.string().regex(hexColorRegex, 'Cor dos botões inválida').optional(),
  color_button_hover: z.string().regex(hexColorRegex, 'Cor de hover dos botões inválida').optional(),
  border_radius: z.string().max(20).default('0.75rem'),
  prelaunch_banner_text: z.string().max(255).optional(),
  prelaunch_cta_text: z.string().max(50).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const session = await getAdminAuthSession(request);
    if (!session) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }

    const { tenant } = session;
    const adminClient = createAdminClient();

    const [brandingRes, settingsRes] = await Promise.all([
      adminClient.from('tenant_branding').select('*').eq('tenant_id', tenant.id).maybeSingle(),
      adminClient.from('tenant_settings').select('*').eq('tenant_id', tenant.id).maybeSingle(),
    ]);

    return NextResponse.json({
      success: true,
      branding: brandingRes.data,
      settings: settingsRes.data,
    });
  } catch (error) {
    return createSafeErrorResponse(error, 500, { action: 'admin_get_branding' });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAdminAuthSession(request);
    if (!session) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }

    const { tenant, user } = session;
    const rawBody = await request.json();
    const validated = BrandingUpdateSchema.parse(rawBody);

    const adminClient = createAdminClient();

    // 1. Atualizar tenant_branding
    const baseUpdate = {
      logo_url: validated.logo_url || null,
      favicon_url: validated.favicon_url || null,
      font_family_heading: validated.font_family_heading,
      font_family_body: validated.font_family_body,
      color_primary: validated.color_primary,
      color_secondary: validated.color_secondary,
      color_accent: validated.color_accent,
      color_background: validated.color_background,
      color_surface: validated.color_surface,
      color_text: validated.color_text,
      border_radius: validated.border_radius,
      updated_at: new Date().toISOString(),
    };

    const extendedUpdate: Record<string, unknown> = { ...baseUpdate };
    if (validated.color_admin_sidebar) {
      extendedUpdate.color_admin_sidebar = validated.color_admin_sidebar;
    }
    if (validated.color_button) {
      extendedUpdate.color_button = validated.color_button;
    }
    if (validated.color_button_hover) {
      extendedUpdate.color_button_hover = validated.color_button_hover;
    }

    let { data: updatedBranding, error: brandErr } = await adminClient
      .from('tenant_branding')
      .update(extendedUpdate)
      .eq('tenant_id', tenant.id)
      .select('*')
      .single();

    if (brandErr && brandErr.code === '42703') {
      const retry = await adminClient
        .from('tenant_branding')
        .update(baseUpdate)
        .eq('tenant_id', tenant.id)
        .select('*')
        .single();
      updatedBranding = retry.data;
      brandErr = retry.error;
    }

    if (brandErr) {
      return NextResponse.json(
        { error: 'Erro ao atualizar identidade visual no banco.' },
        { status: 500 }
      );
    }

    // 2. Atualizar textos de pré-lançamento em tenant_settings se informados
    let updatedSettings = null;
    if (validated.prelaunch_banner_text !== undefined || validated.prelaunch_cta_text !== undefined) {
      const settingsPayload: Record<string, any> = {
        updated_at: new Date().toISOString(),
      };
      if (validated.prelaunch_banner_text !== undefined) {
        settingsPayload.prelaunch_banner_text = sanitizePlainText(validated.prelaunch_banner_text, 255);
      }
      if (validated.prelaunch_cta_text !== undefined) {
        settingsPayload.prelaunch_cta_text = sanitizePlainText(validated.prelaunch_cta_text, 50);
      }

      const { data: setRes } = await adminClient
        .from('tenant_settings')
        .update(settingsPayload)
        .eq('tenant_id', tenant.id)
        .select('*')
        .single();

      updatedSettings = setRes;
    }

    // 3. Registrar auditoria imutável
    await adminClient.from('audit_logs').insert({
      tenant_id: tenant.id,
      user_id: user.id,
      resource_type: 'tenant_branding',
      resource_id: tenant.id,
      action: 'UPDATE_BRANDING',
      payload_after: {
        branding: updatedBranding,
        settings: updatedSettings,
      },
    });

    return NextResponse.json({
      success: true,
      branding: updatedBranding,
      settings: updatedSettings,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: 'Dados de identidade inválidos.',
          details: error.errors.map((e) => ({ field: e.path.join('.'), message: e.message })),
        },
        { status: 400 }
      );
    }
    return createSafeErrorResponse(error, 500, { action: 'admin_save_branding' });
  }
}

