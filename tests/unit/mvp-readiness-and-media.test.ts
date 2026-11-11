import { describe, it, expect, vi } from 'vitest';
import {
  sanitizeProductImageUrl,
  parseStorageReference,
  resolveOrCreateCoverMediaId,
  resolveMediaAssetUrl,
} from '../../src/modules/catalog/media-helper';
import {
  parseStructuredBusinessHours,
  calculateDynamicDeliveryFee,
  evaluateStoreAvailability,
  evaluateCommercialReadiness,
} from '../../src/modules/commerce/store-config.engine';

describe('Fase B — B1: Mídia de Produtos via cover_media_id e media_assets', () => {
  it('sanitizeProductImageUrl deve aceitar URLs https/http e paths locais autorizados e rejeitar XSS', () => {
    expect(sanitizeProductImageUrl('https://cdn.exemplo.com/prato.jpg')).toBe(
      'https://cdn.exemplo.com/prato.jpg'
    );
    expect(sanitizeProductImageUrl('/assets/products/feijoada.jpg')).toBe(
      '/assets/products/feijoada.jpg'
    );
    expect(sanitizeProductImageUrl('/uploads/products-foto.png')).toBe(
      '/uploads/products-foto.png'
    );

    expect(sanitizeProductImageUrl('javascript:alert(1)')).toBeNull();
    expect(sanitizeProductImageUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
    expect(sanitizeProductImageUrl('')).toBeNull();
    expect(sanitizeProductImageUrl('/admin/hack.png')).toBeNull();
  });

  it('parseStorageReference deve extrair bucket e storage_path do Supabase Storage público', () => {
    const url =
      'https://zmirilugwaffgnnxhxkr.supabase.co/storage/v1/object/public/tenant-assets/00000000-0000-0000-0000-000000000001/products/feijoada.jpg';
    const parsed = parseStorageReference(url);

    expect(parsed.bucket).toBe('tenant-assets');
    expect(parsed.storagePath).toBe(
      '00000000-0000-0000-0000-000000000001/products/feijoada.jpg'
    );
    expect(parsed.filename).toBe('feijoada.jpg');
  });

  it('resolveOrCreateCoverMediaId deve reutilizar registro existente no tenant ou criar novo em media_assets', async () => {
    const insertPayloads: any[] = [];
    const mockClient: any = {
      from: vi.fn(() => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
        }),
        insert: (payload: any) => {
          insertPayloads.push(payload);
          return {
            select: () => ({
              single: async () => ({
                data: { id: 'media-uuid-123' },
                error: null,
              }),
            }),
          };
        },
      })),
    };

    const mediaId = await resolveOrCreateCoverMediaId(
      mockClient,
      'tenant-benza-1',
      'https://zmirilugwaffgnnxhxkr.supabase.co/storage/v1/object/public/tenant-assets/tenant-benza-1/products/bolinho.webp'
    );

    expect(mediaId).toBe('media-uuid-123');
    expect(insertPayloads).toHaveLength(1);
    expect(insertPayloads[0]).toMatchObject({
      tenant_id: 'tenant-benza-1',
      bucket: 'tenant-assets',
      storage_path: 'tenant-benza-1/products/bolinho.webp',
      mime_type: 'image/webp',
      is_private: false,
    });
  });

  it('resolveMediaAssetUrl deve montar URL pública para storage_path relativo e preservar URLs absolutas', () => {
    const mockClient: any = {
      storage: {
        from: vi.fn((bucket: string) => ({
          getPublicUrl: (path: string) => ({
            data: { publicUrl: `https://mock.supabase.co/storage/v1/object/public/${bucket}/${path}` },
          }),
        })),
      },
    };

    expect(
      resolveMediaAssetUrl(mockClient, {
        bucket: 'tenant-assets',
        storage_path: 't1/products/foto.jpg',
      })
    ).toBe('https://mock.supabase.co/storage/v1/object/public/tenant-assets/t1/products/foto.jpg');

    expect(
      resolveMediaAssetUrl(mockClient, {
        bucket: 'external-reference',
        storage_path: '/assets/products/feijoada.jpg',
      })
    ).toBe('/assets/products/feijoada.jpg');
  });
});

