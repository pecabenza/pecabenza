import type { Product, ProductCategory } from '@/types/database.types';

export interface CatalogSection {
  category: ProductCategory;
  items: Product[];
}

/**
 * Normaliza texto para busca tolerante a acentos, maiúsculas/minúsculas e espaços extras.
 */
export function normalizeCatalogSearch(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Filtra produtos por busca textual (nome, descrição curta e categoria)
 * e agrupa pelas categorias ordenadas por display_order.
 */
export function buildCatalogSections(
  products: Product[],
  categories: ProductCategory[],
  searchQuery: string
): CatalogSection[] {
  const normalizedQuery = normalizeCatalogSearch(searchQuery);

  const filteredProducts = normalizedQuery
    ? products.filter((p) => {
        const haystack = normalizeCatalogSearch(
          `${p.name} ${p.short_description || ''} ${p.category?.name || ''}`
        );
        return haystack.includes(normalizedQuery);
      })
    : products;

  const sortedCategories = [...categories].sort(
    (a, b) => (a.display_order ?? 0) - (b.display_order ?? 0)
  );

  const categoryMap = new Map<string, CatalogSection>();
  for (const cat of sortedCategories) {
    categoryMap.set(cat.id, { category: cat, items: [] });
  }

  const uncategorized: Product[] = [];

  for (const product of filteredProducts) {
    if (product.category_id && categoryMap.has(product.category_id)) {
      categoryMap.get(product.category_id)!.items.push(product);
    } else if (product.category && !categoryMap.has(product.category.id)) {
      categoryMap.set(product.category.id, {
        category: product.category,
        items: [product],
      });
    } else {
      uncategorized.push(product);
    }
  }

  const sections = Array.from(categoryMap.values()).filter((s) => s.items.length > 0);
  if (uncategorized.length > 0) {
    sections.push({
      category: {
        id: 'uncategorized',
        tenant_id: '',
        name: 'Outros Pratos',
        slug: 'outros',
        display_order: 9999,
        is_active: true,
        created_at: '',
      },
      items: uncategorized,
    });
  }

  return sections;
}

