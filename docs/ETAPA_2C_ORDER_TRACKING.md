# ETAPA 2C — STATUS E ACOMPANHAMENTO DO PEDIDO (RELATÓRIO DE GATE & ARQUITETURA)

**Data:** 07/11/2026  
**Ambiente:** `staging`  
**Endpoint Supabase:** `https://zmirilugwaffgnnxhxkr.supabase.co`  
**Veredito:** **GO PARA PRÓXIMA FASE (ETAPA 2C CONCLUÍDA E HOMOLOGADA REMOTAMENTE)**

---

## 1. Fechamento das Ressalvas Formais da Etapa 2B.1

1. **Confirmação do Build de Produção:**
   - O comando `pnpm build` foi executado e compilou com **código de saída 0 (sucesso total)**. Todas as rotas de storefront, checkout, tracking público (`/pedido/[publicToken]`), webhook e painel administrativo (`/admin/pedidos`) foram validadas e otimizadas em modo standalone.
2. **Versionamento Criptográfico de Chave/Algoritmo:**
   - O utilitário [`src/lib/security/encryption.ts`](file:///f:/projetos/pecabenza/src/lib/security/encryption.ts) foi aprimorado para armazenar o prefixo de versão:
     ```text
     v1:iv_hex:auth_tag_hex:encrypted_hex
     ```
   - O decifrador suporta a versão ativa (`v1`) e mantém retrocompatibilidade com eventuais registros legados sem prefixo, permitindo rotação transparente de chaves criptográficas sem quebrar dados existentes.

---

## 2. Arquitetura da Etapa 2C (Domínio & Operações)

### 2.1 Separação Canônica de Status
O sistema agora desacopla estritamente o status financeiro do status operacional do restaurante:
- **`PaymentStatus`:** `'pending'`, `'processing'`, `'paid'`, `'failed'`, `'expired'`, `'cancelled'`, `'refunded'`.
- **`OrderStatus` (Operacional):**
  - `pending`: Pedido recebido na plataforma, aguardando liquidação ou aceite.
  - `confirmed`: Pagamento confirmado ou pedido aprovado pelo restaurante.
  - `preparing`: Em preparação na cozinha.
  - `ready`: Pronto (aguardando motoboy para delivery ou cliente para retirada).
  - `out_for_delivery`: Despachado e a caminho do endereço (apenas para delivery).
  - `delivered`: Entregue ao cliente ou retirado no balcão (estado terminal).
  - `cancelled`: Pedido cancelado (estado terminal).

### 2.2 Máquina de Estados Centralizada ([`order-status.machine.ts`](file:///f:/projetos/pecabenza/src/modules/orders/order-status.machine.ts))
As transições operacionais são controladas por uma matriz centralizada de estados válidos:
- `pending` → `confirmed`, `cancelled`
- `confirmed` → `preparing`, `cancelled`
- `preparing` → `ready`, `cancelled`
- `ready` → `out_for_delivery` (somente delivery), `delivered` (pickup ou delivery), `cancelled`
- `out_for_delivery` → `delivered`, `cancelled`
- `delivered` / `cancelled` → Estados terminais imutáveis.
- **Regra de Retirada (Pickup):** Pedidos de retirada não podem transicionar para `out_for_delivery`; são movidos diretamente de `ready` para `delivered`.
- **Regra Financeira:** A confirmação de pagamento Pix (`paid`) transiciona o pedido para `confirmed`, e **não** para `preparing`. O início da produção depende da ação da equipe da cozinha.

### 2.3 Migration 00010 ([`00010_order_tracking_and_events.sql`](file:///f:/projetos/pecabenza/supabase/migrations/00010_order_tracking_and_events.sql)) — HOMOLOGADA NO BANCO REAL
- **Tabela `order_status_events` (Histórico Imutável):**
  - Registra cada transição com `tenant_id`, `order_id`, `from_status`, `to_status`, `source` (`system`, `admin`, `payment_webhook`, `delivery_provider`, `driver`), `actor_user_id`, `metadata` e `created_at`.
  - **Trigger Anti-Tampering:** Bloqueia qualquer tentativa de `UPDATE` ou `DELETE` na tabela de eventos, garantindo trilha de auditoria append-only.
- **Token Público Seguro (`public_tracking_token`):**
  - Coluna única não-sequencial de 48 caracteres hexadecimais gerados criptograficamente (`crypto.randomBytes(24)`). O número do pedido (`#000101`) nunca é a única chave de acesso.
- **RPC `update_order_status_atomic`:**
  - Valida a máquina de estados no banco com lock pessimista (`FOR UPDATE`), atualiza `orders.status` e insere o evento em uma única transação atômica.
- **RLS:** Isolamento multi-tenant ativo.

### 2.4 Acompanhamento Público Seguro ([`/pedido/[publicToken]`](file:///f:/projetos/pecabenza/src/app/(storefront)/pedido/[publicToken]/page.tsx))
- Rota acessível sem login via token seguro não-enumerável.
- **Proteção Estrita contra Vazamento de PII:**
  - Nome mascarado (ex: `Carlos S.`).
  - Telefone mascarado (ex: `(11) 9****-1234`).
  - E-mail e IDs internos omitidos.
  - Endereço resumido por logradouro e bairro, sem exibir número de residência ou complemento.
- **Timeline Visual ([`OrderTimeline`](file:///f:/projetos/pecabenza/src/components/orders/OrderTimeline.tsx)):**
  - Exibição sequencial com ícones temáticos (Relógio, Check, Chapéu de Chef, Moto/Loja, Pacote).
  - Horários reais registrados nos eventos históricos (ex: `10:32`, `10:38`).
  - Polling resiliente a cada 6 segundos, interrompido automaticamente quando o pedido atinge estado terminal (`delivered` ou `cancelled`).

### 2.5 Painel Administrativo de Pedidos
- **Visão em Lista ([`/admin/pedidos`](file:///f:/projetos/pecabenza/src/app/(tenant-admin)/admin/pedidos/page.tsx)):** Tabela com filtros por status (Novos, Confirmados, Em Preparo, Prontos, A Caminho, Entregues, Cancelados), badges de pagamento e agendamento.
- **Detalhe do Pedido ([`/admin/pedidos/[id]`](file:///f:/projetos/pecabenza/src/app/(tenant-admin)/admin/pedidos/[id]/page.tsx)):** Resumo completo de itens, cliente, endereço, dados de pagamento e histórico de auditoria.
- **Botões Dinâmicos de Ação:** O painel renderiza **apenas as transições permitidas pela máquina de estados** para o estado atual do pedido.
- **Cancelamento com Justificativa:** Captura do motivo e marcação de `requires_manual_refund` se o pedido já estiver pago (sem cancelamento silencioso ou estorno desgovernado).

---

## 3. Métricas de Homologação e Qualidade

| Verificação | Escopo | Resultado |
|---|---|---|
| **TypeScript Typecheck** | `pnpm typecheck` (`tsc --noEmit`) | **0 erros** |
| **Testes Locais Vitest** | `pnpm test` (18 suítes de teste) | **120 / 120 aprovados** |
| **Suíte de Staging Remota Completa** | `tests/staging/*.test.ts` (11 suítes contra Supabase real) | **41 / 41 aprovados** |
| **Migration 00010 no Banco Real** | `tests/staging/migration-00010.test.ts` (Trigger Anti-Tampering, RPC, Token) | **4 / 4 aprovados** |
| **Compilação de Produção Next.js** | `pnpm build` | **Sucesso (0 erros, standalone)** |

---

## 4. Veredito Final

A **Etapa 2C — Status e Acompanhamento do Pedido** está 100% homologada localmente e no banco de dados real.

### **GO PARA A PRÓXIMA FASE**
*(Opções disponíveis: **Etapa 2C.1 Operacional Simples / Ajustes Finos de Painel** ou **Etapa 2D — Pagamentos Cartão**)*
