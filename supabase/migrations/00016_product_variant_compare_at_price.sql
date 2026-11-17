-- ==============================================================================
-- MIGRATION 00016: Preço Promocional ("De / Por") em Product Variants
-- Descrição: Adiciona compare_at_price_cents em product_variants para exibir
--            preço original ("De") riscado quando houver preço promocional
--            ("Por", armazenado em price_in_cents).
-- ==============================================================================

ALTER TABLE public.product_variants
  ADD COLUMN IF NOT EXISTS compare_at_price_cents integer
  CHECK (compare_at_price_cents IS NULL OR compare_at_price_cents >= 0);

COMMENT ON COLUMN public.product_variants.compare_at_price_cents IS
  'Preço original ("De") em centavos. Quando maior que price_in_cents ("Por"), indica oferta promocional no cardápio.';

