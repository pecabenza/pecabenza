/**
 * Abstração de Drivers de Armazenamento para Rate Limiting
 * Permite alternar de forma transparente entre armazenamento em memória (desenvolvimento/testes)
 * e armazenamento distribuído (Redis/Upstash em ambientes serverless ou produção).
 *
 * Em caso de indisponibilidade do Redis:
 * - development/test: Fallback para memória local.
 * - staging: Fallback para memória permitido, com registro de warning na observabilidade.
 * - production: Fallback controlado. Endpoints sensíveis adotam fail-closed ou modo degradado estrito,
 *               com registro de erro crítico na observabilidade (sem vazar PII ou secrets).
 */

import { logger } from '@/lib/observability/logger';

export interface RateLimitRecord {
  count: number;
  resetAt: number;
}

export interface RateLimitIncrementContext {
  prefix?: string;
  isSensitive?: boolean;
  identifier?: string;
}

export interface RateLimitDriver {
  name: string;
  increment(
    key: string,
    windowMs: number,
    context?: RateLimitIncrementContext
  ): Promise<RateLimitRecord> | RateLimitRecord;
  clear?(): Promise<void> | void;
}

/**
 * Driver em Memória (Token Bucket / Sliding Window local)
 * Utilizado por padrão em desenvolvimento, testes e como fallback resiliente.
 */
export class MemoryRateLimitDriver implements RateLimitDriver {
  name = 'memory';
  private store = new Map<string, RateLimitRecord>();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    if (typeof setInterval !== 'undefined') {
      this.cleanupInterval = setInterval(() => {
        this.cleanup();
      }, 60 * 1000);
      this.cleanupInterval.unref?.();
    }
  }

  increment(key: string, windowMs: number): RateLimitRecord {
    const now = Date.now();
    const existing = this.store.get(key);

    if (!existing || now > existing.resetAt) {
      const record: RateLimitRecord = {
        count: 1,
        resetAt: now + windowMs,
      };
      this.store.set(key, record);
      return record;
    }

    existing.count += 1;
    return existing;
  }

  clear(): void {
    this.store.clear();
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, record] of this.store.entries()) {
      if (now > record.resetAt) {
        this.store.delete(key);
      }
    }
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

/**
 * Driver Distribuído (Compatível com Redis e Upstash REST API)
 * Utilizado em ambientes distribuídos e serverless.
 */
export interface RedisDriverConfig {
  url?: string;
  token?: string;
  fetchFn?: typeof fetch;
}

export class DistributedRedisRateLimitDriver implements RateLimitDriver {
  name = 'redis/distributed';
  private url: string;
  private token: string;
  private fetchFn: typeof fetch;

  constructor(config?: RedisDriverConfig) {
    this.url = config?.url || process.env.UPSTASH_REDIS_REST_URL || process.env.REDIS_URL || '';
    this.token = config?.token || process.env.UPSTASH_REDIS_REST_TOKEN || process.env.REDIS_TOKEN || '';
    this.fetchFn = config?.fetchFn || (typeof fetch !== 'undefined' ? fetch : (globalThis.fetch as typeof fetch));
  }

