import { createAdminClient } from '@/lib/supabase/admin';
import type { TenantFullContext } from '@/types/database.types';

// Cache em memória simples para requisições em runtime
const tenantCache = new Map<string, { data: TenantFullContext; timestamp: number }>();
const CACHE_TTL_MS = 60 * 1000; // 1 minuto

/**
 * Contexto padrão do Tenant 01 (BENZA) para desenvolvimento local ou fallback seguro EXCLUSIVO em dev
 */
export const DEFAULT_DEV_CONTEXT: TenantFullContext = {
  tenant: {
    id: '00000000-0000-0000-0000-000000000001',
    name: 'BENZA',
    slug: 'benza',
    status: 'active',
    site_mode: 'prelaunch',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  domains: [
    {
      id: 'dom-01',
      tenant_id: '00000000-0000-0000-0000-000000000001',
      hostname: 'benza.localhost',
      is_primary: true,
      is_verified: true,
      created_at: new Date().toISOString(),
    },
    {
      id: 'dom-02',
      tenant_id: '00000000-0000-0000-0000-000000000001',
      hostname: 'localhost',
      is_primary: false,
      is_verified: true,
      created_at: new Date().toISOString(),
    },
  ],
  settings: {
    tenant_id: '00000000-0000-0000-0000-000000000001',
    contact_email: 'contato@benza.com.br',
    contact_phone: '+55 11 98765-4321',
    contact_whatsapp: '+55 11 98765-4321',
    instagram_handle: 'benza.gastronomia',
    address_summary: 'São Paulo, SP — Atendimento e encomendas programadas',
    prelaunch_banner_text: 'Em breve: pratos prontos congelados para o seu dia a dia e momentos especiais.',
    prelaunch_cta_text: 'Em breve',
    business_hours: {
      producao: 'Segunda a Quarta',
      entregas: 'Quinta a Domingo',
    },
    seo_defaults: {
      default_meta_title: 'BENZA — Pratos Prontos e Conforto Gastronômico',
      default_meta_description: 'Cardápio de pratos preparados e porcionados para aquecer na sua mesa.',
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  branding: {
    tenant_id: '00000000-0000-0000-0000-000000000001',
    logo_url: null,
    favicon_url: null,
    font_family_heading: 'Playfair Display',
    font_family_body: 'Plus Jakarta Sans',
    color_primary: '#A84B2C',
    color_secondary: '#D99B26',
    color_accent: '#2C1A14',
    color_background: '#FDFBF7',
    color_surface: '#FFFFFF',
    color_text: '#1C1917',
    border_radius: '0.75rem',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
};

/**
 * Normaliza o host recebido, removendo porta se houver
 */
export function normalizeHostname(hostWithPort: string): string {
  if (!hostWithPort) return '';
  return hostWithPort.split(':')[0].trim().toLowerCase();
}

/**
 * Limpa o cache de resolução (útil para testes unitários)
 */
export function clearTenantCache(): void {
  tenantCache.clear();
}

/**
 * Resolve o TenantFullContext a partir do hostname HTTP.
 * 
 * REGRAS CRÍTICAS DE SEGURANÇA:
 * 1. Em PRODUCTION (process.env.NODE_ENV === 'production'):
 *    - Hostnames não cadastrados ou não verificados SEMPRE retornam null (HTTP 404).
 *    - NUNCA há fallback para BENZA ou qualquer outro tenant.
 * 2. Em DEVELOPMENT (process.env.NODE_ENV !== 'production'):
 *    - Somente hostnames de loopback (localhost, 127.0.0.1, benza.localhost) acionam
 *      o fallback local para permitir desenvolvimento offline/sem banco.
 *    - Qualquer outro hostname em dev tenta consulta normal ou retorna null.
 * 3. A autoridade de resolução é ESTRITAMENTE o Host normalizado no servidor.
 */
export async function resolveTenantByHost(rawHost: string): Promise<TenantFullContext | null> {
  const hostname = normalizeHostname(rawHost);

  if (!hostname) {
    return null;
  }

  const isProduction = process.env.NODE_ENV === 'production';
  const isLoopback = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === 'benza.localhost';
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const isPlaceholderDb = !supabaseUrl || supabaseUrl.includes('placeholder');

  // REGRA 1: Fallback exclusivo para DEV em ambiente loopback com banco placeholder
  if (!isProduction && isLoopback && isPlaceholderDb) {
    return DEFAULT_DEV_CONTEXT;
  }

  // Se o banco for placeholder e não for loopback dev, retorna null imediatamente sem tentar conexão externa
  if (isPlaceholderDb) {
    return null;
  }

  // REGRA 2: Em PRODUÇÃO, hostname desconhecido NUNCA pode ter fallback
  // 2.1 Verificar cache
  const cached = tenantCache.get(hostname);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    const supabase = createAdminClient();

    // 2.2 Buscar domínio verificado
    const { data: domainData, error: domainError } = await supabase
      .from('tenant_domains')
      .select('tenant_id')
      .eq('hostname', hostname)
      .eq('is_verified', true)
      .maybeSingle();

    if (domainError || !domainData?.tenant_id) {
      if (!isProduction && isLoopback) {
        return DEFAULT_DEV_CONTEXT;
      }
      return null;
    }

    const tenantId = domainData.tenant_id;

    // 2.3 Carregar dados completos do tenant associado
    const [tenantRes, domainsRes, settingsRes, brandingRes] = await Promise.all([
      supabase.from('tenants').select('*').eq('id', tenantId).single(),
      supabase.from('tenant_domains').select('*').eq('tenant_id', tenantId),
      supabase.from('tenant_settings').select('*').eq('tenant_id', tenantId).maybeSingle(),
      supabase.from('tenant_branding').select('*').eq('tenant_id', tenantId).maybeSingle(),
    ]);

    if (!tenantRes.data || tenantRes.data.status !== 'active') {
      return null;
    }

    const fullContext: TenantFullContext = {
      tenant: tenantRes.data,
      domains: domainsRes.data || [],
      settings: settingsRes.data || DEFAULT_DEV_CONTEXT.settings,
      branding: brandingRes.data || DEFAULT_DEV_CONTEXT.branding,
    };

    tenantCache.set(hostname, { data: fullContext, timestamp: Date.now() });
    return fullContext;
  } catch (error) {
    console.error(`[Tenancy] Erro ao resolver host ${hostname}:`, error);

    if (isProduction) {
      return null;
    }

    if (isLoopback) {
      return DEFAULT_DEV_CONTEXT;
    }

    return null;
  }
}
