import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import {
  hasPromotionalPrice,
  getDiscountPercentage,
  normalizeCompareAtPriceCents,
  getProductDisplayPrice,
} from '../../src/modules/catalog/pricing';

const { mockGetAdminAuthSession, mockCreateAdminClient } = vi.hoisted(() => ({
  mockGetAdminAuthSession: vi.fn(),
  mockCreateAdminClient: vi.fn(),
}));

vi.mock('@/lib/tenancy/admin-auth', () => ({
  getAdminAuthSession: mockGetAdminAuthSession,
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: mockCreateAdminClient,
}));

vi.mock('@/modules/catalog/media-helper', () => ({
  resolveOrCreateCoverMediaId: vi.fn().mockResolvedValue(null),
  hydrateProductsWithCoverUrls: vi.fn().mockImplementation(async (_c, _t, list) => list),
}));

import { POST } from '../../src/app/api/admin/products/route';

describe('Preço Promocional ("De / Por") em Produtos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('hasPromotionalPrice e getDiscountPercentage validam corretamente oferta ativa', () => {
    expect(hasPromotionalPrice({ price_in_cents: 4000, compare_at_price_cents: 5000 })).toBe(true);
    expect(getDiscountPercentage({ price_in_cents: 4000, compare_at_price_cents: 5000 })).toBe(20);

    expect(hasPromotionalPrice({ price_in_cents: 5000, compare_at_price_cents: 5000 })).toBe(false);
    expect(getDiscountPercentage({ price_in_cents: 5000, compare_at_price_cents: 5000 })).toBeNull();

    expect(hasPromotionalPrice({ price_in_cents: 5000, compare_at_price_cents: 4000 })).toBe(false);
    expect(hasPromotionalPrice({ price_in_cents: 5000, compare_at_price_cents: null })).toBe(false);
  });

  it('normalizeCompareAtPriceCents descarta valor menor ou igual ao preço de venda', () => {
    expect(normalizeCompareAtPriceCents(4500, 6000)).toBe(6000);
    expect(normalizeCompareAtPriceCents(4500, 4500)).toBeNull();
    expect(normalizeCompareAtPriceCents(4500, 3000)).toBeNull();
    expect(normalizeCompareAtPriceCents(4500, null)).toBeNull();
    expect(normalizeCompareAtPriceCents(4500, undefined)).toBeNull();
  });

  it('getProductDisplayPrice seleciona a menor variação disponível e preserva De/Por', () => {
    const summary = getProductDisplayPrice([
      { price_in_cents: 8000, compare_at_price_cents: 9500, is_available: true },
      { price_in_cents: 4000, compare_at_price_cents: 5000, is_available: true },
      { price_in_cents: 3000, compare_at_price_cents: 4000, is_available: false },
    ]);

    expect(summary).toEqual({
      priceInCents: 4000,
      compareAtPriceCents: 5000,
      hasPromo: true,
      discountPercentage: 20,
      hasMultipleVariants: true,
      hasAvailableVariant: true,
    });
  });

  it('POST /api/admin/products persiste compare_at_price_cents válido e normaliza inválido para null', async () => {
    mockGetAdminAuthSession.mockResolvedValue({
      tenant: { id: 'tenant-1' },
      user: { id: 'user-1' },
    });

    const insertedVariants: Array<Record<string, unknown>> = [];

    const createBuilder = (table: string) => {
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        in: () => builder,
        maybeSingle: async () => ({ data: null, error: null }),
        single: async () => {
          if (table === 'products') {
            return {
              data: { id: 'prod-1', name: 'Feijoada', slug: 'feijoada', status: 'active' },
              error: null,
            };
          }
          if (table === 'product_categories') {
            return { data: { id: 'cat-1' }, error: null };
          }
          return { data: null, error: null };
        },
        insert: (payload: Record<string, unknown>) => {
          if (table === 'product_variants') {
            insertedVariants.push(payload);
            return Promise.resolve({ data: payload, error: null });
          }
          return builder;
        },
        update: () => builder,
        delete: () => builder,
        then: (resolve: (val: { data: unknown[]; error: null }) => void) =>
          resolve({ data: [], error: null }),
      };
      return builder;
    };

    mockCreateAdminClient.mockReturnValue({
      from: (table: string) => createBuilder(table),
    });

    const req = new NextRequest('http://localhost:3000/api/admin/products', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Feijoada BENZA',
        category_name: 'Pratos Principais',
        status: 'active',
        variants: [
          {
            name: '500 ml (Promo)',
            unit_type: 'ml',
            unit_value: 500,
            price_in_cents: 4200,
            compare_at_price_cents: 5200,
            is_available: true,
          },
          {
            name: '1000 ml (Inválido)',
            unit_type: 'ml',
            unit_value: 1000,
            price_in_cents: 8000,
            compare_at_price_cents: 7000,
            is_available: true,
          },
        ],
      }),
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(insertedVariants).toHaveLength(2);
    expect(insertedVariants[0].price_in_cents).toBe(4200);
    expect(insertedVariants[0].compare_at_price_cents).toBe(5200);
    expect(insertedVariants[1].price_in_cents).toBe(8000);
    expect(insertedVariants[1].compare_at_price_cents).toBeNull();
  });
});

