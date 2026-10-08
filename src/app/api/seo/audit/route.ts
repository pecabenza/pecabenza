import { NextRequest, NextResponse } from 'next/server';
import { resolveTenantByHost } from '@/lib/tenancy/context';
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
    const [pages, products] = await Promise.all([
      getTenantPages(tenant.id),
      getTenantProducts(tenant.id),
    ]);

    const tenantAudit = auditTenantSeoConfig(tenant, settings, branding);
    const pageReports: SeoAuditReport[] = [];

    // Auditar Home
    const homePage = pages.find((p: TenantPage) => p.slug === 'home');
    pageReports.push(
      auditPageSeo({
        url: `https://${host}/`,
        slug: 'home',
        title: homePage?.meta_title || `${tenant.name} — Pratos Prontos e Conforto Gastronômico`,
        metaDescription: homePage?.meta_description || 'Cardápio de pratos preparados e porcionados para aquecer na sua mesa.',
        canonicalUrl: `https://${host}/`,
        h1: 'A comodidade da boa comida à sua mesa',
        content: 'Pratos clássicos preparados com cuidado e prontos para aquecer. Porções sob medida de 500 ml e 1000 ml feitas para a sua rotina.',
        primaryKeyword: `${tenant.name.toLowerCase()} comida congelada`,
        searchIntent: 'commercial',
      })
    );

    // Auditar Cardápio (/produtos)
    const cardapioPage = pages.find((p: TenantPage) => p.slug === 'produtos');
    pageReports.push(
      auditPageSeo({
        url: `https://${host}/produtos`,
        slug: 'produtos',
        title: cardapioPage?.meta_title || `Cardápio de Pratos | ${tenant.name}`,
        metaDescription: cardapioPage?.meta_description || `Conheça nosso cardápio de pratos preparados e prontos para aquecer da ${tenant.name}.`,
        canonicalUrl: `https://${host}/produtos`,
        h1: 'Cardápio de Pratos',
        content: 'Confira as opções preparadas com ingredientes tradicionais, embalagens forneáveis e congelamento cuidadoso.',
        primaryKeyword: 'pratos prontos congelados',
        searchIntent: 'commercial',
      })
    );

    // Auditar Sobre (/sobre)
    const sobrePage = pages.find((p: TenantPage) => p.slug === 'sobre');
    pageReports.push(
      auditPageSeo({
        url: `https://${host}/sobre`,
        slug: 'sobre',
        title: sobrePage?.meta_title || `Nossa Proposta | ${tenant.name}`,
        metaDescription: sobrePage?.meta_description || `A dedicação e o cuidado por trás de cada prato preparado pela ${tenant.name}.`,
        canonicalUrl: `https://${host}/sobre`,
        h1: 'Nossa Proposta',
        content: 'Acreditamos que uma refeição prática não precisa abrir mão do cuidado. Nossos pratos unem receitas tradicionais ao conforto da cozinha de verdade.',
        primaryKeyword: `${tenant.name.toLowerCase()} gastronomia`,
        searchIntent: 'informational',
      })
    );

    // Auditar cada prato ativo
    for (const prod of products) {
      pageReports.push(
        auditPageSeo({
          url: `https://${host}/produtos/${prod.slug}`,
          slug: prod.slug,
          title: `${prod.name} | ${tenant.name}`,
          metaDescription: prod.short_description || prod.full_description || `Prato preparado ${prod.name} pela ${tenant.name}.`,
          canonicalUrl: `https://${host}/produtos/${prod.slug}`,
          h1: prod.name,
          content: `${prod.short_description || ''} ${prod.full_description || ''} ${prod.information?.ingredients || ''}`,
          primaryKeyword: prod.name.toLowerCase(),
          searchIntent: 'transactional',
          images: prod.cover_image_url ? [{ src: prod.cover_image_url, alt: prod.name }] : [],
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
