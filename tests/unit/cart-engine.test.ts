import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  formatBrl,
  getCartStorageKey,
  calculateCartItemsCount,
  calculateCartSubtotal,
  consolidateCartItem,
  updateCartItemQuantity,
} from '../../src/modules/cart/cart.utils';
import type { CartItem } from '../../src/modules/cart/cart.types';

describe('Motor de Carrinho e Catálogo Comercial (Etapa 2)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('Formatação de Moeda Brasileira (formatBrl)', () => {
    it('deve formatar centavos em Real brasileiro (BRL) corretamente', () => {
      const formatted48 = formatBrl(4800);
      expect(formatted48).toMatch(/R\$\s?48,00/);

      const formattedZero = formatBrl(0);
      expect(formattedZero).toMatch(/R\$\s?0,00/);

      const formatted1250 = formatBrl(125050);
      expect(formatted1250).toMatch(/R\$\s?1\.250,50/);
    });
  });

  describe('Cálculos Matemáticos de Subtotal e Quantidade', () => {
    it('deve calcular corretamente o subtotal de uma lista de itens com diferentes porções', () => {
      const items: CartItem[] = [
        {
          productId: 'prod-01',
          productName: 'Feijoada Artesanal',
          productSlug: 'feijoada-artesanal',
          variantId: 'var-500ml',
          variantName: '500 ml',
          unitPriceInCents: 3800, // R$ 38,00
          quantity: 2, // Subtotal: 7600
        },
        {
          productId: 'prod-01',
          productName: 'Feijoada Artesanal',
          productSlug: 'feijoada-artesanal',
          variantId: 'var-1kg',
          variantName: '1 kg',
          unitPriceInCents: 6800, // R$ 68,00
          quantity: 1, // Subtotal: 6800
        },
        {
          productId: 'prod-02',
          productName: 'Strogonoff Clássico',
          productSlug: 'strogonoff-classico',
          variantId: 'var-strog-700g',
          variantName: '700 g',
          unitPriceInCents: 4500, // R$ 45,00
          quantity: 3, // Subtotal: 13500
        },
      ];

      const totalItems = calculateCartItemsCount(items);
      const subtotalInCents = calculateCartSubtotal(items);

      expect(totalItems).toBe(6);
      expect(subtotalInCents).toBe(7600 + 6800 + 13500); // 27900 = R$ 279,00
      expect(formatBrl(subtotalInCents)).toMatch(/R\$\s?279,00/);
    });
  });

  describe('Lógica de Consolidação de Porções no Carrinho (consolidateCartItem)', () => {
    it('deve consolidar itens com o mesmo variantId somando as quantidades', () => {
      let cart: CartItem[] = [];

      cart = consolidateCartItem(cart, {
        productId: 'prod-01',
        productName: 'Feijoada',
        productSlug: 'feijoada',
        variantId: 'var-500ml',
        variantName: '500 ml',
        unitPriceInCents: 3500,
        quantity: 1,
      });

      expect(cart.length).toBe(1);
      expect(cart[0].quantity).toBe(1);

      // Adiciona o mesmo prato na mesma porção
      cart = consolidateCartItem(cart, {
        productId: 'prod-01',
        productName: 'Feijoada',
        productSlug: 'feijoada',
        variantId: 'var-500ml',
        variantName: '500 ml',
        unitPriceInCents: 3500,
        quantity: 2,
      });

      expect(cart.length).toBe(1);
      expect(cart[0].quantity).toBe(3);
      expect(cart[0].variantId).toBe('var-500ml');
    });

    it('deve manter itens separados quando forem porções/variantes diferentes do mesmo prato', () => {
      let cart: CartItem[] = [];

      // 500 ml
      cart = consolidateCartItem(cart, {
        productId: 'prod-01',
        productName: 'Feijoada',
        productSlug: 'feijoada',
        variantId: 'var-500ml',
        variantName: '500 ml',
        unitPriceInCents: 3500,
        quantity: 1,
      });

      // 1000 ml
      cart = consolidateCartItem(cart, {
        productId: 'prod-01',
        productName: 'Feijoada',
        productSlug: 'feijoada',
        variantId: 'var-1000ml',
        variantName: '1 kg',
        unitPriceInCents: 6500,
        quantity: 1,
      });

      expect(cart.length).toBe(2);
      expect(cart[0].variantId).toBe('var-500ml');
      expect(cart[1].variantId).toBe('var-1000ml');
    });

    it('deve remover o item se a quantidade for atualizada para zero ou negativa', () => {
      let cart: CartItem[] = [
        {
          productId: 'prod-01',
          productName: 'Feijoada',
          productSlug: 'feijoada',
          variantId: 'var-500ml',
          variantName: '500 ml',
          unitPriceInCents: 3500,
          quantity: 2,
        },
      ];

      cart = updateCartItemQuantity(cart, 'var-500ml', 1);
      expect(cart.length).toBe(1);
      expect(cart[0].quantity).toBe(1);

      cart = updateCartItemQuantity(cart, 'var-500ml', 0);
      expect(cart.length).toBe(0);
    });
  });

  describe('Isolamento Multi-Tenant do Armazenamento Local (getCartStorageKey)', () => {
    it('deve gerar chaves de storage isoladas por tenantId prevenindo colisão cross-tenant', () => {
      const benzaKey = getCartStorageKey('00000000-0000-0000-0000-000000000001');
      const cacauKey = getCartStorageKey('00000000-0000-0000-0000-000000000002');

      expect(benzaKey).not.toBe(cacauKey);
      expect(benzaKey).toBe('sysfood_cart_00000000-0000-0000-0000-000000000001');
      expect(cacauKey).toBe('sysfood_cart_00000000-0000-0000-0000-000000000002');

      const store: Record<string, string> = {};
      store[benzaKey] = JSON.stringify([{ productId: 'benza-p1', quantity: 2 }]);
      store[cacauKey] = JSON.stringify([{ productId: 'cacau-p1', quantity: 5 }]);

      // Validação de não contaminação
      expect(JSON.parse(store[benzaKey])[0].productId).toBe('benza-p1');
      expect(JSON.parse(store[cacauKey])[0].productId).toBe('cacau-p1');
    });
  });
});
