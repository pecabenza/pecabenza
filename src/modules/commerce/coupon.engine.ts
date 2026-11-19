export type CouponDiscountType = 'percentage' | 'fixed';

export interface CouponCampaign {
  id: string;
  code: string;
  name: string;
  description?: string;
  discountType: CouponDiscountType;
  discountValue: number; // porcentagem inteira (1..100) ou valor fixo em centavos
  minOrderCents?: number;
  maxDiscountCents?: number;
  maxUses?: number | null;
  usedCount: number;
  startsAt?: string | null;
  expiresAt?: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface CouponEvaluationResult {
  valid: boolean;
  coupon?: CouponCampaign;
  discountCents: number;
  error?: string;
}

export function normalizeCouponCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, '');
}

export function parseCouponCampaigns(raw: unknown): CouponCampaign[] {
  if (!Array.isArray(raw)) return [];
  const result: CouponCampaign[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    const code = typeof obj.code === 'string' ? normalizeCouponCode(obj.code) : '';
    const name = typeof obj.name === 'string' ? obj.name.trim() : '';
    const discountType = obj.discountType === 'fixed' ? 'fixed' : 'percentage';
    const discountValue = Number(obj.discountValue || 0);
    if (!code || !name || !Number.isFinite(discountValue) || discountValue <= 0) continue;

    result.push({
      id: typeof obj.id === 'string' && obj.id ? obj.id : `cup_${code}`,
      code,
      name,
      description: typeof obj.description === 'string' ? obj.description : undefined,
      discountType,
      discountValue: Math.floor(discountValue),
      minOrderCents:
        typeof obj.minOrderCents === 'number' && obj.minOrderCents > 0
          ? Math.floor(obj.minOrderCents)
          : undefined,
      maxDiscountCents:
        typeof obj.maxDiscountCents === 'number' && obj.maxDiscountCents > 0
          ? Math.floor(obj.maxDiscountCents)
          : undefined,
      maxUses:
        typeof obj.maxUses === 'number' && obj.maxUses > 0 ? Math.floor(obj.maxUses) : null,
      usedCount: typeof obj.usedCount === 'number' && obj.usedCount >= 0 ? Math.floor(obj.usedCount) : 0,
      startsAt: typeof obj.startsAt === 'string' && obj.startsAt ? obj.startsAt : null,
      expiresAt: typeof obj.expiresAt === 'string' && obj.expiresAt ? obj.expiresAt : null,
      isActive: obj.isActive !== false,
      createdAt: typeof obj.createdAt === 'string' && obj.createdAt ? obj.createdAt : new Date().toISOString(),
    });
  }
  return result;
}

export function evaluateCouponApplication(
  campaigns: CouponCampaign[],
  rawCode: string,
  subtotalCents: number,
  now: Date = new Date()
): CouponEvaluationResult {
  const code = normalizeCouponCode(rawCode || '');
  if (!code) {
    return { valid: false, discountCents: 0, error: 'Informe um código de cupom.' };
  }

  const coupon = campaigns.find((c) => normalizeCouponCode(c.code) === code);
  if (!coupon) {
    return { valid: false, discountCents: 0, error: 'Cupom não encontrado.' };
  }

  if (!coupon.isActive) {
    return { valid: false, discountCents: 0, error: 'Este cupom está temporariamente desativado.' };
  }

  const nowMs = now.getTime();
  if (coupon.startsAt) {
    const startMs = new Date(coupon.startsAt).getTime();
    if (Number.isFinite(startMs) && nowMs < startMs) {
      return { valid: false, discountCents: 0, error: 'Esta campanha de cupom ainda não iniciou.' };
    }
  }

  if (coupon.expiresAt) {
    const expMs = new Date(coupon.expiresAt).getTime();
    if (Number.isFinite(expMs) && nowMs > expMs) {
      return { valid: false, discountCents: 0, error: 'Este cupom já expirou.' };
    }
  }

  if (coupon.maxUses && coupon.usedCount >= coupon.maxUses) {
    return {
      valid: false,
      discountCents: 0,
      error: 'Este cupom atingiu o limite máximo de utilizações.',
    };
  }

  if (coupon.minOrderCents && subtotalCents < coupon.minOrderCents) {
    const minReais = (coupon.minOrderCents / 100).toFixed(2).replace('.', ',');
    return {
      valid: false,
      discountCents: 0,
      error: `Este cupom exige pedido mínimo de R$ ${minReais} em produtos.`,
    };
  }

  let discountCents = 0;
  if (coupon.discountType === 'percentage') {
    const pct = Math.min(100, Math.max(1, coupon.discountValue));
    discountCents = Math.round((subtotalCents * pct) / 100);
    if (coupon.maxDiscountCents && discountCents > coupon.maxDiscountCents) {
      discountCents = coupon.maxDiscountCents;
    }
  } else {
    discountCents = coupon.discountValue;
  }

  discountCents = Math.max(0, Math.min(subtotalCents, discountCents));
  if (discountCents <= 0) {
    return { valid: false, discountCents: 0, error: 'Cupom não gera desconto para este pedido.' };
  }

  return {
    valid: true,
    coupon,
    discountCents,
  };
}

