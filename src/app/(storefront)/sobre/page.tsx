import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import {
  ArrowRight,
  ChevronDown,
  Flame,
  PackageCheck,
  Snowflake,
  FileText,
  MessageCircle,
  MapPin,
} from 'lucide-react';
import { resolveTenantByHost } from '@/lib/tenancy/context';
import { getTenantPublicOrigin } from '@/lib/tenancy/origin';
import { getTenantProducts } from '@/modules/catalog/service';
import { getTenantPageSections } from '@/modules/cms/page-sections';
import { DEFAULT_SOBRE_SECTIONS } from '@/modules/cms/sobre-defaults';
import { Container } from '@/components/ui/Container';
import { generateBreadcrumbJsonLd } from '@/lib/seo/schema';
import { SobreReveal } from '@/components/sobre/SobreReveal';
import { SobreModalitySwitcher } from '@/components/sobre/SobreModalitySwitcher';
import { SobreFlavorsGallery } from '@/components/sobre/SobreFlavorsGallery';
import type { Product } from '@/types/database.types';

function prioritizeSignatureDishes(products: Product[]): Product[] {
  const getPriority = (name: string): number => {
    const lower = name.toLowerCase();
    if (lower.includes('feijoada')) return 0;
    if (lower.includes('lasanha')) return 1;
    if (lower.includes('escondidinho')) return 2;
    return 3;
  };

  return [...products].sort((a, b) => {
    const diff = getPriority(a.name) - getPriority(b.name);
    if (diff !== 0) return diff;
    return Number(b.is_featured) - Number(a.is_featured);
  });
}

function buildOfficialContactHref(whatsapp?: string | null): {
  href: string;
  external: boolean;
} {
  const digits = (whatsapp || '').replace(/\D/g, '');
  if (digits.length >= 10) {
    const normalized = digits.startsWith('55') ? digits : `55${digits}`;
    return {
      href: `https://wa.me/${normalized}?text=${encodeURIComponent(
        'Olá! Gostaria de saber mais sobre o cardápio da BENZA.'
      )}`,
      external: true,
    };
  }
  return { href: '/contato', external: false };
}

export async function generateMetadata(): Promise<Metadata> {
  const headersList = await headers();
  const host = headersList.get('x-tenant-host') || headersList.get('host') || 'localhost:3000';
  const tenantContext = await resolveTenantByHost(host);

  if (!tenantContext) return { title: 'Nossa Proposta' };

  const origin = getTenantPublicOrigin(tenantContext);

  return {
    title: `Nossa Proposta | ${tenantContext.tenant.name} — Cozinha de verdade`,
    description:
      'Comida de verdade. Para a vida de verdade. Conheça a essência da BENZA, nossas modalidades e os pratos preparados com cuidado para a sua rotina.',
    alternates: {
      canonical: `${origin}/sobre`,
    },
  };
}

const PILLAR_ICONS = [Flame, PackageCheck, Snowflake, FileText];

