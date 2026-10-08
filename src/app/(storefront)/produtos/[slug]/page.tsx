import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { ArrowLeft, Clock, Snowflake, ShieldCheck, Flame, Info } from 'lucide-react';
import { resolveTenantByHost } from '@/lib/tenancy/context';
import { getTenantProductBySlug } from '@/modules/catalog/service';
import { Container } from '@/components/ui/Container';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { generateProductJsonLd, generateBreadcrumbJsonLd } from '@/lib/seo/schema';

interface ProductDetailPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: ProductDetailPageProps): Promise<Metadata> {
  const { slug } = await params;
  const headersList = await headers();
  const host = headersList.get('x-tenant-host') || headersList.get('host') || 'localhost:3000';
  const tenantContext = await resolveTenantByHost(host);

  if (!tenantContext) return { title: 'Produto' };

  const product = await getTenantProductBySlug(tenantContext.tenant.id, slug);
  if (!product) return { title: 'Produto não encontrado' };

  return {
    title: `${product.name} | ${tenantContext.tenant.name}`,
    description: product.short_description || product.name,
    alternates: {
      canonical: `https://${host}/produtos/${slug}`,
    },
    openGraph: {
      title: product.name,
      description: product.short_description || product.name,
      type: 'website',
      url: `https://${host}/produtos/${slug}`,
    },
  };
}

