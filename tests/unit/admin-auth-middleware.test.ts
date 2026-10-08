import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '../../src/middleware';

// Mock do @supabase/ssr
let mockUser: { id: string; email: string } | null = null;

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: mockUser },
        error: mockUser ? null : { message: 'Auth session missing' },
      })),
    },
  }),
}));

describe('Middleware de Segurança e Tenant Resolution', () => {
  beforeEach(() => {
    mockUser = null;
    vi.clearAllMocks();
  });

  it('deve injetar o header x-tenant-host baseado no request host', async () => {
    const request = new NextRequest('http://benza.sysfood.local:3000/produtos', {
      headers: { host: 'benza.sysfood.local:3000' },
    });

    const response = await middleware(request);
    expect(response.headers.get('x-tenant-host')).toBe('benza.sysfood.local:3000');
  });

  it('deve redirecionar usuário não autenticado tentando acessar /admin para /admin/login', async () => {
    mockUser = null;
    const request = new NextRequest('http://benza.sysfood.local:3000/admin', {
      headers: { host: 'benza.sysfood.local:3000' },
    });

    const response = await middleware(request);
    expect(response.status).toBe(307); // NextResponse.redirect default é 307
    expect(response.headers.get('location')).toContain('/admin/login?redirect=%2Fadmin');
  });

  it('deve redirecionar usuário não autenticado em subrotas de /admin (ex: /admin/produtos, /admin/site)', async () => {
    mockUser = null;
    const request = new NextRequest('http://benza.sysfood.local:3000/admin/produtos', {
      headers: { host: 'benza.sysfood.local:3000' },
    });

    const response = await middleware(request);
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toContain('/admin/login?redirect=%2Fadmin%2Fprodutos');
  });

  it('deve permitir acesso público à tela de login /admin/login sem redirecionamento', async () => {
    mockUser = null;
    const request = new NextRequest('http://benza.sysfood.local:3000/admin/login', {
      headers: { host: 'benza.sysfood.local:3000' },
    });

    const response = await middleware(request);
    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
  });

  it('deve permitir acesso a /admin quando o usuário estiver autenticado', async () => {
    mockUser = { id: 'usr_admin_123', email: 'admin@benza.com.br' };
    const request = new NextRequest('http://benza.sysfood.local:3000/admin', {
      headers: { host: 'benza.sysfood.local:3000' },
    });

    const response = await middleware(request);
    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
  });
});
