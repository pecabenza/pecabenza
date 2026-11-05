# ETAPA 2B & 2B.1 — PAGAMENTOS PIX & HARDENING DE SEGURANÇA (RELATÓRIO DE GATE)

**Data:** 04/11/2026  
**Ambiente:** `staging`  
**Endpoint Supabase:** `https://zmirilugwaffgnnxhxkr.supabase.co`  
**Status:** **HOMOLOGADO COM SUCESSO (ETAPA 2B.1 HARDENING FINALIZADO)**  
**Veredito:** **GO PARA ETAPA 2C — STATUS E ACOMPANHAMENTO DO PEDIDO**

---

## 1. Resumo Executivo das Implementações de Hardening (Etapa 2B.1)

Em atendimento às diretrizes técnicas de segurança, finanças e conformidade com a documentação oficial do Asaas (2026), foram aplicados os seguintes endurecimentos:

### 1.1 Autenticação Estrita do Webhook Asaas (`asaas-access-token`)
- **Regra Oficial (fev/2026):** O Asaas exige um `authToken` específico configurado no painel de webhooks e transmitido no header HTTP `asaas-access-token`.
- **Separação Obrigatória:** O `authToken` é estritamente separado e independente da `apiKey`.
- **Proteção contra Uso Indevido da API Key:** O sistema valida e **rejeita com HTTP 401** qualquer tentativa de usar a `apiKey` privada como token de webhook.
- **Comparação Timing-Safe:** A verificação do token utiliza `timingSafeStringEqual` (`crypto.timingSafeEqual`) para mitigar ataques de canal lateral (timing attacks).
- **Validação de Integridade do Pedido:** O webhook não confia cegamente no payload. Ele confere tenant, ID do pagamento e integridade do valor (`amount_cents`). Divergências de quantia são bloqueadas com erro 400.

### 1.2 Idempotência Estrita & Modelo *At-Least-Once*
- Conforme a documentação oficial do Asaas, eventos de webhook podem ser reenviados pelo gateway caso haja instabilidade de rede (*at-least-once delivery*).
- A tabela `payment_webhook_events` possui constraint única composta `(tenant_id, provider, event_id)`.
- Requisições duplicadas são detectadas imediatamente pela RPC PostgreSQL `process_payment_webhook_atomic`, retornando HTTP 200 com `{ success: true, idempotent: true }` sem reexecutar mutações de pedidos, disparos de eventos ou alterações de saldo.

### 1.3 Resposta Rápida (Baixa Latência no Webhook)
- O processamento síncrono do webhook é restrito à autenticação, validação e execução da stored procedure atômica no banco de dados (tempo de execução medido: ~15 a 40ms).
- Ações demoradas ou dependentes de rede externa (futuros disparos de WhatsApp, e-mails de notificação, emissão de NF-e e logística) são desacopladas e **nunca bloqueiam** a resposta HTTP 200 do webhook.

### 1.4 Gestão Segura de Credenciais por Tenant (`tenant_payment_settings`)
- **Separação de Dados:**
  - *Dados Não Sensíveis (públicos/configuração):* `provider`, `is_active`, `pix_enabled`, `pix_expiration_minutes`, `sandbox_mode`.
  - *Segredos Criptografados:* `api_key_encrypted` e `webhook_secret` são armazenados sob criptografia **AES-256-GCM** com vetor de inicialização (IV) aleatório de 96 bits e tag de autenticação de 128 bits gerados por `src/lib/security/encryption.ts`.
- **Chave Mestre:** Mantida fora do banco de dados (via variável de ambiente/Secret Manager `PAYMENT_ENCRYPTION_KEY`).
- **Segurança de APIs e Logs:** APIs administrativas retornam apenas chaves mascaradas (ex: `****9999`) e flags booleanas (`hasApiKey`, `hasWebhookSecret`). Segredos em texto puro nunca são enviados ao frontend nem impressos em logs/stdout.

### 1.5 Rotação de Credenciais sem Migrations
- Implementada a função `PaymentService.updateTenantPaymentSettings(tenantId, ...)` que permite trocar API Key ou Webhook Token a qualquer momento, cifrando os novos valores e atualizando o `updated_at` sem necessidade de novas migrations.

### 1.6 Estratégia de Contas, Subcontas e BaaS Asaas
- **Modelo Inicial (BENZA):** Conexão direta com conta própria Asaas (via API Key e Webhook authToken individuais do restaurante).
- **Modelo SaaS Futuro:** Arquitetura preparada para criação de subcontas Asaas via API para novos tenants, com saldo e operação segregados.
- **BaaS (Banking-as-a-Service):** Registrado que a habilitação de BaaS não é automática e depende de alinhamento contratual, validação regulatória e aprovação formal prévia junto ao Asaas. Não foi implementado prematuramente.

### 1.7 Split de Pagamentos
- Mantida a separação arquitetural para recepção futura de `walletId` e taxas de split da plataforma SaaS. O recurso permanece desativado até formalização das subcontas.

### 1.8 Política de Taxas Comerciais
- Removida qualquer menção a valores fixos de tarifas ("R$ 0,99 a R$ 1,99").
- As tarifas Pix do Asaas são variáveis conforme o plano contratual, volume transacionado e modelo de conta do cliente (com isenções e faixas vigentes informadas na tabela oficial do Asaas). A documentação técnica orienta a consulta ao contrato vigente.

### 1.9 Política de Expiração do Pix
- **Expiração Interna (Checkout):** O sistema adota janela configurável por tenant (padrão de 15 minutos em `tenant_payment_settings.pix_expiration_minutes`).
- **Expiração Externa:** O Asaas recebe a data limite no campo `dueDate` / `pixQrCode`.
- Se a janela interna expirar, o sistema invalida a tentativa corrente no checkout e permite ao cliente gerar uma nova cobrança limpa, preservando o histórico da anterior no banco (`status = 'expired'`).

### 1.10 Otimização do Payload do QR Code
- O banco persiste como fonte canônica o código Copia e Cola (`pix_qr_code_text`), `provider_payment_id`, `amount_cents` e `pix_expires_at`.
- A geração da imagem gráfica base64 ou SVG é executada sob demanda pelo gerador `qrcode` (~2ms), eliminando inchaço desnecessário na tabela `payments`.

---

## 2. Métricas de Homologação e Qualidade

| Verificação | Escopo | Resultado |
|---|---|---|
| **TypeScript Typecheck** | `pnpm typecheck` (`tsc --noEmit`) | **0 erros** |
| **Testes Locais Vitest** | `pnpm test` (17 suítes de teste) | **111 / 111 aprovados** |
| **Testes Remotos de Staging** | `tests/staging/*.test.ts` (10 arquivos contra Supabase real) | **37 / 37 aprovados** |
| **Migration 00009 no Banco Real** | `tests/staging/migration-00009.test.ts` (RPC, Idempotência, RLS) | **4 / 4 aprovados** |
| **Build de Produção Next.js** | Standalone Build | **Aprovado (compilado com sucesso)** |

---

## 3. Veredito Final

A **Etapa 2B e o Hardening 2B.1** estão oficialmente concluídos e aprovados.

### **GO PARA ETAPA 2C — STATUS E ACOMPANHAMENTO DO PEDIDO**
*(A ser iniciada no próximo expediente)*