describe('Fase B — B3/B4: Frete Dinâmico, Pausa e Horários Comerciais', () => {
  it('calculateDynamicDeliveryFee deve aplicar taxa configurada, isentar pickup e aplicar frete grátis por mínimo', () => {
    const settings = {
      fixed_delivery_fee_cents: 1500,
      free_delivery_threshold_cents: 15000,
    };

    expect(calculateDynamicDeliveryFee(4800, 'pickup', settings)).toBe(0);
    expect(calculateDynamicDeliveryFee(4800, 'delivery', settings)).toBe(1500);
    expect(calculateDynamicDeliveryFee(15000, 'delivery', settings)).toBe(0);
    expect(calculateDynamicDeliveryFee(22000, 'delivery', settings)).toBe(0);
  });

  it('evaluateStoreAvailability deve bloquear loja pausada mesmo com agendamento ativo', () => {
    const hours = parseStructuredBusinessHours({
      is_store_open: false,
      pause_reason: 'Fornada esgotada hoje',
      enforce_schedule: false,
      enabled_payment_methods: ['cash'],
    });

    const asapResult = evaluateStoreAvailability(hours, { scheduled_enabled: true }, 'asap');
    const scheduledResult = evaluateStoreAvailability(hours, { scheduled_enabled: true }, 'scheduled');

    expect(asapResult.open).toBe(false);
    expect(asapResult.allowsScheduled).toBe(false);
    expect(asapResult.reason).toBe('Fornada esgotada hoje');
    expect(scheduledResult.open).toBe(false);
  });

  it('evaluateStoreAvailability deve validar horário semanal quando enforce_schedule = true', () => {
    const hours = parseStructuredBusinessHours({
      is_store_open: true,
      enforce_schedule: true,
      timezone: 'America/Sao_Paulo',
      weekly_hours: {
        sun: { open: '10:00', close: '20:00', closed: true },
        mon: { open: '10:00', close: '20:00', closed: false },
        tue: { open: '10:00', close: '20:00', closed: false },
        wed: { open: '10:00', close: '20:00', closed: false },
        thu: { open: '10:00', close: '22:00', closed: false },
        fri: { open: '10:00', close: '22:00', closed: false },
        sat: { open: '10:00', close: '22:00', closed: false },
      },
      enabled_payment_methods: ['pix', 'cash'],
    });

    // Segunda-feira 14:30 BRT = 17:30 UTC
    const openMonday = new Date('2026-11-09T17:30:00.000Z');
    // Segunda-feira 23:00 BRT = 2026-11-10T02:00:00.000Z
    const lateMonday = new Date('2026-11-10T02:00:00.000Z');
    // Domingo 12:00 BRT = 2026-11-08T15:00:00.000Z
    const closedSunday = new Date('2026-11-08T15:00:00.000Z');

    expect(evaluateStoreAvailability(hours, { scheduled_enabled: true }, 'asap', openMonday).open).toBe(true);
    expect(evaluateStoreAvailability(hours, { scheduled_enabled: true }, 'asap', lateMonday).open).toBe(false);
    expect(evaluateStoreAvailability(hours, { scheduled_enabled: true }, 'asap', closedSunday).open).toBe(false);
    // Pedido agendado continua permitido se scheduled_enabled = true
    expect(evaluateStoreAvailability(hours, { scheduled_enabled: true }, 'scheduled', lateMonday).open).toBe(true);
  });
});

describe('Fase B — B5: Verificação de Prontidão Comercial antes de site_mode = commerce', () => {
  const validCommerceSettings = {
    delivery_enabled: true,
    pickup_enabled: true,
    fixed_delivery_fee_cents: 1200,
    min_order_value_cents: 3000,
  };

  it('deve BLOQUEAR ativação de commerce se houver exposição anônima de pedidos (RLS)', () => {
    const res = evaluateCommercialReadiness({
      rlsAnonOrdersBlocked: false,
      activeProductsWithAvailableVariants: 5,
      commerceSettings: validCommerceSettings,
      enabledPaymentMethods: ['cash'],
      pixGatewayConfigured: false,
      trackedVariantsCount: 0,
      trackedVariantsWithAvailableStock: 0,
    });

    expect(res.canActivate).toBe(false);
    expect(res.blockers.some((b) => b.includes('Políticas públicas'))).toBe(true);
  });

  it('deve BLOQUEAR ativação se apenas Pix estiver habilitado sem gateway Asaas configurado', () => {
    const res = evaluateCommercialReadiness({
      rlsAnonOrdersBlocked: true,
      activeProductsWithAvailableVariants: 5,
      commerceSettings: validCommerceSettings,
      enabledPaymentMethods: ['pix'],
      pixGatewayConfigured: false,
      trackedVariantsCount: 0,
      trackedVariantsWithAvailableStock: 0,
    });

    expect(res.canActivate).toBe(false);
    expect(res.blockers.some((b) => b.includes('Asaas'))).toBe(true);
  });

  it('deve APROVAR ativação com Dinheiro/Cartão na entrega mesmo sem Asaas configurado', () => {
    const res = evaluateCommercialReadiness({
      rlsAnonOrdersBlocked: true,
      activeProductsWithAvailableVariants: 5,
      commerceSettings: validCommerceSettings,
      enabledPaymentMethods: ['cash', 'card_on_delivery'],
      pixGatewayConfigured: false,
      trackedVariantsCount: 2,
      trackedVariantsWithAvailableStock: 2,
    });

    expect(res.canActivate).toBe(true);
    expect(res.blockers).toHaveLength(0);
  });

  it('deve BLOQUEAR ativação se todas as variantes com controle estrito de estoque estiverem zeradas', () => {
    const res = evaluateCommercialReadiness({
      rlsAnonOrdersBlocked: true,
      activeProductsWithAvailableVariants: 5,
      commerceSettings: validCommerceSettings,
      enabledPaymentMethods: ['cash'],
      pixGatewayConfigured: false,
      trackedVariantsCount: 3,
      trackedVariantsWithAvailableStock: 0,
    });

    expect(res.canActivate).toBe(false);
    expect(res.blockers.some((b) => b.includes('zeradas'))).toBe(true);
  });
});

