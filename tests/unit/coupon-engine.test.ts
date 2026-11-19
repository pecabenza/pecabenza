import { describe, it, expect } from 'vitest';
import {
  normalizeCouponCode,
  evaluateCouponApplication,
  type CouponCampaign,
} from '@/modules/commerce/coupon.engine';

describe('Motor de Cupons & Campanhas Promocionais', () => {
  const sampleCampaigns: CouponCampaign[] = [
    {
      id: 'c1',
      code: 'BENZA10',
      name: '10% de Boas-Vindas',
      discountType: 'percentage',
      discountValue: 10,
      minOrderCents: 5000,
      maxDiscountCents: 1500,
      maxUses: 100,
      usedCount: 2,
      isActive: true,
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'c2',
      code: 'FIXO20',
      name: 'R$ 20 OFF',
      discountType: 'fixed',
      discountValue: 2000,
      usedCount: 0,
      isActive: true,
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'c3',
      code: 'PAUSADO',
      name: 'Cupom Pausado',
      discountType: 'percentage',
      discountValue: 15,
      usedCount: 0,
      isActive: false,
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'c4',
      code: 'EXPIRADO',
      name: 'Cupom Vencido',
      discountType: 'fixed',
      discountValue: 1000,
      usedCount: 0,
      expiresAt: '2025-01-01T00:00:00.000Z',
      isActive: true,
      createdAt: '2024-01-01T00:00:00.000Z',
    },
  ];

  it('deve normalizar códigos ignorando espaços e caixa', () => {
    expect(normalizeCouponCode(' benza 10 ')).toBe('BENZA10');
  });

  it('deve calcular desconto percentual respeitando teto e pedido mínimo', () => {
    const belowMin = evaluateCouponApplication(sampleCampaigns, 'benza10', 4000);
    expect(belowMin.valid).toBe(false);

    const validWithinCap = evaluateCouponApplication(sampleCampaigns, 'benza10', 10000);
    expect(validWithinCap.valid).toBe(true);
    expect(validWithinCap.discountCents).toBe(1000);

    const validCapped = evaluateCouponApplication(sampleCampaigns, 'BENZA10', 25000);
    expect(validCapped.valid).toBe(true);
    expect(validCapped.discountCents).toBe(1500);
  });

  it('deve limitar desconto fixo ao subtotal dos produtos', () => {
    const res = evaluateCouponApplication(sampleCampaigns, 'FIXO20', 1500);
    expect(res.valid).toBe(true);
    expect(res.discountCents).toBe(1500);
  });

  it('deve rejeitar cupons pausados, expirados ou inexistentes', () => {
    expect(evaluateCouponApplication(sampleCampaigns, 'PAUSADO', 10000).valid).toBe(false);
    expect(evaluateCouponApplication(sampleCampaigns, 'EXPIRADO', 10000).valid).toBe(false);
    expect(evaluateCouponApplication(sampleCampaigns, 'NAOEXISTE', 10000).valid).toBe(false);
  });
});

