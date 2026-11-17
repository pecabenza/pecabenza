/**
 * Helpers compartilhados para cálculo e exibição de preço promocional ("De / Por")
 * em variações de produtos.
 */

export interface VariantPriceLike {
  price_in_cents: number;
  compare_at_price_cents?: number | null;
  is_available?: boolean;
}

export interface ProductDisplayPriceSummary {
  priceInCents: number;
  compareAtPriceCents: number | null;
  hasPromo: boolean;
  discountPercentage: number | null;
  hasMultipleVariants: boolean;
  hasAvailableVariant: boolean;
}

/**
 * Indica se a variação possui preço promocional ativo ("De" maior que "Por").
 */
export function hasPromotionalPrice(variant: VariantPriceLike): boolean {
  return (
    typeof variant.compare_at_price_cents === 'number' &&
    variant.compare_at_price_cents > variant.price_in_cents
  );
}

/**
 * Calcula o percentual inteiro de desconto (ex: 20 para 20% OFF).
 */
export function getDiscountPercentage(variant: VariantPriceLike): number | null {
  if (!hasPromotionalPrice(variant) || !variant.compare_at_price_cents) {
    return null;
  }
  const pct = Math.round(
    ((variant.compare_at_price_cents - variant.price_in_cents) / variant.compare_at_price_cents) * 100
  );
  return pct > 0 ? pct : null;
}

/**
 * Normaliza compare_at_price_cents para persistência: apenas mantém se for estritamente maior que price_in_cents.
 */
export function normalizeCompareAtPriceCents(
  priceInCents: number,
  compareAtPriceCents?: number | null
): number | null {
  if (typeof compareAtPriceCents !== 'number' || !Number.isFinite(compareAtPriceCents)) {
    return null;
  }
  const rounded = Math.round(compareAtPriceCents);
  return rounded > priceInCents ? rounded : null;
}

/**
 * Resume o menor preço de exibição de um produto para cards de cardápio/vitrine.
 */
export function getProductDisplayPrice(
  variants?: VariantPriceLike[] | null
): ProductDisplayPriceSummary | null {
  if (!variants || variants.length === 0) {
    return null;
  }

  const available = variants.filter((v) => v.is_available !== false);
  const pool = available.length > 0 ? available : variants;

  const lowestVariant = pool.reduce((best, current) =>
    current.price_in_cents < best.price_in_cents ? current : best
  );

  const hasPromo = hasPromotionalPrice(lowestVariant);

  return {
    priceInCents: lowestVariant.price_in_cents,
    compareAtPriceCents: hasPromo ? (lowestVariant.compare_at_price_cents ?? null) : null,
    hasPromo,
    discountPercentage: getDiscountPercentage(lowestVariant),
    hasMultipleVariants: pool.length > 1,
    hasAvailableVariant: available.length > 0,
  };
}

