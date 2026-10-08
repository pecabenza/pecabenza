# Política de Segurança e Arquitetura de Defesa — SaaS SysFood

**Status:** Implementado e Homologado (Etapa 1C)  
**Versão:** 2.0  
**Data:** Outubro de 2026  
**Escopo:** Proteção Estrutural, Multi-Tenant Isolation, Headers, Rate Limiting e Sanitização

---

## 1. Princípios Fundamentais de Segurança

1. **Default-Deny em Todas as Tabelas:**
   - RLS (Row Level Security) ativo em 100% das tabelas públicas.
   - Qualquer consulta anônima ou autenticada sem política explícita de permissão é rejeitada pelo PostgreSQL.
2. **Defesa em Profundidade:**
   - **Camada 1 (HTTP/Edge):** Headers de segurança (CSP, HSTS, X-Frame-Options, Permissions-Policy) e Rate Limiting em memória.
   - **Camada 2 (Aplicação/Next.js):** Resolução de tenant estritamente autoritativa no servidor (`resolveTenantByHost`), sanitização de entradas contra XSS e validação estrita com Zod.
   - **Camada 3 (Banco de Dados):** Chaves compostas `(tenant_id, id)` e funções `SECURITY DEFINER` com `search_path` blindado.
3. **Prevenção Absoluta de Vazamento de Segredos:**
   - A chave `SUPABASE_SERVICE_ROLE_KEY` é de uso exclusivo no servidor (`createAdminClient()`). Nunca exposta ao bundle client-side.
   - Respostas de erro padronizadas (`createSafeErrorResponse`) ocultam stack traces, credenciais e comandos internos em runtime.
4. **Imutabilidade de Auditoria:**
   - A tabela `audit_logs` possui triggers nativos que bloqueiam sumariamente qualquer operação de `UPDATE` ou `DELETE`.

---

## 2. Headers de Segurança HTTP e Content-Security-Policy (CSP)

