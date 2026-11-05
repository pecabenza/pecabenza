import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/upload/route';
import { NextRequest } from 'next/server';

let mockStorageUploadSuccess = true;

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn(async (path: string) => {
          if (!mockStorageUploadSuccess) {
            return { data: null, error: new Error('Storage service connection timeout') };
          }
          return { data: { path }, error: null };
        }),
        getPublicUrl: vi.fn((path: string) => ({
          data: { publicUrl: `https://mock-supabase.co/storage/v1/object/public/tenant-assets/${path}` },
        })),
      })),
    },
    from: vi.fn(() => ({
      insert: vi.fn(async () => ({ data: null, error: null })),
    })),
  })),
}));

describe('API Upload Route (/api/upload)', () => {
  beforeEach(() => {
    mockStorageUploadSuccess = true;
    vi.clearAllMocks();
  });
  it('deve rejeitar requisição sem arquivo', async () => {
    const formData = new FormData();
    const req = new NextRequest('http://localhost:3000/api/upload', {
      method: 'POST',
      body: formData,
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe('Nenhum arquivo enviado.');
  });

  it('deve rejeitar arquivo com mime type não suportado', async () => {
    const formData = new FormData();
    const blob = new Blob(['texto simples'], { type: 'text/plain' });
    formData.append('file', blob, 'teste.txt');

    const req = new NextRequest('http://localhost:3000/api/upload', {
      method: 'POST',
      body: formData,
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toContain('Formato de imagem inválido');
  });

  it('deve rejeitar arquivo que excede 5 MB', async () => {
    const formData = new FormData();
    // 6 MB blob
    const largeBlob = new Blob([new Uint8Array(6 * 1024 * 1024)], { type: 'image/jpeg' });
    formData.append('file', largeBlob, 'imagem-pesada.jpg');

    const req = new NextRequest('http://localhost:3000/api/upload', {
      method: 'POST',
      body: formData,
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toContain('5 MB');
  });

  it('deve aceitar upload de imagem válida e gerar path isolado por tenant', async () => {
    const formData = new FormData();
    const blob = new Blob(['dummy-image-content'], { type: 'image/jpeg' });
    formData.append('file', blob, 'foto-prato.jpg');
    formData.append('category', 'products');

    const req = new NextRequest('http://localhost:3000/api/upload', {
      method: 'POST',
      body: formData,
      headers: {
        host: 'benza.localhost',
      },
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.storagePath).toMatch(/^00000000-0000-0000-0000-000000000001\/products\/foto-prato-\d+-[a-z0-9]+\.jpg$/);
    expect(data.tenantId).toBe('00000000-0000-0000-0000-000000000001');
  });

  it('deve desabilitar upload de arquivos SVG de usuários para mitigar riscos de Stored XSS', async () => {
    const formData = new FormData();
    const svgBlob = new Blob(['<svg><script>alert(1)</script></svg>'], { type: 'image/svg+xml' });
    formData.append('file', svgBlob, 'malicious.svg');

    const req = new NextRequest('http://localhost:3000/api/upload', {
      method: 'POST',
      body: formData,
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toContain('Formato de imagem inválido');
  });

  it('em ambiente de staging ou production, NUNCA deve fazer fallback para disco local se o storage falhar', async () => {
    mockStorageUploadSuccess = false;
    const originalEnv = process.env.APP_ENV;
    process.env.APP_ENV = 'staging';

    const formData = new FormData();
    const blob = new Blob(['image-bytes'], { type: 'image/png' });
    formData.append('file', blob, 'foto.png');

    const req = new NextRequest('http://localhost:3000/api/upload', {
      method: 'POST',
      body: formData,
      headers: { host: 'benza.localhost' },
    });

    const res = await POST(req);
    const data = await res.json();

    // Em staging ou production, NUNCA deve retornar 200 com 'local_fallback'
    expect([500, 502]).toContain(res.status);
    expect(data.storage).toBeUndefined();
    expect(data.error).toBeDefined();

    process.env.APP_ENV = originalEnv;
  });
});
