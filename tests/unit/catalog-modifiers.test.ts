import { describe, it, expect } from 'vitest';
import {
  validateAndResolveModifiers,
  buildCartItemKey,
} from '@/modules/catalog/modifiers';
import type { ProductModifierGroup } from '@/types/database.types';

const SAMPLE_GROUPS: ProductModifierGroup[] = [
  {
    id: 'grp-1',
    tenant_id: 't-1',
    product_id: 'p-1',
    name: 'Acompanhamento',
    is_required: true,
    min_selections: 1,
    max_selections: 1,
    display_order: 1,
    created_at: '',
    options: [
      {
        id: 'opt-1',
        tenant_id: 't-1',
        group_id: 'grp-1',
        name: 'Arroz branco',
        price_in_cents: 0,
        is_available: true,
        display_order: 1,
        created_at: '',
      },
      {
        id: 'opt-2',
        tenant_id: 't-1',
        group_id: 'grp-1',
        name: 'Arroz com alho',
        price_in_cents: 400,
        is_available: true,
        display_order: 2,
        created_at: '',
      },
    ],
  },
  {
    id: 'grp-2',
    tenant_id: 't-1',
    product_id: 'p-1',
    name: 'Adicionais',
    is_required: false,
    min_selections: 0,
    max_selections: 2,
    display_order: 2,
    created_at: '',
    options: [
      {
        id: 'opt-3',
        tenant_id: 't-1',
        group_id: 'grp-2',
        name: 'Farofa crocante',
        price_in_cents: 650,
        is_available: true,
        display_order: 1,
        created_at: '',
      },
      {
        id: 'opt-4',
        tenant_id: 't-1',
        group_id: 'grp-2',
        name: 'Couve refogada',
        price_in_cents: 500,
        is_available: true,
        display_order: 2,
        created_at: '',
      },
      {
        id: 'opt-5',
        tenant_id: 't-1',
        group_id: 'grp-2',
        name: 'Torresmo',
        price_in_cents: 900,
        is_available: true,
        display_order: 3,
        created_at: '',
      },
    ],
  },
];

describe('Catalog Modifiers & Cart Key', () => {
  it('rejeita quando grupo obrigatório não tem seleção', () => {
    const res = validateAndResolveModifiers(SAMPLE_GROUPS, ['opt-3']);
    expect(res.valid).toBe(false);
    expect(res.error).toContain('Acompanhamento');
  });

  it('rejeita quando excede o máximo de seleções do grupo', () => {
    const res = validateAndResolveModifiers(SAMPLE_GROUPS, [
      'opt-1',
      'opt-3',
      'opt-4',
      'opt-5',
    ]);
    expect(res.valid).toBe(false);
    expect(res.error).toContain('Adicionais');
  });

  it('valida seleção correta e soma o valor dos complementos em centavos', () => {
    const res = validateAndResolveModifiers(SAMPLE_GROUPS, ['opt-2', 'opt-3', 'opt-4']);
    expect(res.valid).toBe(true);
    expect(res.extraPriceCents).toBe(1550);
    expect(res.selectedSnapshots).toHaveLength(3);
  });

  it('gera chaves distintas no carrinho para mesma porção com complementos diferentes', () => {
    const k1 = buildCartItemKey('var-1', [
      { groupId: 'g1', groupName: 'A', optionId: 'o1', optionName: 'X', priceInCents: 0 },
      { groupId: 'g2', groupName: 'B', optionId: 'o2', optionName: 'Y', priceInCents: 500 },
    ]);
    const k2 = buildCartItemKey('var-1', [
      { groupId: 'g2', groupName: 'B', optionId: 'o2', optionName: 'Y', priceInCents: 500 },
      { groupId: 'g1', groupName: 'A', optionId: 'o1', optionName: 'X', priceInCents: 0 },
    ]);
    const k3 = buildCartItemKey('var-1', []);

    expect(k1).toBe(k2);
    expect(k1).not.toBe(k3);
    expect(k3).toBe('var-1');
  });
});