export default async function AboutPage() {
  const headersList = await headers();
  const host = headersList.get('x-tenant-host') || headersList.get('host') || 'localhost:3000';
  const tenantContext = await resolveTenantByHost(host);

  if (!tenantContext) {
    notFound();
  }

  const { tenant, settings } = tenantContext;
  const origin = getTenantPublicOrigin(tenantContext);

  const [products, savedSections] = await Promise.all([
    getTenantProducts(tenant.id),
    getTenantPageSections(tenant.id, 'sobre'),
  ]);

  const prioritizedProducts = prioritizeSignatureDishes(products);

  const defaultHeroImg =
    prioritizedProducts.find((p) => p.cover_image_url)?.cover_image_url ||
    (tenant.slug === 'benza' ? '/assets/brands/benza/mockup-hero-editorial.jpg' : null);

  const defaultEssenceImg =
    prioritizedProducts.filter((p) => p.cover_image_url)[1]?.cover_image_url ||
    prioritizedProducts.find((p) => p.cover_image_url)?.cover_image_url ||
    (tenant.slug === 'benza' ? '/assets/brands/benza/products/mockup-feijoada.jpg' : null);

  const contactAction = buildOfficialContactHref(settings.contact_whatsapp);

  const activeSections = (
    savedSections.length > 0
      ? savedSections
      : DEFAULT_SOBRE_SECTIONS.map((s, idx) => ({ id: `default-${idx}`, ...s }))
  ).filter((s) => s.is_active !== false);

  const breadcrumbJsonLd = generateBreadcrumbJsonLd([
    { name: 'Início', url: origin },
    { name: 'Nossa Proposta', url: `${origin}/sobre` },
  ]);

  interface SobreSectionContent {
    badge?: string;
    eyebrow?: string;
    title?: string;
    subtitle?: string;
    description?: string;
    location_note?: string;
    primary_cta_label?: string;
    secondary_cta_label?: string;
    cta_label?: string;
    image_url?: string;
    image_hidden?: boolean;
    frozen_title?: string;
    frozen_description?: string;
    ready_title?: string;
    ready_description?: string;
    items?: Array<{ title: string; description: string }>;
  }

  const renderSection = (section: {
    id: string;
    section_type: string;
    content: Record<string, unknown>;
  }) => {
    const c = (section.content || {}) as SobreSectionContent;

    switch (section.section_type) {
      case 'SobreHero': {
        const heroImg = c.image_hidden ? null : c.image_url || defaultHeroImg;
        return (
          <section
            key={section.id}
            className="relative min-h-[78vh] sm:min-h-[84vh] flex items-center bg-tenant-accent text-white overflow-hidden"
          >
            {heroImg && (
              <Image
                src={heroImg}
                alt={`${tenant.name} — Cozinha de verdade`}
                fill
                priority
                sizes="100vw"
                className="object-cover object-center scale-[1.02]"
              />
            )}

            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/55 to-black/45" />
            <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/35 to-transparent" />

            <Container size="lg" className="relative z-10 py-20 sm:py-28">
              <div className="max-w-2xl space-y-6">
                {c.badge && (
                  <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/10 backdrop-blur-xs border border-white/20 text-xs font-semibold tracking-wider uppercase text-amber-200">
                    <span>{c.badge}</span>
                  </div>
                )}

                <h1 className="font-heading text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-[1.08] tracking-tight text-white">
                  {c.title || 'Comida de verdade. Para a vida de verdade.'}
                </h1>

                {c.subtitle && (
                  <p className="text-base sm:text-xl text-stone-200 leading-relaxed max-w-xl">
                    {c.subtitle}
                  </p>
                )}

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3.5 pt-2">
                  <Link
                    href="/produtos"
                    className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-tenant bg-tenant-button hover:bg-tenant-buttonHover text-white text-sm font-bold tracking-wide transition-all shadow-lg active:scale-[0.98]"
                  >
                    <span>{c.primary_cta_label || 'Conhecer o cardápio'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </Link>

                  <a
                    href="#nossa-essencia"
                    className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-tenant bg-white/10 hover:bg-white/20 backdrop-blur-xs border border-white/25 text-white text-sm font-semibold transition-all"
                  >
                    <span>{c.secondary_cta_label || 'Nossa essência'}</span>
                  </a>
                </div>
              </div>
            </Container>

            <a
              href="#nossa-essencia"
              aria-label="Rolar para Nossa Essência"
              className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-1 text-white/75 hover:text-white transition-colors"
            >
              <span className="text-[10px] uppercase tracking-[0.2em] font-semibold">
                Explorar
              </span>
              <ChevronDown className="w-4 h-4 animate-bounce" />
            </a>
          </section>
        );
      }

      case 'SobreEssencia': {
        const essenceImg = c.image_hidden ? null : c.image_url || defaultEssenceImg;
        return (
          <section key={section.id} id="nossa-essencia" className="py-16 sm:py-24 scroll-mt-24">
            <Container size="lg">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-center">
                <SobreReveal className={essenceImg ? 'lg:col-span-6 space-y-6' : 'lg:col-span-12 max-w-3xl space-y-6'}>
                  <div className="space-y-2">
                    {c.eyebrow && (
                      <span className="text-xs uppercase font-bold tracking-widest text-tenant-secondary block">
                        {c.eyebrow}
                      </span>
                    )}
                    <h2 className="font-heading text-3xl sm:text-4xl font-extrabold text-tenant-text leading-tight">
                      {c.title || 'O sabor de casa, no seu tempo.'}
                    </h2>
                  </div>

                  {c.description && (
                    <p className="text-base sm:text-lg text-tenant-muted leading-relaxed">
                      {c.description}
                    </p>
                  )}

                  {c.location_note && (
                    <div className="pt-2 flex items-center gap-2.5 text-xs sm:text-sm text-tenant-text/80 font-medium">
                      <MapPin className="w-4 h-4 text-tenant-primary shrink-0" />
                      <span>{c.location_note}</span>
                    </div>
                  )}
                </SobreReveal>

                {essenceImg && (
                  <SobreReveal delayMs={120} className="lg:col-span-6">
                    <div className="relative aspect-[4/3] rounded-2xl overflow-hidden bg-tenant-surface border border-tenant-border/70 shadow-lg">
                      <Image
                        src={essenceImg}
                        alt={`Bastidores e preparo na cozinha ${tenant.name}`}
                        fill
                        loading="lazy"
                        sizes="(max-width: 1024px) 100vw, 50vw"
                        className="object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent" />
                    </div>
                  </SobreReveal>
                )}
              </div>
            </Container>
          </section>
        );
      }

      case 'SobreModalidades':
        return (
          <section key={section.id} className="py-16 sm:py-24 bg-tenant-surface border-y border-tenant-border/50">
            <Container size="lg" className="space-y-10">
              <SobreReveal className="max-w-2xl space-y-3">
                {c.eyebrow && (
                  <span className="text-xs uppercase font-bold tracking-widest text-tenant-secondary block">
                    {c.eyebrow}
                  </span>
                )}
                <h2 className="font-heading text-3xl sm:text-4xl font-extrabold text-tenant-text">
                  {c.title || 'Duas formas de receber a BENZA à mesa'}
                </h2>
                {c.subtitle && (
                  <p className="text-sm sm:text-base text-tenant-muted leading-relaxed">
                    {c.subtitle}
                  </p>
                )}
              </SobreReveal>

              <SobreReveal delayMs={80}>
                <SobreModalitySwitcher
                  frozenTitle={c.frozen_title}
                  frozenDescription={c.frozen_description}
                  readyTitle={c.ready_title}
                  readyDescription={c.ready_description}
                />
              </SobreReveal>
            </Container>
          </section>
        );

      case 'SobreSabores':
        return (
          <section key={section.id} className="py-16 sm:py-24">
            <Container size="lg" className="space-y-10">
              <SobreReveal className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                <div className="space-y-2 max-w-2xl">
                  {c.eyebrow && (
                    <span className="text-xs uppercase font-bold tracking-widest text-tenant-secondary block">
                      {c.eyebrow}
                    </span>
                  )}
                  <h2 className="font-heading text-3xl sm:text-4xl font-extrabold text-tenant-text">
                    {c.title || 'Pratos do nosso cardápio'}
                  </h2>
                </div>

                <Link
                  href="/produtos"
                  className="inline-flex items-center gap-2 text-sm font-bold text-tenant-primary hover:underline shrink-0"
                >
                  <span>{c.cta_label || 'Ver cardápio completo'}</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </SobreReveal>

              <SobreReveal delayMs={80}>
                <SobreFlavorsGallery products={prioritizedProducts} />
              </SobreReveal>
            </Container>
          </section>
        );

      case 'SobrePilares': {
        const items: Array<{ title: string; description: string }> = Array.isArray(c.items)
          ? c.items
          : [];
        return (
          <section key={section.id} className="py-16 sm:py-24 bg-tenant-surface border-y border-tenant-border/50">
            <Container size="lg" className="space-y-10">
              <SobreReveal className="max-w-2xl space-y-2">
                {c.eyebrow && (
                  <span className="text-xs uppercase font-bold tracking-widest text-tenant-secondary block">
                    {c.eyebrow}
                  </span>
                )}
                <h2 className="font-heading text-3xl sm:text-4xl font-extrabold text-tenant-text">
                  {c.title || 'Transparência e atenção aos detalhes'}
                </h2>
              </SobreReveal>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {items.map((pillar, idx) => {
                  const Icon = PILLAR_ICONS[idx % PILLAR_ICONS.length];
                  return (
                    <SobreReveal key={`${pillar.title}-${idx}`} delayMs={idx * 60}>
                      <div className="h-full p-6 rounded-2xl bg-tenant-background border border-tenant-border/70 space-y-4 hover:border-tenant-primary/40 hover:shadow-sm transition-all duration-300">
                        <div className="w-11 h-11 rounded-xl bg-tenant-primary/10 text-tenant-primary flex items-center justify-center">
                          <Icon className="w-5 h-5" />
                        </div>
                        <h3 className="font-heading text-lg font-bold text-tenant-text">
                          {pillar.title}
                        </h3>
                        <p className="text-xs sm:text-sm text-tenant-muted leading-relaxed">
                          {pillar.description}
                        </p>
                      </div>
                    </SobreReveal>
                  );
                })}
              </div>
            </Container>
          </section>
        );
      }

      case 'SobreCTA':
        return (
          <section key={section.id} className="py-16 sm:py-24">
            <Container size="lg">
              <SobreReveal>
                <div className="rounded-3xl bg-tenant-accent text-white p-8 sm:p-14 lg:p-16 relative overflow-hidden">
                  <div className="relative z-10 max-w-2xl space-y-5">
                    <span className="text-xs uppercase font-bold tracking-widest text-amber-300 block">
                      {tenant.name}
                    </span>
                    <h2 className="font-heading text-3xl sm:text-4xl font-extrabold leading-tight text-white">
                      {c.title || 'Seu próximo momento à mesa merece sabor de verdade.'}
                    </h2>
                    {c.description && (
                      <p className="text-base sm:text-lg text-stone-200 leading-relaxed">
                        {c.description}
                      </p>
                    )}

                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3.5 pt-2">
                      <Link
                        href="/produtos"
                        className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-tenant bg-tenant-button hover:bg-tenant-buttonHover text-white text-sm font-bold tracking-wide transition-all shadow-md"
                      >
                        <span>{c.primary_cta_label || 'Explorar cardápio'}</span>
                        <ArrowRight className="w-4 h-4" />
                      </Link>

                      {contactAction.external ? (
                        <a
                          href={contactAction.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-tenant bg-white/10 hover:bg-white/20 border border-white/25 text-white text-sm font-semibold transition-all"
                        >
                          <MessageCircle className="w-4 h-4" />
                          <span>{c.secondary_cta_label || `Falar com a ${tenant.name}`}</span>
                        </a>
                      ) : (
                        <Link
                          href={contactAction.href}
                          className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-tenant bg-white/10 hover:bg-white/20 border border-white/25 text-white text-sm font-semibold transition-all"
                        >
                          <MessageCircle className="w-4 h-4" />
                          <span>{c.secondary_cta_label || `Falar com a ${tenant.name}`}</span>
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              </SobreReveal>
            </Container>
          </section>
        );

      default:
        return null;
    }
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <div className="bg-tenant-background text-tenant-text overflow-x-clip">
        {activeSections.map((sec) => renderSection(sec))}
      </div>
    </>
  );
}
