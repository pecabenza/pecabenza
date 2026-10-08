# Arquitetura de Observabilidade, Logging Estruturado e Auditoria — SaaS SysFood

**Status:** Implementado e Homologado (Etapa 1C)  
**Versão:** 1.0  
**Data:** Outubro de 2026  
**Escopo:** Logs Estruturados, Redação de Segredos, Auditoria de Segurança e Core Web Vitals

---

## 1. Princípios da Observabilidade da Plataforma

1. **Logging Estruturado em JSON:**
   - Todos os logs gerados pelo servidor seguem formato JSON padronizado para ingestão em ferramentas de monitoramento (Vercel Logs, Datadog, Grafana/Loki ou CloudWatch).
2. **Redação Automática de Dados Sensíveis (Zero Secrets & Zero PII Leak):**
   - O módulo [`src/lib/observability/logger.ts`](file:///e:/projetos/sysfood/src/lib/observability/logger.ts) sanitiza recursivamente os payloads antes da escrita:
     - Campos como `password`, `token`, `secret`, `key`, `authorization`, `cookie`, `service_role` são substituídos por `[REDACTED]`;
     - E-mails são mascarados (ex: `jo***@exemplo.com`);
     - IPs brutos não são persistidos; utiliza-se hash SHA-256.
3. **Erros Opostos: Rastreabilidade Interna vs. Resposta Opaca ao Cliente:**
   - Para o desenvolvedor/servidor: É gerado um log completo com stack trace e contexto contextualizado.
   - Para o cliente HTTP: É retornado um `error_id` opaco e aleatório (ex: `err_1728345678_ab12c`) através de [`createSafeErrorResponse`](file:///e:/projetos/sysfood/src/lib/security/error-response.ts), sem jamais exibir consultas SQL ou caminhos do servidor.

---

## 2. Catálogo de Eventos Estruturados

| Tipo de Evento (`eventType`) | Nível | Descrição | Dados de Contexto Gravados |
|---|---|---|---|
| **`auth_success`** | `info` | Login de administrador bem-sucedido. | `tenantId`, `userId` |
| **`auth_failure`** | `warn` | Tentativa de login com credenciais inválidas. | `tenantId`, `ipHash` |
| **`rate_limit_exceeded`** | `warn` | Bloqueio de IP por excesso de requisições. | `prefix`, `ipHash`, `limit`, `windowSeconds` |
| **`security_violation`** | `warn` | Tentativa de upload com extensão proibida ou ataque XSS. | `tenantId`, `extension`, `path` |
| **`upload_success`** | `info` | Upload de imagem concluído e registrado no storage. | `tenantId`, `category`, `storagePath`, `byteSize` |
| **`upload_rejected`** | `warn` | Rejeição por formato MIME inválido ou payload `> 5MB`. | `tenantId`, `mimeType`, `size` |
| **`lead_created`** | `info` | Novo contato cadastrado em conformidade com LGPD. | `tenantId`, `sourcePage` |
| **`seo_audit`** | `info` | Auditoria de páginas executada com pontuação gerada. | `tenantId`, `overallScore` |
| **`api_error`** | `error` | Exceção não tratada capturada em rota de API. | `tenantId`, `path`, `errorId`, `statusCode` |

### Exemplo de Log JSON Estruturado
```json
{
  "timestamp": "2026-10-08T09:30:00.000Z",
  "level": "warn",
  "message": "Tentativa de envio de lead bloqueada por rate limit",
  "eventType": "rate_limit_exceeded",
  "ipHash": "a1b2c",
  "tenantId": "00000000-0000-0000-0000-000000000001"
}
```

---

## 3. Monitoramento de Core Web Vitals (CWV)

As métricas vitais de experiência do usuário são auditadas continuamente:

| Métrica Vital | Alvo Recomendado | Implementação Técnica na Plataforma |
|---|---|---|
| **LCP (Largest Contentful Paint)** | `< 2.5s` | Next.js Server Components, imagens com `priority` estrito no banner e CDN global. |
| **INP (Interaction to Next Paint)** | `< 200ms` | Mínimo de JavaScript na renderização inicial (HTML estático limpo). |
| **CLS (Cumulative Layout Shift)** | `< 0.1` | Dimensões (`aspect-ratio`, width/height) fixadas em todos os containers e imagens. |
| **TTFB (Time to First Byte)** | `< 800ms` | Cache de resolução de tenant em memória (TTL 60s) e consultas otimizadas. |
