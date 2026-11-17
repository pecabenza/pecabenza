import crypto from 'crypto';

const SHORT_TOKEN_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

/**
 * Gera um código público curto e legível (10 caracteres alfanuméricos sem caracteres ambíguos)
 * para links de acompanhamento em `/pedido/[publicToken]`.
 */
export function generateShortTrackingToken(length = 10): string {
  const bytes = crypto.randomBytes(length);
  let token = '';
  for (let i = 0; i < length; i++) {
    token += SHORT_TOKEN_ALPHABET[bytes[i] % SHORT_TOKEN_ALPHABET.length];
  }
  return token;
}

export async function generateUniqueShortTrackingToken(
  supabase: { from: (table: string) => unknown },
  length = 10
): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const candidate = generateShortTrackingToken(length);
    try {
      const ordersTable = supabase.from('orders') as {
        select?: (cols: string) => {
          eq?: (col: string, val: string) => {
            maybeSingle?: () => PromiseLike<{ data?: { id?: string } | null }>;
          };
        };
      } | null;
      if (typeof ordersTable?.select !== 'function') {
        return candidate;
      }
      const query = ordersTable.select('id');
      if (typeof query?.eq !== 'function') {
        return candidate;
      }
      const eqQuery = query.eq('public_tracking_token', candidate);
      if (typeof eqQuery?.maybeSingle !== 'function') {
        return candidate;
      }
      const { data: existing } = await eqQuery.maybeSingle();
      if (!existing) {
        return candidate;
      }
    } catch {
      return candidate;
    }
  }
  return generateShortTrackingToken(length + 2);
}

/**
 * Normaliza tokens legados longos (48 chars hex) para a versão curta de 10 caracteres nos links,
 * mantendo tokens curtos atuais intactos.
 */
export function toShortTrackingToken(token?: string | null): string {
  if (!token) return '';
  const clean = token.trim();
  return clean.length > 12 ? clean.slice(0, 10) : clean;
}

/**
 * Valida tokens curtos novos (8+ caracteres) e tokens hexadecimais legados (48 caracteres).
 */
export function isValidPublicTrackingToken(token: unknown): token is string {
  return typeof token === 'string' && /^[a-zA-Z0-9_-]{8,64}$/.test(token);
}

