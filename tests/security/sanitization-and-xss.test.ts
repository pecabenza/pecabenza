import { describe, it, expect } from 'vitest';
import {
  escapeHtml,
  stripHtmlTags,
  sanitizePlainText,
  sanitizeEmail,
  sanitizePhone,
} from '../../src/lib/security/sanitize';

describe('Sanitização de Entradas e Proteção contra XSS', () => {
  it('deve escapar caracteres especiais perigosos com escapeHtml', () => {
    const malicious = '<script>alert("XSS & attack")</script>';
    const escaped = escapeHtml(malicious);
    expect(escaped).toBe('&lt;script&gt;alert(&quot;XSS &amp; attack&quot;)&lt;/script&gt;');
    expect(escaped).not.toContain('<script>');
  });

  it('deve remover completamente tags HTML com stripHtmlTags', () => {
    const html = '<p>Olá <strong>Mundo</strong> <a href="http://evil.com">link</a></p>';
    const clean = stripHtmlTags(html);
    expect(clean).toBe('Olá Mundo link');
  });

  it('deve neutralizar injeções de imagem onerror no sanitizePlainText', () => {
    const payload = '<img src=x onerror="alert(document.cookie)">João Silva';
    const clean = sanitizePlainText(payload, 100);
    expect(clean).toBe('João Silva');
    expect(clean).not.toContain('onerror');
    expect(clean).not.toContain('<img');
  });

  it('deve normalizar e sanitizar endereços de e-mail', () => {
    const dirty = '  CLIENTE.Benza@Empresa.COM.br  ';
    const clean = sanitizeEmail(dirty);
    expect(clean).toBe('cliente.benza@empresa.com.br');
  });

  it('deve filtrar caracteres não permitidos em números de telefone', () => {
    const dirty = '+55 (11) 98765-4321; DROP TABLE users;';
    const clean = sanitizePhone(dirty);
    expect(clean).toBe('+55 (11) 98765-4321');
    expect(clean).not.toContain('DROP');
  });
});
