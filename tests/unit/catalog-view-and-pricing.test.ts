import { describe, it, expect } from 'vitest';
import {
  normalizeCatalogSearch,
  buildCatalogSections,
} from '@/modules/catalog/catalog-filter';
import { getProductDisplayPrice } from '@/modules/catalog/pricing';
import type { Product, ProductCategory } from '@/types/database.types';

const CATEGORIES: ProductCategory[] = [
  {
    id: 'cat-2',
    tenant_id: 't1',
    name: 'Acompanhamentos',
    slug: 'acompanhamentos',
    display_order: 2,
    is_active: true,
    created_at: '',
  },
  {
    id: 'cat-1',
    tenant_id: 't1',
    name: 'Pratos Principais',
    slug: 'pratos-principais',
    display_order: 1,
    is_active: true,
    created_at: '',
  },
];

const PRODUCTS: Product[] = [
  {
    id: 'p1',
    tenant_id: 't1',
    category_id: 'cat-1',
    name: 'Feijoada Clássica',
    slug: 'feijoada-classica',
    short_description: 'Feijão preto cozido lentamente com carnes selecionadas.',
    full_description: null,
    cover_media_id: null,
    cover_image_url: null,
    status: 'active',
    is_featured: true,
    created_at: '',
    updated_at: '',
    category: CATEGORIES[1],
    variants: [
      {
        id: 'v1',
        tenant_id: 't1',
        product_id: 'p1',
        name: '500 ml',
        sku: null,
        unit_type: 'ml',
        unit_value: 500,
        price_in_cents: 4200,
        compare_at_price_cents: 4800,
        is_available: true,
        display_order: 1,
        created_at: '',
      },
      {
        id: 'v2',
        tenant_id: 't1',
        product_id: 'p1',
        name: '1000 ml',
        sku: null,
        unit_type: 'ml',
        unit_value: 1000,
        price_in_cents: 7900,
        compare_at_price_cents: null,
        is_available: true,
        display_order: 2,
        created_at: '',
      },
    ],
  },
  {
    id: 'p2',
    tenant_id: 't1',
    category_id: 'cat-2',
    name: 'Farofa Crocante',
    slug: 'farofa-crocante',
    short_description: 'Farinha torrada com bacon e cebolinha.',
    full_description: null,
    cover_media_id: null,
    cover_image_url: null,
    status: 'active',
    is_featured: false,
    created_at: '',
    updated_at: '',
    category: CATEGORIES[0],
    variants: [
      {
        id: 'v3',
        tenant_id: 't1',
        product_id: 'p2',
        name: '200 g',
        sku: null,
        unit_type: 'g',
        unit_value: 200,
        price_in_cents: 1500,
        is_available: false,
        display_order: 1,
        created_at: '',
      },
    ],
  },
  {
    id: 'p3',
    tenant_id: 't1',
    category_id: null,
    name: 'Caldo de Mandioca',
    slug: 'caldo-de-mandioca',
    short_description: 'Cremoso e reconfortante.',
    full_description: null,
    cover_media_id: null,
    cover_image_url: null,
    status: 'active',
    is_featured: false,
    created_at: '',
    updated_at: '',
    variants: [],
  },
];

describe('Catalog Filter, Search & Pricing', () => {
  it('normaliza acentos, maiúsculas e espaços extras', () => {
    expect(normalizeCatalogSearch('  Feijão   CLÁSSICO  ')).toBe('feijao classico');
  });

  it('ordena seções por display_order e coloca sem categoria em "Outros Pratos"', () => {
    const sections = buildCatalogSections(PRODUCTS, CATEGORIES, '');
    expect(sections.map((s) => s.category.name)).toEqual([
      'Pratos Principais',
      'Acompanhamentos',
      'Outros Pratos',
    ]);
  });

  it('busca por nome com acentuação ignorada e por descrição curta', () => {
    const byAccent = buildCatalogSections(PRODUCTS, CATEGORIES, 'classica');
    expect(byAccent).toHaveLength(1);
    expect(byAccent[0].items[0].id).toBe('p1');

    const byDesc = buildCatalogSections(PRODUCTS, CATEGORIES, 'bacon');
    expect(byDesc).toHaveLength(1);
    expect(byDesc[0].items[0].id).toBe('p2');
  });

  it('retorna lista vazia quando catálogo está vazio ou busca não encontra itens', () => {
    expect(buildCatalogSections([], CATEGORIES, '')).toEqual([]);
    expect(buildCatalogSections(PRODUCTS, CATEGORIES, 'sushi')).toEqual([]);
  });

  it('calcula preço promocional da menor variante disponível e sinaliza indisponibilidade', () => {
    const feijoadaPrice = getProductDisplayPrice(PRODUCTS[0].variants);
    expect(feijoadaPrice).toEqual({
      priceInCents: 4200,
      compareAtPriceCents: 4800,
      hasPromo: true,
      discountPercentage: 13,
      hasMultipleVariants: true,
      hasAvailableVariant: true,
    });

    const farofaPrice = getProductDisplayPrice(PRODUCTS[1].variants);
    expect(farofaPrice?.hasAvailableVariant).toBe(false);
    expect(farofaPrice?.hasMultipleVariants).toBe(false);
    expect(getProductDisplayPrice(PRODUCTS[2].variants)).toBeNull();
  });
});

