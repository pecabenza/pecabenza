import type {
  ProductModifierGroup,
  SelectedModifierSnapshot,
} from '@/types/database.types';

export interface ModifierValidationResult {
  valid: boolean;
  error?: string;
  selectedSnapshots: SelectedModifierSnapshot[];
  extraPriceCents: number;
}

/**
 * Valida a seleção de complementos de um produto contra as regras de cada grupo
 * (obrigatório, mínimo e máximo) e retorna os snapshots e soma em centavos.
 */
export function validateAndResolveModifiers(
  groups: ProductModifierGroup[] | undefined,
  selectedOptionIds: string[]
): ModifierValidationResult {
  const safeGroups = groups || [];
  const selectedSet = new Set(selectedOptionIds);
  const snapshots: SelectedModifierSnapshot[] = [];
  let extraPriceCents = 0;

  for (const group of safeGroups) {
    const availableOptions = (group.options || []).filter((o) => o.is_available !== false);
    const chosenInGroup = availableOptions.filter((o) => selectedSet.has(o.id));
    const effectiveMin = group.is_required ? Math.max(1, group.min_selections || 0) : (group.min_selections || 0);
    const effectiveMax = Math.max(1, group.max_selections || 1);

    if (chosenInGroup.length < effectiveMin) {
      return {
        valid: false,
        error: `Selecione pelo menos ${effectiveMin} opção(ões) em "${group.name}".`,
        selectedSnapshots: [],
        extraPriceCents: 0,
      };
    }

    if (chosenInGroup.length > effectiveMax) {
      return {
        valid: false,
        error: `Selecione no máximo ${effectiveMax} opção(ões) em "${group.name}".`,
        selectedSnapshots: [],
        extraPriceCents: 0,
      };
    }

    for (const option of chosenInGroup) {
      const priceInCents = Math.max(0, Number(option.price_in_cents) || 0);
      snapshots.push({
        groupId: group.id,
        groupName: group.name,
        optionId: option.id,
        optionName: option.name,
        priceInCents,
      });
      extraPriceCents += priceInCents;
    }
  }

  return {
    valid: true,
    selectedSnapshots: snapshots,
    extraPriceCents,
  };
}

/**
 * Gera chave única para diferenciar itens no carrinho pela variação + complementos.
 */
export function buildCartItemKey(
  variantId: string,
  selectedModifiers?: SelectedModifierSnapshot[]
): string {
  if (!selectedModifiers || selectedModifiers.length === 0) {
    return variantId;
  }
  const sortedIds = [...selectedModifiers]
    .map((m) => m.optionId)
    .sort()
    .join(',');
  return `${variantId}::${sortedIds}`;
}