export default async function ProductDetailPage({ params }: ProductDetailPageProps) {
  const { slug } = await params;
  const headersList = await headers();
  const host = headersList.get('x-tenant-host') || headersList.get('host') || 'localhost:3000';
  const tenantContext = await resolveTenantByHost(host);

  if (!tenantContext) {
    notFound();
  }

  const { tenant, settings } = tenantContext;
  const product = await getTenantProductBySlug(tenant.id, slug);

  if (!product) {
    notFound();
  }

  const productJsonLd = generateProductJsonLd(product, tenant, `https://${host}`);
  const breadcrumbJsonLd = generateBreadcrumbJsonLd([
    { name: 'Início', url: `https://${host}` },
    { name: 'Cardápio', url: `https://${host}/produtos` },
    { name: product.name, url: `https://${host}/produtos/${product.slug}` },
  ]);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />

      <div className="py-10 sm:py-16 bg-tenant-background transition-colors">
        <Container size="lg">
          {/* Breadcrumb e Voltar */}
          <div className="mb-8">
            <Link
              href="/produtos"
              className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-tenant-muted hover:text-tenant-primary transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Voltar ao Cardápio</span>
            </Link>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-16">
            {/* Coluna da Imagem */}
            <div className="lg:col-span-6 space-y-4">
              <div className="aspect-square rounded-2xl bg-tenant-surface border border-tenant-border/60 shadow-lg relative overflow-hidden flex items-center justify-center group">
                {product.cover_image_url ? (
                  <>
                    <Image
                      src={product.cover_image_url}
                      alt={product.name}
                      fill
                      priority
                      className="object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
                      sizes="(max-width: 1024px) 100vw, 50vw"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent pointer-events-none" />
                  </>
                ) : (
                  <div className="text-center space-y-2 p-8">
                    <span className="text-xs uppercase tracking-widest text-tenant-secondary font-bold block">
                      {product.category?.name || 'Prato Principal'}
                    </span>
                    <span className="font-heading text-2xl sm:text-3xl font-bold text-tenant-text block">
                      {product.name}
                    </span>
                    <p className="text-xs text-tenant-muted pt-2">
                      Fotografia oficial do prato em preparação
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Informações Comerciais e Descrição */}
            <div className="lg:col-span-6 space-y-6">
              <div className="space-y-2">
                <Badge variant="secondary" className="text-xs">
                  {product.category?.name || 'Prato Principal'}
                </Badge>
                <h1 className="font-heading text-3xl sm:text-4xl font-extrabold text-tenant-text leading-tight">
                  {product.name}
                </h1>
                {product.short_description && (
                  <p className="text-base sm:text-lg text-tenant-muted leading-relaxed">
                    {product.short_description}
                  </p>
                )}
              </div>

              {/* Variações e Tamanhos */}
              {product.variants && product.variants.length > 0 && (
                <div className="space-y-3 pt-4 border-t border-tenant-border/40">
                  <span className="text-xs uppercase font-bold tracking-wider text-tenant-text block">
                    Tamanhos e Porções Disponíveis
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {product.variants.map((v) => (
                      <Card key={v.id} className="p-4 bg-tenant-surface border-tenant-border">
                        <div className="flex items-center justify-between">
                          <span className="font-heading font-bold text-tenant-text text-sm">
                            {v.name}
                          </span>
                          <Badge variant="neutral" className="text-[10px]">
                            {v.unit_value} {v.unit_type}
                          </Badge>
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {/* Modo Pré-Lançamento (CTA Neutro) */}
              <div className="p-5 rounded-tenant bg-tenant-surface border border-tenant-border/80 space-y-3">
                <div className="flex items-center gap-2 text-tenant-primary text-xs font-semibold uppercase tracking-wider">
                  <Clock className="w-4 h-4" />
                  <span>Modo Pré-Lançamento</span>
                </div>
                <p className="text-xs text-tenant-muted leading-relaxed">
                  Os pedidos serão abertos em breve com lotes semanais programados. Acompanhe as novidades pelo nosso contato.
                </p>
                <div className="pt-1">
                  <Link
                    href="/contato"
                    className="w-full inline-flex items-center justify-center py-3 px-4 rounded-tenant bg-tenant-primary text-white text-sm font-semibold hover:brightness-110 transition-all shadow-sm"
                  >
                    <span>{settings.prelaunch_cta_text || 'Em breve'}</span>
                  </Link>
                </div>
              </div>

              {/* Descrição Completa */}
              {product.full_description && (
                <div className="space-y-2 pt-4 border-t border-tenant-border/40">
                  <span className="text-xs uppercase font-bold tracking-wider text-tenant-text block">
                    Sobre a Receita
                  </span>
                  <p className="text-sm text-tenant-muted leading-relaxed whitespace-pre-line">
                    {product.full_description}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Ficha Técnica Detalhada */}
          {product.information && (
            <div className="mt-16 pt-12 border-t border-tenant-border/50 space-y-8">
              <div className="space-y-1">
                <span className="text-xs uppercase font-bold tracking-widest text-tenant-secondary block">
                  Informações Técnicas & Nutricionais
                </span>
                <h2 className="font-heading text-2xl font-bold text-tenant-text">
                  Ficha do Prato
                </h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {/* Ingredientes */}
                {product.information.ingredients && (
                  <Card className="p-6 bg-tenant-surface space-y-3">
                    <div className="flex items-center gap-2 text-tenant-primary">
                      <Flame className="w-4 h-4" />
                      <h3 className="font-heading font-bold text-sm uppercase tracking-wide">
                        Ingredientes
                      </h3>
                    </div>
                    <p className="text-xs text-tenant-muted leading-relaxed">
                      {product.information.ingredients}
                    </p>
                  </Card>
                )}

                {/* Alergênicos */}
                {product.information.allergens && (
                  <Card className="p-6 bg-tenant-surface space-y-3">
                    <div className="flex items-center gap-2 text-tenant-secondary">
                      <Info className="w-4 h-4" />
                      <h3 className="font-heading font-bold text-sm uppercase tracking-wide">
                        Alergênicos
                      </h3>
                    </div>
                    <p className="text-xs text-tenant-muted leading-relaxed">
                      {product.information.allergens}
                    </p>
                  </Card>
                )}

                {/* Conservação */}
                {product.information.conservation_instructions && (
                  <Card className="p-6 bg-tenant-surface space-y-3">
                    <div className="flex items-center gap-2 text-tenant-primary">
                      <Snowflake className="w-4 h-4" />
                      <h3 className="font-heading font-bold text-sm uppercase tracking-wide">
                        Conservação
                      </h3>
                    </div>
                    <p className="text-xs text-tenant-muted leading-relaxed">
                      {product.information.conservation_instructions}
                    </p>
                  </Card>
                )}

                {/* Modo de Preparo */}
                {product.information.preparation_instructions && (
                  <Card className="p-6 bg-tenant-surface space-y-3">
                    <div className="flex items-center gap-2 text-tenant-accent">
                      <ShieldCheck className="w-4 h-4" />
                      <h3 className="font-heading font-bold text-sm uppercase tracking-wide">
                        Modo de Preparo
                      </h3>
                    </div>
                    <p className="text-xs text-tenant-muted leading-relaxed">
                      {product.information.preparation_instructions}
                    </p>
                  </Card>
                )}
              </div>

              {/* Tabela Nutricional se disponível */}
              {product.information.nutritional_info && Object.keys(product.information.nutritional_info).length > 0 && (
                <div className="pt-4">
                  <Card className="p-6 bg-tenant-surface max-w-xl">
                    <h3 className="font-heading font-bold text-sm uppercase tracking-wide text-tenant-text mb-4">
                      Informação Nutricional
                    </h3>
                    <div className="divide-y divide-tenant-border/40 text-xs">
                      {Object.entries(product.information.nutritional_info).map(([key, val]) => (
                        <div key={key} className="py-2 flex items-center justify-between">
                          <span className="capitalize text-tenant-muted">{key}</span>
                          <span className="font-semibold text-tenant-text">{val}</span>
                        </div>
                      ))}
                    </div>
                  </Card>
                </div>
              )}
            </div>
          )}
        </Container>
      </div>
    </>
  );
}
