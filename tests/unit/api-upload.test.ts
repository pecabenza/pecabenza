import { describe, it, expect } from 'vitest';
import { POST } from '@/app/api/upload/route';
import { NextRequest } from 'next/server';

describe('API Upload Route (/api/upload)', () => {
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
});
