/**
 * Motor de Auditoria SEO Automática do SaaS SysFood
 * Avalia páginas e produtos quanto a boas práticas técnicas, sem promessas mágicas
 * e priorizando conteúdo útil, natural e sem keyword stuffing (conforme Google Search Essentials).
 */

import type { Tenant, TenantSettings, TenantBranding } from '@/types/database.types';

export type SeoSeverity = 'critico' | 'importante' | 'recomendacao';

export interface SeoIssue {
  id: string;
  severity: SeoSeverity;
  rule: string;
  message: string;
  suggestion: string;
}

export interface SeoAuditPageInput {
  url: string;
  slug: string;
  title?: string | null;
  metaDescription?: string | null;
  canonicalUrl?: string | null;
  h1?: string | null;
  content?: string | null;
  primaryKeyword?: string | null;
  secondaryKeywords?: string[];
  images?: { src: string; alt?: string | null }[];
  searchIntent?: 'commercial' | 'informational' | 'transactional' | 'navigational';
  isIndexable?: boolean;
}

export interface SeoAuditReport {
  url: string;
  slug: string;
  score: number; // 0 a 100
  status: 'excelente' | 'bom' | 'precisa_atencao' | 'critico';
  issues: SeoIssue[];
  metrics: {
    titleLength: number;
    descriptionLength: number;
    wordCount: number;
    imageCount: number;
    imagesMissingAlt: number;
    primaryKeywordDensity: number; // Porcentagem
  };
}

/**
 * Executa a auditoria completa de uma página ou produto.
 */