Configurados em [`next.config.ts`](file:///e:/projetos/sysfood/next.config.ts) e aplicados no [`middleware.ts`](file:///e:/projetos/sysfood/src/middleware.ts):

| Header HTTP | Valor Configurado | Proteção Proporcionada |
|---|---|---|
| **X-Frame-Options** | `DENY` | Prevenção total contra ataques de Clickjacking e incorporação em iframes maliciosos. |
| **X-Content-Type-Options** | `nosniff` | Impede navegadores de adivinhar o tipo MIME de arquivos carregados. |
| **Strict-Transport-Security** | `max-age=63072000; includeSubDomains; preload` | Força conexões HTTPS durante 2 anos em todos os subdomínios. |
| **Referrer-Policy** | `strict-origin-when-cross-origin` | Limita o envio de referrers para origens externas, preservando caminhos internos. |
| **Permissions-Policy** | `camera=(), microphone=(), geolocation=(), payment=(), usb=()` | Desativa recursos não utilizados do navegador para reduzir superfície de ataque. |
| **X-XSS-Protection** | `1; mode=block` | Ativa o filtro de proteção contra XSS reflexivo dos navegadores legados. |
| **X-DNS-Prefetch-Control** | `on` | Otimização controlada de resolução DNS. |

### Diretiva Content-Security-Policy (CSP)
```http
default-src 'self';
script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com https://www.google-analytics.com;
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
img-src 'self' data: blob: https: *.supabase.co res.cloudinary.com;
font-src 'self' https://fonts.gstatic.com data:;
connect-src 'self' https://*.supabase.co https://www.google-analytics.com https://analytics.google.com;
frame-ancestors 'none';
form-action 'self';
base-uri 'self';
upgrade-insecure-requests;
```

---

## 3. Rate Limiting e Proteção contra Abuso de APIs

Módulo: [`src/lib/security/rate-limit.ts`](file:///e:/projetos/sysfood/src/lib/security/rate-limit.ts)

| Recurso / Rota | Limite por IP | Janela de Tempo | Ação em Caso de Violação |
|---|---|---|---|
| **Login Administrativo (`/admin/login` POST)** | 5 requisições | 60 segundos | HTTP 429 Too Many Requests com `Retry-After`. Protege contra força bruta de senha. |
| **Captura de Leads e Contato (`/api/leads`)** | 5 requisições | 60 segundos | HTTP 429. Previne spam e injeção massiva de contatos. |
| **Upload de Arquivos (`/api/upload`)** | 10 uploads | 60 segundos | HTTP 429. Previne saturação de storage e exaustão de rede. |
| **Auditoria SEO (`/api/seo/audit`)** | 20 consultas | 60 segundos | HTTP 429. Previne DoS em geração de relatórios de saúde. |
| **Consentimentos LGPD (`/api/privacy/*`)** | 15 requisições | 60 segundos | HTTP 429. Previne chamadas automáticas repetitivas. |

---

## 4. Proteção e Blindagem de Uploads

Módulo: [`src/app/api/upload/route.ts`](file:///e:/projetos/sysfood/src/app/api/upload/route.ts)

1. **Validação de MIME Type:** Permitidos estritamente: `image/jpeg`, `image/png`, `image/webp`, `image/svg+xml`, `image/x-icon`.
2. **Bloqueio de Extensões Executáveis:** Rejeição sumária de arquivos com extensões perigosas:
   - `.exe`, `.sh`, `.bat`, `.cmd`, `.php`, `.phtml`, `.js`, `.mjs`, `.cjs`, `.ts`, `.py`, `.pl`, `.rb`, `.jar`, `.vbs`, `.msi`, `.bin`.
3. **Limite Rígido de Payload:** 5 MB máximo (5.242.880 bytes).
4. **Isolamento de Path:** `tenant-assets/{tenant_id}/{category}/{filename}`.
5. **Sanitização de Nome:** Geração de nomes com timestamp e hash criptográfico aleatório (`${baseName}-${timestamp}-${hash}.${ext}`).
6. **Autoridade do Servidor:** O `tenant_id` é obtido exclusivamente do host verificado, impedindo que um tenant sobrescreva mídias de outro.

---

## 5. Sanitização de Entradas e Prevenção de XSS

Módulo: [`src/lib/security/sanitize.ts`](file:///e:/projetos/sysfood/src/lib/security/sanitize.ts)

- **`escapeHtml(str)`**: Converte caracteres HTML perigosos (`&`, `<`, `>`, `"`, `'`) em entidades seguras.
- **`stripHtmlTags(str)`**: Remove tags completas de marcação e scripts para campos de texto puro.
- **`sanitizePlainText(str, maxLen)`**: Limpa tags e trunca o texto para evitar estouro de buffer.
- **`sanitizeEmail(email)`**: Normaliza para minúsculas e valida tamanho.
- **`sanitizePhone(phone)`**: Preserva apenas dígitos numéricos, parênteses e hífens.

---

## 6. Auditoria de Segredos e Variáveis de Ambiente

- **`.gitignore`:** Reforçado para bloquear estritamente `.env`, `.env.*`, `.env.local` e `.env.production`, exceto [`.env.example`](file:///e:/projetos/sysfood/.env.example).
- **Zero Secrets no Código:** Nenhuma credencial `service_role` ou chave privada reside em componentes client-side ou no repositório Git.
- **Logger com Redação Automática:** O módulo [`src/lib/observability/logger.ts`](file:///e:/projetos/sysfood/src/lib/observability/logger.ts) mascara automaticamente campos sensíveis (`password`, `token`, `secret`, `key`, `authorization`, `cookie`, `credit_card`) e pseudonimiza e-mails.

---

## 7. Funções de Banco e Isolamento PostgreSQL

- Funções auxiliares `is_tenant_member` e `has_tenant_role` declaradas com:
  ```sql
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path = public, auth
  STABLE
  ```
  Isso previne ataques de **Search Path Hijacking** onde um invasor cria funções em schemas temporários para sequestrar privilégios de superusuário.
