import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockState = {
  resolvedTenant: null as any,
  resolveShouldThrow: false,
  ordersInDb: [] as Array<Record<string, any>>,
  fromCalls: 0,
  lastQueriedTenantId: null as string | null,
};

vi.mock('@/lib/tenancy/context', () => ({
  resolveTenantByHost: vi.fn(async () => {
    if (mockState.resolveShouldThrow) {
      throw new Error('DB connection error');
    }
    return mockState.resolvedTenant;
  }),
}));

vi.mock('@/lib/security/rate-limit', () => ({
  checkRateLimit: vi.fn(async () => ({ success: true, remaining: 59, resetAt: Date.now() + 60000 })),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      mockState.fromCalls += 1;
      if (table === 'orders') {
        return {
          select: () => ({
            eq: (_col1: string, tenantId: string) => {
              mockState.lastQueriedTenantId = tenantId;
              return {
                eq: (_col2: string, token: string) => ({
                  maybeSingle: async () => ({
                    data:
                      mockState.ordersInDb.find(
                        (o) => o.tenant_id === tenantId && o.public_tracking_token === token
                      ) || null,
                    error: null,
                  }),
                }),
                ilike: (_col2: string, pattern: string) => ({
                  limit: () => ({
                    maybeSingle: async () => {
                      const prefix = pattern.replace(/%$/, '');
                      return {
                        data:
                          mockState.ordersInDb.find(
                            (o) =>
                              o.tenant_id === tenantId &&
                              String(o.public_tracking_token || '').startsWith(prefix)
                          ) || null,
                        error: null,
                      };
                    },
                  }),
                }),
              };
            },
          }),
        };
      }
      if (table === 'order_items' || table === 'order_status_events') {
        return {
          select: () => ({
            eq: () => ({
              order: async () => ({ data: [], error: null }),
              then: (resolve: (v: any) => void) => resolve({ data: [], error: null }),
            }),
          }),
        };
      }
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
      };
    }),
  })),
}));

import { GET } from '@/app/api/orders/track/[token]/route';
import { getPublicOrderTracking } from '@/modules/orders/orders.service';

describe('P0 — Isolamento Multi-Tenant no Acompanhamento Público de Pedidos', () => {
  const TENANT_A = '00000000-0000-0000-0000-000000000001';
  const TENANT_B = '00000000-0000-0000-0000-000000000002';

  beforeEach(() => {
    vi.clearAllMocks();
    mockState.resolvedTenant = null;
    mockState.resolveShouldThrow = false;
    mockState.fromCalls = 0;
    mockState.lastQueriedTenantId = null;
    mockState.ordersInDb = [
      {
        id: 'ord-a-1',
        tenant_id: TENANT_A,
        order_number: '#000101',
        public_tracking_token: '7K9M2P4X8B',
        fulfillment_type: 'pickup',
        schedule_type: 'asap',
        scheduled_for: null,
        status: 'confirmed',
        payment_status: 'pending',
        subtotal_cents: 4800,
        delivery_fee_cents: 0,
        total_cents: 4800,
        notes: null,
        created_at: '2026-11-17T12:00:00.000Z',
        customer_name: 'Maria Oliveira',
        customer_phone: '75999887766',
      },
    ];
  });

  it('FAIL CLOSED: deve retornar 404 sem consultar o banco quando o host não resolver nenhum tenant', async () => {
    mockState.resolvedTenant = null;
    const req = new NextRequest('http://desconhecido.exemplo.com/api/orders/track/7K9M2P4X8B', {
      headers: { host: 'desconhecido.exemplo.com' },
    });

    const res = await GET(req, { params: Promise.resolve({ token: '7K9M2P4X8B' }) });
    expect(res.status).toBe(404);
    expect(mockState.fromCalls).toBe(0);
  });

  it('FAIL CLOSED: deve retornar 404 sem consultar o banco quando resolveTenantByHost lançar erro', async () => {
    mockState.resolveShouldThrow = true;
    const req = new NextRequest('http://erro.exemplo.com/api/orders/track/7K9M2P4X8B', {
      headers: { host: 'erro.exemplo.com' },
    });

    const res = await GET(req, { params: Promise.resolve({ token: '7K9M2P4X8B' }) });
    expect(res.status).toBe(404);
    expect(mockState.fromCalls).toBe(0);
  });

  it('deve rejeitar token em formato inválido com status 400', async () => {
    mockState.resolvedTenant = {
      tenant: { id: TENANT_A, slug: 'benza', name: 'BENZA' },
      settings: {},
    };
    const req = new NextRequest('http://benza.local/api/orders/track/abc', {
      headers: { host: 'benza.local' },
    });

    const res = await GET(req, { params: Promise.resolve({ token: 'abc' }) });
    expect(res.status).toBe(400);
    expect(mockState.fromCalls).toBe(0);
  });

  it('deve retornar null sem consultar o banco se tenantId não for informado no serviço', async () => {
    const res = await getPublicOrderTracking('7K9M2P4X8B', '');
    expect(res).toBeNull();
    expect(mockState.fromCalls).toBe(0);
  });

  it('deve bloquear consulta de pedido pertencente a outro tenant (404 + filtro tenant_id na query)', async () => {
    mockState.resolvedTenant = {
      tenant: { id: TENANT_B, slug: 'cacau-e-flor', name: 'Cacau & Flor' },
      settings: {},
    };
    const req = new NextRequest('http://cacau.local/api/orders/track/7K9M2P4X8B', {
      headers: { host: 'cacau.local' },
    });

    const res = await GET(req, { params: Promise.resolve({ token: '7K9M2P4X8B' }) });
    expect(res.status).toBe(404);
    expect(mockState.lastQueriedTenantId).toBe(TENANT_B);
  });

  it('deve retornar dados públicos com PII mascarado quando tenant e token coincidirem', async () => {
    mockState.resolvedTenant = {
      tenant: { id: TENANT_A, slug: 'benza', name: 'BENZA' },
      settings: { contact_whatsapp: '75999990000' },
    };
    const req = new NextRequest('http://benza.local/api/orders/track/7K9M2P4X8B', {
      headers: { host: 'benza.local' },
    });

    const res = await GET(req, { params: Promise.resolve({ token: '7K9M2P4X8B' }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.orderNumber).toBe('#000101');
    expect(body.customer.name).toBe('Maria O.');
    expect(body.customer.phone).toBe('7599****-7766');
    expect(mockState.lastQueriedTenantId).toBe(TENANT_A);
  });
});