export function auditPageSeo(input: SeoAuditPageInput): SeoAuditReport {
  const issues: SeoIssue[] = [];
  const title = input.title?.trim() || '';
  const description = input.metaDescription?.trim() || '';
  const h1 = input.h1?.trim() || '';
  const content = input.content?.trim() || '';
  const slug = input.slug?.trim() || '';
  const images = input.images || [];

  // 1. Verificações de Title
  if (!title) {
    issues.push({
      id: 'title-missing',
      severity: 'critico',
      rule: 'Título Ausente',
      message: 'A página não possui tag <title> definida.',
      suggestion: 'Adicione um título descritivo entre 40 e 60 caracteres com o nome do prato ou serviço e a marca.',
    });
  } else if (title.length < 25) {
    issues.push({
      id: 'title-too-short',
      severity: 'importante',
      rule: 'Título Muito Curto',
      message: `O título possui apenas ${title.length} caracteres.`,
      suggestion: 'Títulos com menos de 25 caracteres perdem a oportunidade de descrever a proposta da página.',
    });
  } else if (title.length > 65) {
    issues.push({
      id: 'title-too-long',
      severity: 'importante',
      rule: 'Título Longo Demais',
      message: `O título possui ${title.length} caracteres e pode ser truncado no Google.`,
      suggestion: 'Mantenha o título com até 60 caracteres para exibição perfeita nos resultados de busca.',
    });
  }

  // 2. Verificações de Meta Description
  if (!description) {
    issues.push({
      id: 'desc-missing',
      severity: 'critico',
      rule: 'Meta Description Ausente',
      message: 'A página não possui meta description configurada.',
      suggestion: 'Crie um resumo convidativo entre 120 e 155 caracteres destacando o benefício para quem pesquisa.',
    });
  } else if (description.length < 50) {
    issues.push({
      id: 'desc-too-short',
      severity: 'importante',
      rule: 'Meta Description Muito Curta',
      message: `A descrição possui apenas ${description.length} caracteres.`,
      suggestion: 'Amplie a descrição com detalhes úteis sobre o prato, porção ou proposta.',
    });
  } else if (description.length > 165) {
    issues.push({
      id: 'desc-too-long',
      severity: 'recomendacao',
      rule: 'Meta Description Extensa',
      message: `A descrição tem ${description.length} caracteres e pode ser cortada no snippet mobile.`,
      suggestion: 'Condense a mensagem em até 155 caracteres.',
    });
  }

  // 3. Verificações de Heading Principal (H1)
  if (!h1) {
    issues.push({
      id: 'h1-missing',
      severity: 'critico',
      rule: 'H1 Ausente',
      message: 'A página não possui um cabeçalho de primeiro nível <h1> definido.',
      suggestion: 'Garanta que cada página contenha um único <h1> com o tema central.',
    });
  }

  // 4. Verificação de Slug / URL Amigável
  if (slug) {
    if (/[A-Z]/.test(slug)) {
      issues.push({
        id: 'slug-uppercase',
        severity: 'importante',
        rule: 'Slug com Letras Maiúsculas',
        message: 'A URL contém letras maiúsculas, o que pode causar duplicidade de indexação.',
        suggestion: 'Converta todos os caracteres da URL para minúsculas.',
      });
    }
    if (/[^a-z0-9\-_/]/.test(slug)) {
      issues.push({
        id: 'slug-invalid-chars',
        severity: 'critico',
        rule: 'Caracteres Inválidos na URL',
        message: 'A URL contém espaços ou caracteres especiais não codificados.',
        suggestion: 'Utilize apenas letras minúsculas, números e hífens como separadores.',
      });
    }
  }

  // 5. Verificação de Canonical
  if (!input.canonicalUrl) {
    issues.push({
      id: 'canonical-missing',
      severity: 'importante',
      rule: 'Canonical Ausente',
      message: 'Não há URL canônica declarada para esta página.',
      suggestion: 'Declare <link rel="canonical" href="..."> para evitar conteúdo duplicado entre domínios.',
    });
  }

  // 6. Verificação de Imagens e Alt Text
  let missingAltCount = 0;
  for (const img of images) {
    if (!img.alt || img.alt.trim() === '') {
      missingAltCount++;
    }
  }

  if (missingAltCount > 0) {
    issues.push({
      id: 'images-missing-alt',
      severity: missingAltCount > 2 ? 'critico' : 'importante',
      rule: 'Imagens Sem Texto Alternativo (Alt Text)',
      message: `${missingAltCount} imagem(ns) nesta página não possui(em) descrição alt text.`,
      suggestion: 'Adicione textos alternativos acessíveis descrevendo o conteúdo da imagem para leitores de tela e Google Imagens.',
    });
  }

  // 7. Contagem de Palavras e Conteúdo Útil
  const words = content.split(/\s+/).filter(Boolean);
  const wordCount = words.length;

  if (wordCount > 0 && wordCount < 40) {
    issues.push({
      id: 'content-thin',
      severity: 'recomendacao',
      rule: 'Conteúdo Sucinto (Oportunidade de Expansão)',
      message: `A página possui apenas ${wordCount} palavras de conteúdo editorial.`,
      suggestion: 'Adicione mais contexto útil, como ingredientes, modo de conservação ou perguntas frequentes.',
    });
  }

  // 8. Análise de Palavra-chave e Prevenção de Keyword Stuffing
  let keywordDensity = 0;
  if (input.primaryKeyword && wordCount > 0) {
    const kwRegex = new RegExp(`\\b${input.primaryKeyword.toLowerCase()}\\b`, 'gi');
    const matches = (content.toLowerCase().match(kwRegex) || []).length;
    keywordDensity = Number(((matches / wordCount) * 100).toFixed(1));

    if (matches === 0) {
      issues.push({
        id: 'keyword-absent',
        severity: 'recomendacao',
        rule: 'Palavra-chave Ausente no Conteúdo',
        message: `A palavra-chave principal "${input.primaryKeyword}" não foi mencionada no texto da página.`,
        suggestion: 'Mencione a palavra-chave naturalmente no texto explicativo ou no primeiro parágrafo.',
      });
    } else if (keywordDensity > 4.5) {
      issues.push({
        id: 'keyword-stuffing',
        severity: 'critico',
        rule: 'Excesso de Palavra-chave (Risco de Penalização)',
        message: `A densidade da palavra-chave é de ${keywordDensity}%, o que pode ser interpretado como repetição excessiva pelo Google.`,
        suggestion: 'Reduza as repetições e utilize variações semânticas ou termos sinônimos.',
      });
    }
  }

  // 9. Cálculo de Score (100 pontos base - deduções por severidade)
  let score = 100;
  for (const issue of issues) {
    if (issue.severity === 'critico') score -= 25;
    else if (issue.severity === 'importante') score -= 10;
    else if (issue.severity === 'recomendacao') score -= 4;
  }
  score = Math.max(0, Math.min(100, score));

  let status: SeoAuditReport['status'] = 'excelente';
  if (score < 50) status = 'critico';
  else if (score < 75) status = 'precisa_atencao';
  else if (score < 90) status = 'bom';

  return {
    url: input.url,
    slug,
    score,
    status,
    issues,
    metrics: {
      titleLength: title.length,
      descriptionLength: description.length,
      wordCount,
      imageCount: images.length,
      imagesMissingAlt: missingAltCount,
      primaryKeywordDensity: keywordDensity,
    },
  };
}

