import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  MemoryRateLimitDriver,
  DistributedRedisRateLimitDriver,
  ResilientRateLimitDriver,
} from '../../src/lib/security/rate-limit-drivers';
import {
  checkRateLimit,
  setRateLimitDriver,
  clearRateLimitStore,
} from '../../src/lib/security/rate-limit';
import { logger } from '../../src/lib/observability/logger';

describe('Drivers de Rate Limiting e Resiliência Distribuída', () => {
  beforeEach(async () => {
    await clearRateLimitStore();
  });

  it('deve contabilizar requisições corretamente usando o driver em memória', async () => {
    const memoryDriver = new MemoryRateLimitDriver();
    const key = 'test:mem:1';
    const rec1 = memoryDriver.increment(key, 10000);
    expect(rec1.count).toBe(1);

    const rec2 = memoryDriver.increment(key, 10000);
    expect(rec2.count).toBe(2);

    memoryDriver.destroy();
  });

  it('deve comunicar com API REST do Redis/Upstash com pipeline atômico', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [{ result: 1 }, { result: 1 }, { result: 59 }],
    });

    const redisDriver = new DistributedRedisRateLimitDriver({
      url: 'https://fake-upstash.com',
      token: 'fake-token',
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const record = await redisDriver.increment('user_123', 60000);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(record.count).toBe(1);
    expect(record.resetAt).toBeGreaterThan(Date.now());
  });

  it('em Staging, deve realizar fallback para memória E registrar log de warning', async () => {
    const warnSpy = vi.spyOn(logger, 'warn');
    const failingFetch = vi.fn().mockRejectedValue(new Error('Redis staging timeout'));

    const failingRedisDriver = new DistributedRedisRateLimitDriver({
      url: 'https://fake-upstash.com',
      token: 'fake-token',
      fetchFn: failingFetch as unknown as typeof fetch,
    });

    const memoryFallback = new MemoryRateLimitDriver();
    const resilientDriver = new ResilientRateLimitDriver(failingRedisDriver, memoryFallback, {
      appEnv: 'staging',
    });

    const rec = await resilientDriver.increment('user_staging', 60000, { prefix: 'leads' });
    expect(rec.count).toBe(1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Falha no rate limit distribuído (Redis)'),
      expect.objectContaining({
        eventType: 'rate_limit_driver_failure',
        prefix: 'leads',
      })
    );

    warnSpy.mockRestore();
    memoryFallback.destroy();
  });

  it('em Produção, deve adotar FAIL-CLOSED para endpoints sensíveis (ex: login/admin) e registrar erro crítico', async () => {
    const errorSpy = vi.spyOn(logger, 'error');
    const failingFetch = vi.fn().mockRejectedValue(new Error('Redis cluster down'));

    const failingRedisDriver = new DistributedRedisRateLimitDriver({
      url: 'https://fake-upstash.com',
      token: 'fake-token',
      fetchFn: failingFetch as unknown as typeof fetch,
    });

    const memoryFallback = new MemoryRateLimitDriver();
    const resilientDriver = new ResilientRateLimitDriver(failingRedisDriver, memoryFallback, {
      appEnv: 'production',
      productionStrategy: 'fail-closed',
    });

    // Operação sensível de login deve lançar erro no driver e ser bloqueada
    await expect(
      resilientDriver.increment('ip_attacker', 60000, { prefix: 'auth_login', isSensitive: true })
    ).rejects.toThrow(/Proteção contra abuso indisponível para operação sensível/);

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('CRÍTICO: Falha no driver de rate limiting distribuído em produção!'),
      expect.any(Error),
      expect.objectContaining({
        eventType: 'rate_limit_driver_failure',
        prefix: 'auth_login',
        isSensitive: true,
        strategy: 'fail-closed',
      })
    );

    errorSpy.mockRestore();
    memoryFallback.destroy();
  });

  it('em Produção com checkRateLimit, requisição sensível deve retornar success: false com 0 restantes', async () => {
    const failingFetch = vi.fn().mockRejectedValue(new Error('Redis connection refused'));
    const failingRedisDriver = new DistributedRedisRateLimitDriver({
      url: 'https://fake-upstash.com',
      token: 'fake-token',
      fetchFn: failingFetch as unknown as typeof fetch,
    });

    const resilientDriver = new ResilientRateLimitDriver(failingRedisDriver, new MemoryRateLimitDriver(), {
      appEnv: 'production',
      productionStrategy: 'fail-closed',
    });

    setRateLimitDriver(resilientDriver);

    const result = await checkRateLimit('admin_user', {
      limit: 5,
      prefix: 'auth_login',
      isSensitive: true,
    });

    // Bloqueado com segurança por fail-closed
    expect(result.success).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('deve permitir injeção de driver no módulo checkRateLimit', async () => {
    const customMemoryDriver = new MemoryRateLimitDriver();
    setRateLimitDriver(customMemoryDriver);

    const res1 = await checkRateLimit('ip_custom', { limit: 2, windowSeconds: 60, prefix: 'custom' });
    expect(res1.success).toBe(true);
    expect(res1.remaining).toBe(1);

    const res2 = await checkRateLimit('ip_custom', { limit: 2, windowSeconds: 60, prefix: 'custom' });
    expect(res2.success).toBe(true);
    expect(res2.remaining).toBe(0);

    const res3 = await checkRateLimit('ip_custom', { limit: 2, windowSeconds: 60, prefix: 'custom' });
    expect(res3.success).toBe(false);

    customMemoryDriver.destroy();
  });
});
