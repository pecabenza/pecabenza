export interface CurrencyParseResult {
  valid: boolean;
  cents: number | null;
  error?: string;
}

/**
 * Converte string monetária em reais (ex: "12,50" ou "12.50") para centavos inteiros.
 * Rejeita entradas inválidas em vez de converter silenciosamente para zero.
 */
export function parseStrictCurrencyCents(
  raw: string,
  options: { fieldLabel: string; allowEmpty?: boolean; minCents?: number } = { fieldLabel: 'Valor' }
): CurrencyParseResult {
  const trimmed = raw.trim();
  if (!trimmed) {
    if (options.allowEmpty) {
      return { valid: true, cents: null };
    }
    return { valid: false, cents: null, error: `${options.fieldLabel}: informe um valor válido.` };
  }

  const normalized = trimmed.replace(/\s+/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
    return {
      valid: false,
      cents: null,
      error: `${options.fieldLabel}: formato inválido ("${raw}"). Use números positivos com até 2 casas decimais.`,
    };
  }

  const num = Number(normalized);
  if (!Number.isFinite(num) || num < 0) {
    return { valid: false, cents: null, error: `${options.fieldLabel}: valor não pode ser negativo.` };
  }

  const cents = Math.round(num * 100);
  if (options.minCents !== undefined && cents < options.minCents) {
    return {
      valid: false,
      cents: null,
      error: `${options.fieldLabel}: valor abaixo do mínimo permitido.`,
    };
  }

  return { valid: true, cents };
}