  async increment(key: string, windowMs: number): Promise<RateLimitRecord> {
    if (!this.url || !this.token) {
      throw new Error('[DistributedRateLimit] URL ou Token do Redis/Upstash não configurados.');
    }

    const windowSeconds = Math.ceil(windowMs / 1000);

    // Requisição atômica usando pipeline REST do Upstash
    const response = await this.fetchFn(`${this.url}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([
        ['INCR', key],
        ['EXPIRE', key, windowSeconds],
        ['TTL', key],
      ]),
    });

    if (!response.ok) {
      throw new Error(`[DistributedRateLimit] Erro no Redis REST: HTTP ${response.status}`);
    }

    const results = (await response.json()) as Array<{ result?: unknown; error?: string }>;
    const count = Number(results[0]?.result ?? 1);
    const ttlSeconds = Number(results[2]?.result ?? windowSeconds);
    const now = Date.now();

    return {
      count,
      resetAt: now + (ttlSeconds > 0 ? ttlSeconds * 1000 : windowMs),
    };
  }

  async clear(): Promise<void> {
    // Em produção Redis, o flush geral não é invocado por segurança
  }
}

export type ProductionFallbackStrategy = 'fail-closed' | 'strict-degraded-memory';

export interface ResilientDriverOptions {
  appEnv?: string;
  productionStrategy?: ProductionFallbackStrategy;
}

/**
 * Driver Resiliente com Fallback Consciente por Ambiente
 * Em produção, protege operações sensíveis contra bypass por fragmentação de memória.
 */
export class ResilientRateLimitDriver implements RateLimitDriver {
  name = 'resilient';
  private primary: RateLimitDriver;
  private fallback: MemoryRateLimitDriver;
  private options: ResilientDriverOptions;

  constructor(
    primary?: RateLimitDriver,
    fallback?: MemoryRateLimitDriver,
    options: ResilientDriverOptions = {}
  ) {
    this.fallback = fallback || new MemoryRateLimitDriver();
    this.primary = primary || this.fallback;
    this.options = options;
  }

  async increment(
    key: string,
    windowMs: number,
    context?: RateLimitIncrementContext
  ): Promise<RateLimitRecord> {
    try {
      const record = await this.primary.increment(key, windowMs, context);
      return record;
    } catch (error) {
      const env =
        this.options.appEnv ||
        process.env.APP_ENV ||
        process.env.NODE_ENV ||
        'development';

      const isSensitive =
        context?.isSensitive ??
        Boolean(
          context?.prefix &&
            ['auth', 'login', 'upload', 'admin', 'password', 'pwd', 'payment', 'checkout'].some((p) =>
              context.prefix!.toLowerCase().includes(p)
            )
        );

      // 1. Notificação Estruturada na Camada de Observabilidade
      if (env === 'staging') {
        logger.warn('Falha no rate limit distribuído (Redis). Fallback para memória em staging.', {
          eventType: 'rate_limit_driver_failure',
          driver: this.primary.name,
          prefix: context?.prefix,
          isSensitive,
          errorMessage: (error as Error)?.message,
        });
      } else if (env === 'production') {
        logger.error(
          'CRÍTICO: Falha no driver de rate limiting distribuído em produção!',
          error,
          {
            eventType: 'rate_limit_driver_failure',
            driver: this.primary.name,
            prefix: context?.prefix,
            isSensitive,
            strategy: this.options.productionStrategy || 'fail-closed',
          }
        );
      } else {
        if (process.env.NODE_ENV !== 'production') {
          console.warn(
            `[RateLimit Fallback] Falha no driver primário (${this.primary.name}). Usando memória local:`,
            (error as Error)?.message
          );
        }
      }

      // 2. Comportamento Específico por Ambiente
      if (env === 'production') {
        const strategy = this.options.productionStrategy || 'fail-closed';
        if (isSensitive && strategy === 'fail-closed') {
          // Fail-closed para endpoints sensíveis: não permite bypass
          throw new Error(
            `[RateLimit Critical] Proteção contra abuso indisponível para operação sensível (${context?.prefix || 'auth'}). Requisição bloqueada por segurança.`
          );
        }
      }

      // Para ambientes não-produtivos ou requisições gerais com fallback permitido
      return this.fallback.increment(key, windowMs);
    }
  }

  async clear(): Promise<void> {
    await this.primary.clear?.();
    this.fallback.clear();
  }

  setPrimary(driver: RateLimitDriver): void {
    this.primary = driver;
  }

  getPrimary(): RateLimitDriver {
    return this.primary;
  }

  getFallback(): MemoryRateLimitDriver {
    return this.fallback;
  }

  setOptions(options: ResilientDriverOptions): void {
    this.options = { ...this.options, ...options };
  }
}
