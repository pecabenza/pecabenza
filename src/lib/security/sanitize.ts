/**
 * Módulo de Sanitização e Proteção contra XSS
 * Limpa entradas de formulários e APIs antes de persistência ou renderização.
 */

/**
 * Escapa caracteres HTML perigosos para prevenir ataques de Cross-Site Scripting (XSS).
 */
export function escapeHtml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Remove tags HTML e scripts de uma string para garantir texto puro.
 */
export function stripHtmlTags(str: string): string {
  if (!str) return '';
  return str.replace(/<[^>]*>?/gm, '').trim();
}

/**
 * Sanitiza um texto simples removendo tags, limitando tamanho e normalizando espaços.
 */
export function sanitizePlainText(input: unknown, maxLength = 500): string {
  if (typeof input !== 'string') return '';
  const stripped = stripHtmlTags(input);
  return stripped.substring(0, maxLength).trim();
}

/**
 * Sanitiza e valida formato de e-mail básico.
 */
export function sanitizeEmail(email: unknown): string {
  if (typeof email !== 'string') return '';
  return email.trim().toLowerCase().substring(0, 255);
}

/**
 * Sanitiza um número de telefone mantendo apenas números, +, (, ), -, e espaços.
 */
export function sanitizePhone(phone: unknown): string {
  if (typeof phone !== 'string') return '';
  return phone.replace(/[^0-9+\-()\s]/g, '').trim().substring(0, 30);
}
