import { NextRequest, NextResponse } from 'next/server';
import { resolveTenantByHost } from '@/lib/tenancy/context';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenantPages } from '@/modules/cms/service';
import { getTenantProducts } from '@/modules/catalog/service';
import { auditPageSeo, auditTenantSeoConfig, type SeoAuditReport } from '@/lib/seo/audit';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { createSafeErrorResponse } from '@/lib/security/error-response';
import type { TenantPage } from '@/types/database.types';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'anonymous';
    const rateLimit = await checkRateLimit(clientIp, {
      limit: 20,
      windowSeconds: 60,
      prefix: 'seo_audit',
    });

    if (!rateLimit.success) {
      return NextResponse.json({ error: 'Muitas consultas de auditoria.' }, { status: 429 });
    }

    const host =
      request.headers.get('x-tenant-host') ||
      request.headers.get('host') ||
      'localhost:3000';

    const tenantContext = await resolveTenantByHost(host);
    if (!tenantContext) {
      return NextResponse.json({ error: 'Tenant não encontrado.' }, { status: 403 });
    }

    const { tenant, settings, branding } = tenantContext;
    const supabase = createAdminClient();

    const [pages, products, sectionsRes] = await Promise.all([
      getTenantPages(tenant.id),
      getTenantProducts(tenant.id),
      supabase
        .from('tenant_page_sections')
        .select('*')
        .eq('tenant_id', tenant.id)
        .eq('is_active', true)
        .order('display_order', { ascending: true }),
    ]);

    const allSections = sectionsRes.data || [];
    const tenantAudit = auditTenantSeoConfig(tenant, settings, branding);
    const pageReports: SeoAuditReport[] = [];

    // Auditar cada página pública do tenant com base no conteúdo real de suas seções
    for (const page of pages) {
      const pageSections = allSections.filter((s: any) => s.page_id === page.id);

      // Extrair H1 dinâmico da primeira seção editorial que possuir título, ou usar o título da página
      let h1 = page.title;
      let textContent = '';
      const pageImages: { src: string; alt?: string }[] = [];

      for (const sec of pageSections) {
        const c = sec.content || {};
        if (!h1 || h1 === page.title) {
          if (c.title) h1 = c.title;
        }
        if (c.title) textContent += ` ${c.title}.`;
        if (c.subtitle) textContent += ` ${c.subtitle}.`;
        if (c.lead_paragraph) textContent += ` ${c.lead_paragraph}.`;
        if (c.description) textContent += ` ${c.description}.`;
        if (c.image_url) pageImages.push({ src: c.image_url, alt: c.title || page.title });
      }

      const pathSuffix = page.slug === 'home' ? '' : page.slug;
      const pageUrl = `https://${host}/${pathSuffix}`;

      pageReports.push(
        auditPageSeo({
          url: pageUrl,
          slug: page.slug,
          title: page.meta_title || `${page.title} | ${tenant.name}`,
          metaDescription: page.meta_description || settings.seo_defaults.default_meta_description || `${page.title} - ${tenant.name}`,
          canonicalUrl: page.canonical_url || pageUrl,
          h1: h1 || page.title,
          content: textContent.trim() || `${page.title} - ${tenant.name}`,
          primaryKeyword: page.primary_keyword || `${tenant.name.toLowerCase()} ${page.slug}`,
          searchIntent: page.search_intent || (page.slug === 'produtos' ? 'commercial' : 'informational'),
          images: pageImages,
        })
      );
    }

    // Auditar cada produto ativo do tenant
    for (const prod of products) {
      const prodImages: { src: string; alt?: string }[] = [];
      if (prod.cover_image_url) {
        prodImages.push({ src: prod.cover_image_url, alt: prod.name });
      }

      pageReports.push(
        auditPageSeo({
          url: `https://${host}/produtos/${prod.slug}`,
          slug: prod.slug,
          title: `${prod.name} | ${tenant.name}`,
          metaDescription: prod.short_description || prod.full_description || `${prod.name} preparado por ${tenant.name}.`,
          canonicalUrl: `https://${host}/produtos/${prod.slug}`,
          h1: prod.name,
          content: `${prod.short_description || ''} ${prod.full_description || ''} ${prod.information?.ingredients || ''}`.trim() || prod.name,
          primaryKeyword: prod.primary_keyword || prod.name.toLowerCase(),
          searchIntent: prod.search_intent || 'transactional',
          images: prodImages,
        })
      );
    }

    // Calcular Score Geral Médio
    const totalScore = pageReports.reduce((acc, curr) => acc + curr.score, 0);
    const overallScore = Math.round(totalScore / (pageReports.length || 1));

    // Consolidar contagem de problemas
    let criticalCount = 0;
    let importantCount = 0;
    let recommendationCount = 0;

    for (const report of pageReports) {
      for (const issue of report.issues) {
        if (issue.severity === 'critico') criticalCount++;
        else if (issue.severity === 'importante') importantCount++;
        else if (issue.severity === 'recomendacao') recommendationCount++;
      }
    }

    return NextResponse.json({
      success: true,
      tenantId: tenant.id,
      tenantName: tenant.name,
      overallScore,
      summary: {
        totalAuditedPages: pageReports.length,
        criticalIssues: criticalCount,
        importantIssues: importantCount,
        recommendations: recommendationCount,
      },
      tenantAudit,
      reports: pageReports,
    });
  } catch (error) {
    return createSafeErrorResponse(error, 500, { action: 'seo_audit' });
  }
}