export interface TenantSeoAuditReport {
  score: number;
  status: 'excelente' | 'bom' | 'precisa_atencao' | 'critico';
  issues: SeoIssue[];
  configuredType: string;
}

/**
 * Realiza auditoria estrutural das configurações de SEO, dados locais e Schema.org do tenant.
 * Não inventa dados e valida a consistência de presença para busca local e orgânica.
 */
export function auditTenantSeoConfig(
  tenant: Tenant,
  settings: TenantSettings,
  branding?: TenantBranding
): TenantSeoAuditReport {
  const issues: SeoIssue[] = [];

  // 1. Tipo de Negócio (Schema.org)
  const businessType = settings.business_type || (settings.address_summary ? 'LocalBusiness' : 'Organization');
  if (!settings.business_type) {
    issues.push({
      id: 'tenant-business-type-implicit',
      severity: 'recomendacao',
      rule: 'Tipo de Negócio Implícito',
      message: `O tipo de negócio não foi definido explicitamente. Utilizando fallback seguro '${businessType}'.`,
      suggestion: 'Configure explicitamente em tenant_settings se o estabelecimento é FoodEstablishment, Restaurant, Store ou LocalBusiness.',
    });
  }

  // 2. Nome da Marca
  if (!tenant.name || tenant.name.trim().length < 3) {
    issues.push({
      id: 'tenant-name-short',
      severity: 'critico',
      rule: 'Nome do Tenant Inválido',
      message: 'O nome da empresa está ausente ou excessivamente curto.',
      suggestion: 'Defina o nome comercial oficial da marca.',
    });
  }

  // 3. Endereço e Presença Local
  if (!settings.address_summary) {
    issues.push({
      id: 'tenant-address-missing',
      severity: 'importante',
      rule: 'Endereço Local Ausente',
      message: 'Não há endereço físico ou cidade declarados.',
      suggestion: 'Adicione a cidade e área de atendimento para fortalecer a indexação em buscas locais no Google Maps.',
    });
  }

  // 4. Canais de Contato Direto
  if (!settings.contact_phone && !settings.contact_whatsapp) {
    issues.push({
      id: 'tenant-contact-missing',
      severity: 'critico',
      rule: 'Telefone ou WhatsApp Ausentes',
      message: 'Nenhum número de telefone ou WhatsApp está configurado para o estabelecimento.',
      suggestion: 'Configure ao menos um telefone de contato para exibição nos snippets de busca e Schema.org.',
    });
  }

  // 5. Logotipo Oficial (Branding)
  if (!branding?.logo_url) {
    issues.push({
      id: 'tenant-logo-missing',
      severity: 'importante',
      rule: 'Logotipo Oficial Ausente',
      message: 'Não há logotipo oficial cadastrado no branding.',
      suggestion: 'Envie o logotipo para enriquecer o Schema.org e a identidade visual nos resultados de pesquisa.',
    });
  }

  // 6. Horários de Atendimento
  const hasHours = settings.business_hours && Object.keys(settings.business_hours).length > 0;
  if (!hasHours) {
    issues.push({
      id: 'tenant-hours-missing',
      severity: 'recomendacao',
      rule: 'Horários de Atendimento Não Informados',
      message: 'Não há horários de atendimento configurados.',
      suggestion: 'Cadastre os dias e horários de funcionamento do estabelecimento.',
    });
  }

  // 7. Redes Sociais
  if (!settings.instagram_handle) {
    issues.push({
      id: 'tenant-social-missing',
      severity: 'recomendacao',
      rule: 'Perfil Social Ausente',
      message: 'Não há perfil do Instagram ou redes sociais configurado.',
      suggestion: 'Vincule as redes sociais oficiais para sinalizar autoridade e presença multicanal.',
    });
  }

  // 8. Cálculo de pontuação
  let score = 100;
  for (const issue of issues) {
    if (issue.severity === 'critico') score -= 25;
    else if (issue.severity === 'importante') score -= 10;
    else if (issue.severity === 'recomendacao') score -= 4;
  }
  score = Math.max(0, Math.min(100, score));

  let status: TenantSeoAuditReport['status'] = 'excelente';
  if (score < 50) status = 'critico';
  else if (score < 75) status = 'precisa_atencao';
  else if (score < 90) status = 'bom';

  return {
    score,
    status,
    issues,
    configuredType: businessType,
  };
}
