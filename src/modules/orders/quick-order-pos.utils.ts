import type { TenantRole } from '@/types/database.types';

export interface ParsedBrlAmount {
  valid: boolean;
  cents: number;
  error?: string;
}

/**
 * Converte uma entrada monetária em Reais (ex: "36,90", "1.234,56", "15", "15.50")
 * para centavos inteiros de forma determinística, sem erros de ponto flutuante ou `parseFloat` permissivo.
 */
export function parseBrlInputToCents(raw: string | null | undefined): ParsedBrlAmount {
  if (!raw) {
    return { valid: true, cents: 0 };
  }

  const trimmed = raw.replace(/R\$/gi, '').trim();
  if (!trimmed) {
    return { valid: true, cents: 0 };
  }

  if (trimmed.startsWith('-')) {
    return { valid: false, cents: 0, error: 'O valor não pode ser negativo.' };
  }

  let normalized = trimmed;

  // Formato brasileiro com separador de milhar e vírgula decimal: ex "1.234,56" ou "36,90"
  if (trimmed.includes(',')) {
    const withoutThousandDots = trimmed.replace(/\./g, '');
    if (!/^\d+(,\d{1,2})?$/.test(withoutThousandDots)) {
      return {
        valid: false,
        cents: 0,
        error: 'Formato monetário inválido. Use o padrão 0,00 (ex: 12,50).',
      };
    }
    normalized = withoutThousandDots.replace(',', '.');
  } else {
    // Sem vírgula: aceita inteiro ("35") ou ponto decimal com até 2 casas ("35.5" / "35.50")
    if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
      return {
        valid: false,
        cents: 0,
        error: 'Formato monetário inválido. Use no máximo 2 casas decimais.',
      };
    }
  }

  const [intPartStr, decPartStr = ''] = normalized.split('.');
  const intPart = Number.parseInt(intPartStr, 10);
  const decPadded = (decPartStr + '00').slice(0, 2);
  const decPart = Number.parseInt(decPadded, 10);

  if (!Number.isFinite(intPart) || !Number.isFinite(decPart)) {
    return { valid: false, cents: 0, error: 'Valor monetário inválido.' };
  }

  const cents = intPart * 100 + decPart;
  return { valid: true, cents };
}

/**
 * Limita a quantidade de um item na sacola do PDV entre 1 e 99 unidades.
 */
export function clampCartItemQuantity(quantity: number): number {
  if (!Number.isFinite(quantity)) return 1;
  return Math.max(1, Math.min(99, Math.floor(quantity)));
}

/**
 * Valida regras de desconto no PDV em duas camadas (alinhada ao servidor):
 * - Nunca maior que subtotal + frete
 * - Acima de 20% do subtotal exige perfil `tenant_admin`
 */
export function validateQuickOrderDiscount(
  subtotalCents: number,
  deliveryFeeCents: number,
  discountCents: number,
  operatorRole: TenantRole
): { valid: boolean; maxAllowedCents: number; error?: string } {
  const maxTotalCents = Math.max(0, subtotalCents + deliveryFeeCents);
  const maxManagerCents = Math.round(subtotalCents * 0.2);
  const maxAllowedCents =
    operatorRole === 'tenant_admin' ? maxTotalCents : Math.min(maxTotalCents, maxManagerCents);

  if (discountCents < 0) {
    return { valid: false, maxAllowedCents, error: 'O desconto não pode ser negativo.' };
  }

  if (discountCents > maxTotalCents) {
    return {
      valid: false,
      maxAllowedCents,
      error: 'O desconto não pode ser maior que o valor total do pedido.',
    };
  }

  if (operatorRole !== 'tenant_admin' && discountCents > maxManagerCents) {
    return {
      valid: false,
      maxAllowedCents,
      error: 'Descontos acima de 20% do subtotal exigem perfil de Administrador (tenant_admin).',
    };
  }

  return { valid: true, maxAllowedCents };
}

/**
 * Gera chave única para item na sacola do PDV considerando a variante e os complementos selecionados,
 * permitindo diferenciar a mesma porção quando tiver adicionais distintos.
 */
export function buildPosCartItemKey(
  variantId: string,
  selectedModifierOptionIds: string[] = []
): string {
  const sortedMods = [...selectedModifierOptionIds].sort().join(',');
  return sortedMods ? `${variantId}::${sortedMods}` : variantId;
}

