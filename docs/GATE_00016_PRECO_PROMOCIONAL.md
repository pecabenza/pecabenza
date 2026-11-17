# Gate Remoto — Migration 00016 (`compare_at_price_cents` / Preço Promocional "De / Por")

## Objetivo
Adicionar suporte a preço promocional visual ("De / Por") em `public.product_variants` preservando `price_in_cents` como **única fonte de autoridade financeira** do Commerce Engine, checkout, snapshot de `order_items` e relatórios.

---

## Alterações Implementadas
1. **Migration (`supabase/migrations/00016_product_variant_compare_at_price.sql`)**
   - Adiciona a coluna opcional `compare_at_price_cents integer NULL CHECK (compare_at_price_cents IS NULL OR compare_at_price_cents >= 0)` em `public.product_variants`.
2. **Regras de Domínio e Normalização (`src/modules/catalog/pricing.ts`)**
   - `hasPromotionalPrice`: só ativa exibição promocional quando `compare_at_price_cents > price_in_cents`.
   - `normalizeCompareAtPriceCents`: normaliza para `null` quando `compare_at_price_cents` é omitido, igual ou menor que `price_in_cents`.
   - `getDiscountPercentage`: cálculo exclusivamente informativo para UI (`% OFF`), nunca usado para cálculo financeiro de pedido.
   - `getProductDisplayPrice`: resumo do menor preço disponível para cards de cardápio e vitrine.
3. **API e Painel Admin**
   - `POST /api/admin/products` (`src/app/api/admin/products/route.ts`): valida e normaliza `compare_at_price_cents`.
   - `/admin/produtos` (`src/app/(tenant-admin)/admin/produtos/page.tsx`): campos **De (Opcional)** e **Por (Venda)** por porção, com preview ao vivo do desconto.
4. **Storefront**
   - `ProductCommerceAction` (`src/components/cart/ProductCommerceAction.tsx`), `/produtos` (`src/app/(storefront)/produtos/page.tsx`) e `ProductShowcaseSection` (`src/components/sections/ProductShowcaseSection.tsx`): exibem `De R$ ...` riscado, `Por R$ ...` e selo `-XX%` apenas quando há promoção válida. Produtos sem `compare_at_price_cents` mantêm exibição normal.

---

## Critérios Homologados em Staging (`tests/staging/migration-00016.test.ts`)
- Coluna `product_variants.compare_at_price_cents` existente no Supabase remoto, aceitando `NULL` e valores válidos.
- Checkout e `createOrderAtomic` utilizam exclusivamente `price_in_cents` (`2990`), nunca `compare_at_price_cents` (`3990`) nem percentual derivado.
- Snapshot em `order_items.unit_price_cents` e `order_items.subtotal_cents` preserva o valor efetivamente pago (`2990` / `5980`), permanecendo imutável após alterações posteriores no catálogo.
- Normalização garante ausência de falso desconto quando `De <= Por`.
- Isolamento multi-tenant (`TENANT_BENZA` vs `TENANT_CACAU`) e bloqueio de escrita anônima via RLS validados.

## Decisão Adiada (Fora do Escopo Atual)
- Promoção programada (`starts_at` / `ends_at`) mantida fora do escopo atual por decisão de produto; controle é manual via painel administrativo.

