/**
 * Módulo de Observabilidade e Logging Estruturado Multi-Tenant
 * Registra eventos e erros com redação automática de dados sensíveis (PII / Secrets).
 */

export type LogLevel = 'info' | 'warn' | 'error';

export interface LogContext {
  tenantId?: string;
  eventType?:
    | 'api_request'
    | 'api_error'
    | 'auth_success'
    | 'auth_failure'
    | 'upload_success'
    | 'upload_rejected'
    | 'rate_limit_exceeded'
    | 'rate_limit_driver_failure'
    | 'security_violation'
    | 'lead_created'
    | 'seo_audit';
  path?: string;
  method?: string;
  statusCode?: number;
  ipHash?: string;
  durationMs?: number;
  [key: string]: unknown;
}

const SENSITIVE_KEYS = new Set([
  'password',
  'token',
  'secret',
  'key',
  'authorization',
  'service_role',
  'cookie',
  'credit_card',
  'cvv',
]);

/**
 * Remove recursivamente chaves sensíveis e mascara dados identificáveis
 */
function redactData(data: unknown): unknown {
  if (!data || typeof data !== 'object') {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map(redactData);
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(data as Record<string, unknown>)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_KEYS.has(lowerKey) || lowerKey.includes('secret') || lowerKey.includes('key')) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof val === 'string' && val.includes('@') && val.length > 5) {
      // Mascara parte do email (ex: jo***@domain.com)
      const [user, domain] = val.split('@');
      const maskedUser = user.length > 2 ? `${user.substring(0, 2)}***` : '***';
      sanitized[key] = `${maskedUser}@${domain}`;
    } else if (typeof val === 'object' && val !== null) {
      sanitized[key] = redactData(val);
    } else {
      sanitized[key] = val;
    }
  }

  return sanitized;
}

export const logger = {
  info(message: string, context?: LogContext) {
    const entry = {
      timestamp: new Date().toISOString(),
      level: 'info',
      message,
      ...(context ? (redactData(context) as LogContext) : {}),
    };
    console.log(JSON.stringify(entry));
  },

  warn(message: string, context?: LogContext) {
    const entry = {
      timestamp: new Date().toISOString(),
      level: 'warn',
      message,
      ...(context ? (redactData(context) as LogContext) : {}),
    };
    console.warn(JSON.stringify(entry));
  },

  error(message: string, error?: unknown, context?: LogContext) {
    const errorMessage = error instanceof Error ? error.message : String(error || 'Erro desconhecido');
    const entry = {
      timestamp: new Date().toISOString(),
      level: 'error',
      message,
      errorMessage,
      ...(process.env.NODE_ENV !== 'production' && error instanceof Error ? { stack: error.stack } : {}),
      ...(context ? (redactData(context) as LogContext) : {}),
    };
    console.error(JSON.stringify(entry));
  },
};
