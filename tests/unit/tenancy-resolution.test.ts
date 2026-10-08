import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { normalizeHostname, resolveTenantByHost, clearTenantCache } from '@/lib/tenancy/context';

describe('Resolução de Tenant e Isolamento de Domínio', () => {
  const originalEnv = process.env.NODE_ENV;

  const setEnv = (val: string) => {
    (process.env as Record<string, string | undefined>).NODE_ENV = val;
  };

  beforeEach(() => {
    clearTenantCache();
  });

  afterEach(() => {
    setEnv(originalEnv as string);
    clearTenantCache();
  });

  it('deve normalizar hostnames removendo portas, espaços e letras maiúsculas', () => {
    expect(normalizeHostname('BENZA.com.br:3000')).toBe('benza.com.br');
    expect(normalizeHostname('  localhost:8080  ')).toBe('localhost');
    expect(normalizeHostname('cacauflor.com.br')).toBe('cacauflor.com.br');
    expect(normalizeHostname('')).toBe('');
  });

  it('EM PRODUÇÃO: hostname não cadastrado NUNCA deve carregar BENZA como fallback', async () => {
    setEnv('production');

    const unknownHost = 'loja-fantasma-inexistente.com.br';
    const result = await resolveTenantByHost(unknownHost);

    // DEVE ser nulo em produção para resultar em 404 / Estabelecimento não encontrado
    expect(result).toBeNull();
  });

  it('EM PRODUÇÃO: domínio de ataque ou arbitrário deve retornar null', async () => {
    setEnv('production');

    const maliciousHosts = [
      'attacker.com',
      'evil-phishing.org',
      'fake-benza.net',
      'subdomain.randomsaas.com',
    ];

    for (const host of maliciousHosts) {
      const result = await resolveTenantByHost(host);
      expect(result).toBeNull();
    }
  });

  it('EM PRODUÇÃO: parâmetros de URL ou tenant_id do cliente não influenciam a resolução', async () => {
    setEnv('production');

    // A resolução recebe estritamente o host HTTP, ignorando qualquer query ou header malicioso
    const result = await resolveTenantByHost('dominio-nao-verificado.com');
    expect(result).toBeNull();
  });

  it('EM DESENVOLVIMENTO: permite fallback local apenas para loopback (localhost/127.0.0.1)', async () => {
    setEnv('development');

    const result = await resolveTenantByHost('localhost:3000');
    expect(result).not.toBeNull();
    expect(result?.tenant.slug).toBe('benza');
  });
});
