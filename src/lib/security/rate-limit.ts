/**
 * Módulo de Rate Limiting Abstrato e Desacoplado
 * Utiliza o padrão de Driver de Armazenamento para permitir execução transparente
 * em memória local (dev/testes) ou distribuída (Redis/Upstash em produção/serverless).
 */

import {
  RateLimitDriver,
  MemoryRateLimitDriver,
  DistributedRedisRateLimitDriver,
  ResilientRateLimitDriver,
  ProductionFallbackStrategy,
} from './rate-limit-drivers';

export interface RateLimitOptions {
  /** Quantidade máxima de requisições permitidas na janela */
  limit: number;
  /** Tamanho da janela em segundos (padrão: 60s) */
  windowSeconds?: number;
  /** Prefixo do namespace (ex: 'auth', 'leads', 'upload', 'public_api') */
  prefix?: string;
  /** Indica se a operação é crítica/sensível (ex: login, upload, admin, pagamentos) */
  isSensitive?: boolean;
}

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
}

// Inicialização com suporte a variáveis de ambiente
function initializeDefaultDriver(): ResilientRateLimitDriver {
  const memoryDriver = new MemoryRateLimitDriver();

  const redisUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.REDIS_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.REDIS_TOKEN;

  if (redisUrl && redisToken) {
    const distributedDriver = new DistributedRedisRateLimitDriver({
      url: redisUrl,
      token: redisToken,
    });
    return new ResilientRateLimitDriver(distributedDriver, memoryDriver, {
      appEnv: process.env.APP_ENV || process.env.NODE_ENV,
      productionStrategy: (process.env.RATE_LIMIT_PRODUCTION_STRATEGY as ProductionFallbackStrategy) || 'fail-closed',
    });
  }

  // Se não configurado Redis, utiliza memória com capacidade de fallback
  return new ResilientRateLimitDriver(memoryDriver, memoryDriver, {
    appEnv: process.env.APP_ENV || process.env.NODE_ENV,
  });
}

let activeDriver: ResilientRateLimitDriver = initializeDefaultDriver();

/**
 * Permite configurar explicitamente o driver ativo (útil para injeção em testes e mocks)
 */
export function setRateLimitDriver(driver: RateLimitDriver): void {
  if (driver instanceof ResilientRateLimitDriver) {
    activeDriver = driver;
  } else {
    activeDriver = new ResilientRateLimitDriver(driver);
  }
}

/**
 * Retorna o driver atualmente em operação
 */
export function getRateLimitDriver(): ResilientRateLimitDriver {
  return activeDriver;
}

/**
 * Valida se um identificador (geralmente IP ou IP+Rota) excedeu o limite de requisições.
 * Totalmente assíncrono e desacoplado do meio de armazenamento físico.
 */
export async function checkRateLimit(
  identifier: string,
  options: RateLimitOptions
): Promise<RateLimitResult> {
  const { limit, windowSeconds = 60, prefix = 'rl', isSensitive } = options;
  const windowMs = windowSeconds * 1000;
  const key = `${prefix}:${identifier}`;

  try {
    const record = await activeDriver.increment(key, windowMs, {
      prefix,
      isSensitive,
      identifier,
    });

    const isSuccess = record.count <= limit;
    const remaining = Math.max(0, limit - record.count);
    const reset = Math.ceil(record.resetAt / 1000);

    return {
      success: isSuccess,
      limit,
      remaining,
      reset,
    };
  } catch (_error) {
    // Em fail-closed (produção para endpoints sensíveis), bloqueia preventivamente com 0 restantes
    return {
      success: false,
      limit,
      remaining: 0,
      reset: Math.ceil((Date.now() + windowMs) / 1000),
    };
  }
}

/**
 * Limpa o histórico de rate limit ativo (útil para testes unitários)
 */
export async function clearRateLimitStore(): Promise<void> {
  await activeDriver.clear();
}
