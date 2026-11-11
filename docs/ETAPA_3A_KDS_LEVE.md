# ETAPA 3A — OPERATIONS ENGINE / KDS LEVE (RELATÓRIO DE HOMOLOGAÇÃO LOCAL E REMOTA)

**Data:** 08/11/2026  
**Ambiente:** `staging` / `production-ready`  
**Endpoint Supabase Remoto:** `https://zmirilugwaffgnnxhxkr.supabase.co`  
**Veredito:** **GO — ETAPA 3A HOMOLOGADA / LIBERADO PARA ETAPA 3B**

---

## 1. Resumo de Gate (Local & Remoto Separados)

### Local
- **Typecheck (`pnpm typecheck`):** **0 erros**
- **Testes Unitários e Segurança (`pnpm test`):** **140 / 140 aprovados** (20 suítes, incluindo **15/15** em [`tests/unit/kds-engine.test.ts`](file:///f:/projetos/pecabenza/tests/unit/kds-engine.test.ts))
- **Build de Produção (`pnpm build` — já aprovado anteriormente sem reexecução desnecessária):** **Sucesso (código 0, Next.js 15 App Router Standalone)**

### Remoto (Supabase Real `zmirilugwaffgnnxhxkr.supabase.co`)
- **Migration 00011 ([`00011_operations_kds_engine.sql`](file:///f:/projetos/pecabenza/supabase/migrations/00011_operations_kds_engine.sql)):** **Aplicada e homologada no banco real**
- **Teste Remoto Específico (`pnpm vitest run tests/staging/migration-00011.test.ts`):**
  - **Total de testes:** 5
  - **Aprovados:** **5 / 5**
  - **Falhas:** **0**
  - **Duração:** `6.31s` (`3835ms` de execução das suítes contra o banco remoto)
- **Suíte Remota de Staging Completa (`pnpm vitest run tests/staging/`):** **46 / 46 aprovados (12 arquivos de teste, migrations 00001 a 00011)**
- **RLS & Cross-Tenant:** Validado bidirecionalmente (`Tenant 01 x Tenant 02` e `Tenant 02 x Tenant 01`) + bloqueio de leitura anônima.
- **RPCs Atômicas:** `start_order_preparation_atomic`, `update_order_item_operation_atomic` e `complete_order_preparation_atomic` homologadas no PostgreSQL remoto.
- **Concorrência & Idempotência:** Simulação concorrente (`Promise.all`) de 2 operadores atuando no mesmo item comprovou lock pessimista (`FOR UPDATE`), `ON CONFLICT (tenant_id, order_item_id)` e emissão única do evento `item_ready`.
- **KDS Real (`listKdsOrders`):** Homologado contra pedidos reais no banco com SLA dinâmico por tenant, agendamento distante em hold (`isScheduledFutureHold = true`), ordenação real por prioridade (`Atrasado > Normal > Agendado Distante`) e **ausência total de PII desnecessária** (sem endereço, telefone ou e-mail).

---

## 2. Arquitetura do Motor de Operações e KDS Leve

### 2.1 Modelo de Dados e Preservação Comercial
1. **`public.tenant_commerce_settings` (SLA por Tenant):**
   - `target_confirmation_time_min` (default `5`), `target_preparation_time_min` (default `25`), `sla_warning_buffer_min` (default `5`), `schedule_preparation_buffer_min` (default `5`).
2. **`public.order_item_operations` (Checklist por Item):**
   - Preserva `order_items` (snapshot comercial) intacto;
   - Controla `preparation_status` (`pending` → `preparing` → `ready`), `started_at`, `completed_at`, `updated_by`;
   - Constraint `UNIQUE (tenant_id, order_item_id)` + FKs compostas cross-tenant.
3. **`public.order_operation_events` (Auditoria Operacional Imutável):**
   - Registra `item_started`, `item_ready`, `order_started`, `order_ready`, `priority_changed`, `sla_warning`, `sla_breached`;
   - Protegida pelo trigger `trg_prevent_order_operation_events_mutation` que rejeita `UPDATE` e `DELETE`.

### 2.2 Regras Operacionais Homologadas
- **Início de Preparo (`start_order_preparation_atomic`):** Transiciona `confirmed → preparing`, inicializa os itens do pedido como `preparing` com `started_at` e grava `order_started`.
- **Checklist Parcial e Proteção contra Conclusão Antecipada:**
  - Marcar 1 de 2 itens mantém `all_items_ready = false` e `orders.status = 'preparing'`;
  - Qualquer tentativa de chamar `complete_order_preparation_atomic` com item pendente é **rejeitada pelo banco**.
- **Todos os Itens Prontos + Confirmação do Operador:**
  - Quando todos os itens atingem `ready`, `all_items_ready` passa a `true`, mas `orders.status` **permanece `preparing`** até que o operador confirme explicitamente o CTA **"Pedido Pronto (Confirmar)"** (`complete_order_preparation_atomic` $\rightarrow$ `preparing → ready`).

### 2.3 Experiência KDS (`/admin/kds`) e Modo TV (`/admin/kds?mode=tv`)
- **3 Colunas de Cozinha:** `1. Confirmados (Fila)`, `2. Em Preparo (Fogão / Bancada)` e `3. Prontos (Expedição)`.
- **Modo TV (`/admin/kds?mode=tv`):** Remove sidebar e navegação administrativa, aplica alto contraste em tela cheia, cards maiores e botão claro **"Sair do Modo TV"**.
- **Modo Touch:** Alvos de toque confortáveis (`>= 48px`) no checklist de itens e nos CTAs principais.
- **Recuperação de Falhas de Conexão:** Se o polling falhar temporariamente, mantém o último estado visível na tela, exibe o indicador `Reconectando (mantendo último estado)` e reconcilia automaticamente quando a conexão retorna.
- **Gargalos e Métricas:** Exibe pedidos ativos, em preparo, atrasados, tempo médio de preparo hoje e ranking de itens gargalo (com proteção `"Dados insuficientes"` quando a amostra é pequena).

---

## 3. Veredito Final

**GO — ETAPA 3A HOMOLOGADA / LIBERADO PARA ETAPA 3B**
