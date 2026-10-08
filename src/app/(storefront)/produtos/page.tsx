import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { resolveTenantByHost } from '@/lib/tenancy/context';
import { getTenantProducts } from '@/modules/catalog/service';
import { Container } from '@/components/ui/Container';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { generateBreadcrumbJsonLd } from '@/lib/seo/schema';

export async function generateMetadata(): Promise<Metadata> {
  const headersList = await headers();
  const host = headersList.get('x-tenant-host') || headersList.get('host') || 'localhost:3000';
  const tenantContext = await resolveTenantByHost(host);

  if (!tenantContext) return { title: 'Cardápio' };

  return {
    title: `Cardápio de Pratos | ${tenantContext.tenant.name}`,
    description: `Conheça nossos pratos preparados e porcionados por ${tenantContext.tenant.name}.`,
    alternates: {
      canonical: `https://${host}/produtos`,
    },
  };
}

export default async function ProductsPage() {
  const headersList = await headers();
  const host = headersList.get('x-tenant-host') || headersList.get('host') || 'localhost:3000';
  const tenantContext = await resolveTenantByHost(host);

  if (!tenantContext) {
    notFound();
  }

  const { tenant } = tenantContext;
  const products = await getTenantProducts(tenant.id);

  const breadcrumbJsonLd = generateBreadcrumbJsonLd([
    { name: 'Início', url: `https://${host}` },
    { name: 'Cardápio', url: `https://${host}/produtos` },
  ]);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <div className="py-12 sm:py-20 bg-tenant-background transition-colors min-h-[70vh]">
        <Container size="lg">
          {/* Header */}
          <div className="max-w-2xl space-y-4 mb-12 sm:mb-16">
            <span className="text-xs uppercase font-bold tracking-widest text-tenant-secondary block">
              Nosso Cardápio
            </span>
            <h1 className="font-heading text-3xl sm:text-4xl lg:text-5xl font-extrabold text-tenant-text">
              Cardápio de Pratos
            </h1>
            <p className="text-base sm:text-lg text-tenant-muted leading-relaxed">
              Receitas clássicas preparadas para o seu dia a dia, com conservação sob congelamento e aquecimento descomplicado.
            </p>
          </div>

          {/* Grid de Produtos */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {products.map((product) => (
              <Card key={product.id} hoverEffect className="flex flex-col h-full bg-tenant-surface overflow-hidden group">
                {/* Visual Header */}
                <div className="aspect-[16/10] bg-tenant-background relative flex items-center justify-center overflow-hidden border-b border-tenant-border/40">
                  {product.cover_image_url ? (
                    <>
                      <Image
                        src={product.cover_image_url}
                        alt={product.name}
                        fill
                        className="object-cover group-hover:scale-105 transition-transform duration-500"
                        sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-40" />
                      <div className="absolute top-3 left-3 z-10">
                        <Badge variant="secondary" className="text-[10px] bg-white/90 backdrop-blur-xs text-stone-900 border-none font-semibold">
                          {product.category?.name || 'Prato Principal'}
                        </Badge>
                      </div>
                    </>
                  ) : (
                    <div className="text-center space-y-1 p-6">
                      <span className="text-xs uppercase tracking-widest text-tenant-muted font-semibold block">
                        {product.category?.name || 'Prato Principal'}
                      </span>
                      <p className="font-heading text-xl font-bold text-tenant-text">
                        {product.name}
                      </p>
                    </div>
                  )}
                </div>

                {/* Conteúdo */}
                <div className="p-6 flex flex-col flex-1 justify-between space-y-5">
                  <div className="space-y-3">
                    <h2 className="font-heading text-xl font-bold text-tenant-text">
                      {product.name}
                    </h2>
                    {product.short_description && (
                      <p className="text-sm text-tenant-muted leading-relaxed">
                        {product.short_description}
                      </p>
                    )}
                  </div>

                  {/* Variações */}
                  {product.variants && product.variants.length > 0 && (
                    <div className="space-y-2 pt-2 border-t border-tenant-border/40">
                      <span className="text-[11px] uppercase tracking-wider text-tenant-muted font-semibold block">
                        Porções disponíveis
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {product.variants.map((v) => (
                          <Badge key={v.id} variant="neutral" className="text-xs">
                            {v.name}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Ação */}
                  <div className="pt-2">
                    <Link
                      href={`/produtos/${product.slug}`}
                      className="w-full inline-flex items-center justify-center gap-2 py-3 px-4 rounded-tenant bg-tenant-surface border border-tenant-border text-tenant-text text-sm font-semibold hover:border-tenant-primary hover:text-tenant-primary transition-all group"
                    >
                      <span>Ver Ficha Completa</span>
                      <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </Link>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </Container>
      </div>
    </>
  );
}
