import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuthSession } from '@/lib/tenancy/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  HeroEditorialSchema,
  HeroMinimalSchema,
  BrandStorySchema,
  ProductShowcaseSchema,
  BenefitsSchema,
  ImageTextSchema,
  CTASectionSchema,
  FAQSectionSchema,
  ContactSectionSchema,
  SocialSectionSchema,
} from '@/modules/cms/schemas';
import { createSafeErrorResponse } from '@/lib/security/error-response';
import { logger } from '@/lib/observability/logger';
import {
  DEFAULT_SOBRE_SECTIONS,
  DEFAULT_CONTATO_SECTIONS,
} from '@/modules/cms/sobre-defaults';

export const dynamic = 'force-dynamic';

function validateSectionContent(sectionType: string, content: any) {
  switch (sectionType) {
    case 'HeroEditorial':
      return HeroEditorialSchema.parse(content);
    case 'HeroMinimal':
      return HeroMinimalSchema.parse(content);
    case 'BrandStorySection':
      return BrandStorySchema.parse(content);
    case 'ProductShowcaseSection':
      return ProductShowcaseSchema.parse(content);
    case 'BenefitsSection':
      return BenefitsSchema.parse(content);
    case 'ImageTextSection':
      return ImageTextSchema.parse(content);
    case 'CTASection':
      return CTASectionSchema.parse(content);
    case 'FAQSection':
      return FAQSectionSchema.parse(content);
    case 'ContactSection':
      return ContactSectionSchema.parse(content);
    case 'SocialSection':
      return SocialSectionSchema.parse(content);
    default:
      return content;
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getAdminAuthSession(request);
    if (!session) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }

    const { tenant } = session;
    const pageSlug = request.nextUrl.searchParams.get('page') || 'home';
    const adminClient = createAdminClient();

    // 1. Obter ou criar a página para o tenant
    let { data: page } = await adminClient
      .from('tenant_pages')
      .select('id, title, slug')
      .eq('tenant_id', tenant.id)
      .eq('slug', pageSlug)
      .maybeSingle();

    if (!page) {
      const pageTitleMap: Record<string, string> = {
        home: 'Página Inicial',
        sobre: 'Nossa Proposta',
        contato: 'Contato',
      };
      const { data: createdPage, error: createPageErr } = await adminClient
        .from('tenant_pages')
        .insert({
          tenant_id: tenant.id,
          slug: pageSlug,
          title: pageTitleMap[pageSlug] || pageSlug,
          status: 'published',
        })
        .select('id, title, slug')
        .single();

      if (createPageErr || !createdPage) {
        return NextResponse.json(
          { error: 'Não foi possível carregar a página.' },
          { status: 500 }
        );
      }
      page = createdPage;
    }

    // 2. Buscar seções cadastradas
    let { data: sections, error: secError } = await adminClient
      .from('tenant_page_sections')
      .select('*')
      .eq('tenant_id', tenant.id)
      .eq('page_id', page.id)
      .order('display_order', { ascending: true });

    if (secError) {
      return NextResponse.json(
        { error: 'Erro ao listar seções.' },
        { status: 500 }
      );
    }

    // 2b. Se for /sobre ou /contato e ainda não houver seções no banco, semear padrões
    if ((!sections || sections.length === 0) && (pageSlug === 'sobre' || pageSlug === 'contato')) {
      const seeds = pageSlug === 'sobre' ? DEFAULT_SOBRE_SECTIONS : DEFAULT_CONTATO_SECTIONS;
      const { data: seeded } = await adminClient
        .from('tenant_page_sections')
        .insert(
          seeds.map((s) => ({
            tenant_id: tenant.id,
            page_id: page!.id,
            section_type: s.section_type,
            variant: s.variant,
            display_order: s.display_order,
            is_active: s.is_active,
            content: s.content,
          }))
        )
        .select('*')
        .order('display_order', { ascending: true });

      if (seeded) {
        sections = seeded;
      }
    }

    return NextResponse.json({
      success: true,
      pageId: page.id,
      tenantId: tenant.id,
      sections: sections || [],
    });
  } catch (error) {
    return createSafeErrorResponse(error, 500, { action: 'admin_get_sections' });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAdminAuthSession(request);
    if (!session) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }

    const { tenant, user } = session;
    const body = await request.json();
    const { id, page_id, section_type, variant = 'default', display_order = 0, is_active = true, content } = body;

    if (!section_type || !content) {
      return NextResponse.json(
        { error: 'Tipo de seção e conteúdo são obrigatórios.' },
        { status: 400 }
      );
    }

    // Validação estrita via Zod do tipo de seção
    let validatedContent;
    try {
      validatedContent = validateSectionContent(section_type, content);
    } catch (zodErr: any) {
      return NextResponse.json(
        {
          error: 'Conteúdo da seção inválido.',
          details: zodErr.errors?.map((e: any) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();

    // Se id foi fornecido, atualiza; caso contrário, insere
    let savedSection;
    if (id && !id.startsWith('sec-temp-')) {
      const { data, error } = await adminClient
        .from('tenant_page_sections')
        .update({
          section_type,
          variant,
          display_order,
          is_active,
          content: validatedContent,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('tenant_id', tenant.id)
        .select('*')
        .single();

      if (error) {
        logger.error('Erro ao atualizar seção do CMS', { tenantId: tenant.id, error: error.message });
        return NextResponse.json({ error: 'Erro ao atualizar seção no banco.' }, { status: 500 });
      }
      savedSection = data;
    } else {
      // Inserção nova
      const { data, error } = await adminClient
        .from('tenant_page_sections')
        .insert({
          tenant_id: tenant.id,
          page_id,
          section_type,
          variant,
          display_order,
          is_active,
          content: validatedContent,
        })
        .select('*')
        .single();

      if (error) {
        logger.error('Erro ao criar seção do CMS', { tenantId: tenant.id, error: error.message });
        return NextResponse.json({ error: 'Erro ao salvar nova seção no banco.' }, { status: 500 });
      }
      savedSection = data;
    }

    // Registrar no audit_logs imutável
    await adminClient.from('audit_logs').insert({
      tenant_id: tenant.id,
      user_id: user.id,
      resource_type: 'tenant_page_sections',
      resource_id: savedSection.id,
      action: id ? 'UPDATE_SECTION' : 'CREATE_SECTION',
      payload_after: {
        section_type,
        is_active,
        display_order,
      },
    });

    return NextResponse.json({
      success: true,
      section: savedSection,
    });
  } catch (error) {
    return createSafeErrorResponse(error, 500, { action: 'admin_save_section' });
  }
}

