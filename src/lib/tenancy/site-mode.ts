import type { SiteMode } from '@/types/database.types';

/**
 * Matriz Semântica de Modos de Operação do Tenant:
 * 
 * 1. 'prelaunch':
 *    Catálogo visual em preparação. Exibe aviso de lançamento futuro e botão
 *    de contato/WhatsApp. Carrinho e checkout desabilitados.
 * 
 * 2. 'institutional':
 *    Catálogo vitrine para restaurantes/estabelecimentos que não vendem online.
 *    Apresenta pratos, ficha técnica e instruções sem sacola de compras.
 * 
 * 3. 'commerce':
 *    E-commerce ativo. Permite adicionar à sacola, validação em tempo real de
 *    preços no servidor, cálculo de taxa de entrega e finalização de pedidos.
 */
export function isCommerceEnabled(siteMode?: SiteMode | null): boolean {
  return siteMode === 'commerce';
}

/**
 * Retorna mensagem orientativa quando o comércio eletrônico estiver desabilitado.
 */
export function getCommerceDisabledMessage(siteMode?: SiteMode | null): string {
  if (siteMode === 'prelaunch') {
    return 'Nosso cardápio está em fase de pré-lançamento. Os pedidos online serão abertos em breve!';
  }
  return 'Este estabelecimento opera atualmente apenas em modo institucional/demonstrativo sem pedidos online.';
}
