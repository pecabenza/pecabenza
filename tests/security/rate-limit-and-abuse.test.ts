import { describe, it, expect, beforeEach } from 'vitest';
import { checkRateLimit, clearRateLimitStore } from '../../src/lib/security/rate-limit';
import { createSafeErrorResponse } from '../../src/lib/security/error-response';

describe('Proteção contra Abuso e Rate Limiting (Segurança)', () => {
  beforeEach(async () => {
    await clearRateLimitStore();
  });

  it('deve permitir requisições dentro do limite configurado', async () => {
    const ip = '192.168.1.100';
    for (let i = 1; i <= 5; i++) {
      const res = await checkRateLimit(ip, { limit: 5, windowSeconds: 60, prefix: 'test' });
      expect(res.success).toBe(true);
      expect(res.remaining).toBe(5 - i);
    }
  });

  it('deve bloquear a 6ª requisição quando o limite for 5 (HTTP 429)', async () => {
    const ip = '192.168.1.100';
    for (let i = 1; i <= 5; i++) {
      await checkRateLimit(ip, { limit: 5, windowSeconds: 60, prefix: 'test' });
    }

    const blocked = await checkRateLimit(ip, { limit: 5, windowSeconds: 60, prefix: 'test' });
    expect(blocked.success).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.reset).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it('deve isolar limites por rota/prefixo para o mesmo IP', async () => {
    const ip = '192.168.1.100';
    // Esgota o limite de login
    for (let i = 1; i <= 3; i++) {
      await checkRateLimit(ip, { limit: 3, windowSeconds: 60, prefix: 'auth_login' });
    }
    const loginBlocked = await checkRateLimit(ip, { limit: 3, windowSeconds: 60, prefix: 'auth_login' });
    expect(loginBlocked.success).toBe(false);

    // O mesmo IP ainda deve conseguir enviar formulário de contato/lead
    const contactAllowed = await checkRateLimit(ip, { limit: 5, windowSeconds: 60, prefix: 'leads' });
    expect(contactAllowed.success).toBe(true);
    expect(contactAllowed.remaining).toBe(4);
  });

  it('deve formatar respostas de erro seguras sem vazar stack trace ou detalhes de banco', async () => {
    const internalDbError = new Error('FATAL: password authentication failed for user "postgres" at host 10.0.0.1');
    const response = createSafeErrorResponse(internalDbError, 500, {
      tenantId: '00000000-0000-0000-0000-000000000001',
      path: '/api/leads',
      action: 'db_insert',
    });

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Ocorreu um erro inesperado ao processar sua solicitação.');
    expect(body.error_id).toMatch(/^err_\d+_[a-z0-9]+$/);
    // Garantir que a senha ou dados do postgres não vazam para o cliente
    expect(JSON.stringify(body)).not.toContain('postgres');
    expect(JSON.stringify(body)).not.toContain('10.0.0.1');
    expect(JSON.stringify(body)).not.toContain('FATAL');
  });
});
