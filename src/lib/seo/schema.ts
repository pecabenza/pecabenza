import type { Tenant, TenantSettings, TenantBranding, Product, SchemaBusinessType } from '@/types/database.types';

export interface BusinessJsonLdOptions {
  branding?: TenantBranding;
  baseUrl: string;
}

/**
 * Gera o JSON-LD estruturado de negócio para Schema.org de forma dinâmica e precisa.
 * Suporta Organization, LocalBusiness, FoodEstablishment, Restaurant, Store e extensões.
 * Não inventa campos inexistentes e não força 'Restaurant' sem decisão explícita do tenant.
 */
export function generateBusinessJsonLd(
  tenant: Tenant,
  settings: TenantSettings,
  baseUrl: string,
  branding?: TenantBranding
) {
  // Determina o tipo mais específico:
  // 1. Tipo explícito configurado pelo tenant
  // 2. Fallback seguro: se tem endereço físico -> LocalBusiness; senão -> Organization
  const resolvedType: SchemaBusinessType =
    settings.business_type || (settings.address_summary ? 'LocalBusiness' : 'Organization');

  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': resolvedType,
    name: tenant.name,
    url: baseUrl,
  };

  // Imagem / Logotipo (apenas se existir)
  if (branding?.logo_url) {
    schema.logo = branding.logo_url;
    schema.image = branding.logo_url;
  }

  // Contatos (apenas se existirem)
  if (settings.contact_phone) {
    schema.telephone = settings.contact_phone;
  }
  if (settings.contact_email) {
    schema.email = settings.contact_email;
  }

  // Endereço físico (apenas se informado)
  if (settings.address_summary) {
    schema.address = {
      '@type': 'PostalAddress',
      streetAddress: settings.address_summary,
      addressCountry: 'BR',
    };
  }

  // Faixa de preço (apenas se informada)
  if (settings.price_range) {
    schema.priceRange = settings.price_range;
  }

  // Culinária (apenas se configurada explicitamente e para tipos alimentares)
  if (
    (resolvedType === 'Restaurant' || resolvedType === 'FoodEstablishment') &&
    settings.serves_cuisine
  ) {
    schema.servesCuisine = settings.serves_cuisine;
  }

  // Redes sociais / Perfil institucional
  const sameAs: string[] = [];
  if (settings.instagram_handle) {
    const handle = settings.instagram_handle.replace(/^@/, '');
    sameAs.push(`https://instagram.com/${handle}`);
  }
  if (sameAs.length > 0) {
    schema.sameAs = sameAs;
  }

  return schema;
}

/**
 * Wrapper de compatibilidade regressiva.
 * Delega para generateBusinessJsonLd respeitando as configurações reais do tenant.
 */
export function generateRestaurantJsonLd(
  tenant: Tenant,
  settings: TenantSettings,
  baseUrl: string,
  branding?: TenantBranding
) {
  return generateBusinessJsonLd(tenant, settings, baseUrl, branding);
}

export function generateProductJsonLd(product: Product, tenant: Tenant, baseUrl: string) {
  const minPrice = product.variants?.length
    ? Math.min(...product.variants.map((v) => v.price_in_cents)) / 100
    : 0;

  const productSchema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.short_description || product.full_description || product.name,
    offers: {
      '@type': 'Offer',
      priceCurrency: 'BRL',
      price: minPrice.toFixed(2),
      availability: 'https://schema.org/PreOrder',
      url: `${baseUrl}/produtos/${product.slug}`,
      seller: {
        '@type': 'Organization',
        name: tenant.name,
      },
    },
  };

  return productSchema;
}

export function generateBreadcrumbJsonLd(items: { name: string; url: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}
