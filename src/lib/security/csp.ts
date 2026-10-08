/**
 * Gerador de Content-Security-Policy (CSP) e HSTS com Menor Privilégio
 * Permite configuração modular por integração sem uso de curingas inseguros (*).
 * Serviços externos são liberados estritamente sob demanda ativa da integração.
 */

export interface CspOptions {
  includeGoogleAnalytics?: boolean;
  includeGoogleTagManager?: boolean;
  includeSupabase?: boolean;
  includeCloudinary?: boolean;
  paymentGateways?: ('stripe' | 'mercadopago' | 'asaas')[];
  additionalConnectSrc?: string[];
  additionalImgSrc?: string[];
  additionalFrameSrc?: string[];
  isProduction?: boolean;
}

/**
 * Constrói a diretiva Content-Security-Policy seguindo o princípio do menor privilégio.
 * Nenhuma diretiva de script, frame ou conexão utiliza o curinga '*', restringindo
 * o acesso exclusivamente a hosts conhecidos e homologados.
 */
export function buildContentSecurityPolicy(options: CspOptions = {}): string {
  const {
    includeGoogleAnalytics = true,
    includeGoogleTagManager = true,
    includeSupabase = true,
    includeCloudinary = false, // Desabilitado por padrão até integração ativa
    paymentGateways = [],      // Desabilitados por padrão até fase da loja/pagamento
    additionalConnectSrc = [],
    additionalImgSrc = [],
    additionalFrameSrc = [],
    isProduction = process.env.NODE_ENV === 'production',
  } = options;

  const scriptSrc = ["'self'", "'unsafe-inline'"];
  const connectSrc = ["'self'"];
  const imgSrc = ["'self'", 'data:', 'blob:'];
  const frameSrc: string[] = [];
  const fontSrc = ["'self'", 'https://fonts.gstatic.com', 'data:'];
  const styleSrc = ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'];

  // Next.js Fast Refresh em ambiente de desenvolvimento local precisa de 'unsafe-eval'
  if (!isProduction) {
    scriptSrc.push("'unsafe-eval'");
  }

  // Google Analytics & Google Tag Manager (Whitelist estrita sem curingas)
  if (includeGoogleTagManager || includeGoogleAnalytics) {
    scriptSrc.push('https://www.googletagmanager.com', 'https://www.google-analytics.com');
    connectSrc.push(
      'https://www.google-analytics.com',
      'https://analytics.google.com',
      'https://region1.google-analytics.com'
    );
    imgSrc.push('https://www.googletagmanager.com', 'https://www.google-analytics.com');
  }

  // Supabase (APIs REST e Realtime WebSockets)
  if (includeSupabase) {
    connectSrc.push('https://*.supabase.co', 'wss://*.supabase.co');
    imgSrc.push('https://*.supabase.co');
  }

  // CDNs homologadas para assets estáticos e mídias (apenas quando ativadas)
  if (includeCloudinary) {
    imgSrc.push('https://res.cloudinary.com');
  }

  // Gateways de Pagamento homologados (somente quando módulo financeiro estiver ativo)
  if (paymentGateways.includes('stripe')) {
    scriptSrc.push('https://js.stripe.com');
    frameSrc.push('https://js.stripe.com');
    connectSrc.push('https://api.stripe.com');
  }

  if (paymentGateways.includes('mercadopago')) {
    scriptSrc.push('https://sdk.mercadopago.com');
    frameSrc.push('https://www.mercadopago.com');
    connectSrc.push('https://api.mercadopago.com');
  }

  // Entradas adicionais homologadas
  if (additionalConnectSrc.length > 0) connectSrc.push(...additionalConnectSrc);
  if (additionalImgSrc.length > 0) imgSrc.push(...additionalImgSrc);
  if (additionalFrameSrc.length > 0) frameSrc.push(...additionalFrameSrc);

  // Se nenhum frame for homologado, define 'none'
  const finalFrameSrc = frameSrc.length > 0 ? Array.from(new Set(frameSrc)).join(' ') : "'none'";

  const directives: string[] = [
    "default-src 'self'",
    `script-src ${Array.from(new Set(scriptSrc)).join(' ')}`,
    `style-src ${Array.from(new Set(styleSrc)).join(' ')}`,
    `img-src ${Array.from(new Set(imgSrc)).join(' ')}`,
    `font-src ${Array.from(new Set(fontSrc)).join(' ')}`,
    `connect-src ${Array.from(new Set(connectSrc)).join(' ')}`,
    `frame-src ${finalFrameSrc}`,
    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
  ];

  if (isProduction) {
    directives.push('upgrade-insecure-requests');
  }

  return directives.join('; ');
}

export interface HstsOptions {
  appEnv?: string;
  enablePreload?: boolean;
}

/**
 * Constrói o cabeçalho Strict-Transport-Security (HSTS).
 * Em Staging ou ambientes não-produtivos, NUNCA envia 'preload',
 * prevenindo que domínios temporários fiquem permanentemente gravados nos navegadores.
 */
export function buildHstsHeader(options: HstsOptions = {}): string | null {
  const env = options.appEnv || process.env.APP_ENV || process.env.NODE_ENV || 'development';
  const enablePreload = options.enablePreload ?? (process.env.ENABLE_HSTS_PRELOAD === 'true');

  // Desenvolvimento local: não força HSTS
  if (env === 'development' || env === 'test') {
    return null;
  }

  // Staging / Homologação: SEM preload
  if (env === 'staging' || env !== 'production') {
    return 'max-age=86400; includeSubDomains';
  }

  // Produção: 'preload' somente se habilitado deliberadamente
  if (enablePreload) {
    return 'max-age=63072000; includeSubDomains; preload';
  }

  return 'max-age=31536000; includeSubDomains';
}
