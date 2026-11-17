import React from 'react';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { resolveTenantByHost } from '@/lib/tenancy/context';
import { getTenantPublicOrigin } from '@/lib/tenancy/origin';
import { getTenantPageWithSections } from '@/modules/cms/service';
import { getTenantCategories, getTenantProducts } from '@/modules/catalog/service';
import { SectionRenderer } from '@/components/sections/SectionRenderer';
import { HeroEditorial } from '@/components/sections/HeroEditorial';
import { ProductShowcaseSection } from '@/components/sections/ProductShowcaseSection';
import { HomeModalitiesSection } from '@/components/sections/HomeModalitiesSection';
import { HomeOrderStepsSection } from '@/components/sections/HomeOrderStepsSection';
import { generateBusinessJsonLd } from '@/lib/seo/schema';

export async function generateMetadata(): Promise<Metadata> {
  const headersList = await headers();
  const host = headersList.get('x-tenant-host') || headersList.get('host') || 'localhost:3000';
  const tenantContext = await resolveTenantByHost(host);

  if (!tenantContext) {
    return { title: 'Loja não encontrada' };
  }

  const { tenant, settings, branding } = tenantContext;
  const origin = getTenantPublicOrigin(tenantContext);
  const [page, products] = await Promise.all([
    getTenantPageWithSections(tenant.id, 'home'),
    getTenantProducts(tenant.id),
  ]);

  const title =
    page?.meta_title ||
    settings.seo_defaults.default_meta_title ||
    `${tenant.name} — Pratos Prontos e Conforto Gastronômico`;
  const description =
    page?.meta_description ||
    settings.seo_defaults.default_meta_description ||
    'Cardápio de pratos preparados e porcionados para aquecer na sua mesa.';

  const heroSection = page?.sections?.find((s) => s.section_type === 'HeroEditorial');
  const heroImageUrl = (heroSection?.content as { image_url?: string } | undefined)?.image_url;
  const productImageUrl = products.find((p) => p.cover_image_url)?.cover_image_url;
  const ogImage =
    settings.seo_defaults.default_og_image ||
    heroImageUrl ||
    productImageUrl ||
    (tenant.slug === 'benza' ? '/assets/brands/benza/mockup-hero-editorial.jpg' : branding.logo_url) ||
    undefined;

  const images = ogImage
    ? [
        {
          url: ogImage.startsWith('http') ? ogImage : `${origin}${ogImage}`,
          width: 1200,
          height: 630,
          alt: `${tenant.name} — Cozinha de verdade`,
        },
      ]
    : undefined;

  return {
    metadataBase: new URL(origin),
    title,
    description,
    alternates: {
      canonical: origin,
    },
    openGraph: {
      title,
      description,
      type: 'website',
      url: origin,
      siteName: tenant.name,
      ...(images ? { images } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      ...(images ? { images: images.map((i) => i.url) } : {}),
    },
  };
}

export default async function HomePage() {
  const headersList = await headers();
  const host = headersList.get('x-tenant-host') || headersList.get('host') || 'localhost:3000';
  const tenantContext = await resolveTenantByHost(host);

  if (!tenantContext) {
    notFound();
  }

  const { tenant, settings, branding } = tenantContext;
  const origin = getTenantPublicOrigin(tenantContext);

  const [page, products, categories] = await Promise.all([
    getTenantPageWithSections(tenant.id, 'home'),
    getTenantProducts(tenant.id),
    getTenantCategories(tenant.id),
  ]);

  const jsonLd = generateBusinessJsonLd(tenant, settings, origin, branding);
  const sections = page?.sections || [];
  const hasExplicitModalities = sections.some((s) => s.section_type === 'HomeModalitiesSection');
  const hasExplicitOrderSteps = sections.some((s) => s.section_type === 'HomeOrderStepsSection');
  const firstActiveShowcaseId = sections.find(
    (s) => s.section_type === 'ProductShowcaseSection' && s.is_active !== false
  )?.id;

  const fallbackHeroImage =
    products.find((p) => p.cover_image_url)?.cover_image_url ||
    (tenant.slug === 'benza' ? '/assets/brands/benza/mockup-hero-editorial.jpg' : undefined);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="pb-20 md:pb-0">
        {sections.length > 0 ? (
          <>
            {sections.map((section) => (
              <React.Fragment key={section.id}>
                <SectionRenderer
                  section={section}
                  products={products}
                  categories={categories}
                  settings={settings}
                  tenantId={tenant.id}
                  prelaunchCtaText={settings.prelaunch_cta_text}
                  siteMode={tenant.site_mode}
                />
                {section.id === firstActiveShowcaseId && (
                  <>
                    {!hasExplicitModalities && <HomeModalitiesSection />}
                    {!hasExplicitOrderSteps && <HomeOrderStepsSection />}
                  </>
                )}
              </React.Fragment>
            ))}
          </>
        ) : (
          <>
            <HeroEditorial
              content={{
                badge: `${tenant.name} — Cozinha de verdade`,
                title: 'Comida de verdade. Sabor que conquista.',
                subtitle:
                  'Receitas preparadas com cuidado para transformar sua rotina em momentos mais saborosos.',
                primary_cta_label: 'Conhecer o cardápio',
                primary_cta_href: '/produtos',
                secondary_cta_label: 'Nossa Proposta',
                secondary_cta_href: '/sobre',
                image_url: fallbackHeroImage,
              }}
            />
            <ProductShowcaseSection
              content={{
                title: 'Peça seu prato favorito',
                subtitle:
                  'Explore nossas categorias e adicione suas porções diretamente à sacola.',
                show_variants: true,
                cta_label: 'Ver cardápio completo',
                cta_href: '/produtos',
              }}
              products={products}
              categories={categories}
              ctaButtonText={settings.prelaunch_cta_text}
              siteMode={tenant.site_mode}
            />
            <HomeModalitiesSection />
            <HomeOrderStepsSection />
          </>
        )}
      </div>
    </>
  );
}
