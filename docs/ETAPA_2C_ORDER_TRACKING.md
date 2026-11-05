# ETAPA 2C — STATUS E ACOMPANHAMENTO DO PEDIDO (RELATÓRIO DE GATE & ARQUITETURA)

**Data:** 05/11/2026  
**Ambiente:** `staging`  
**Endpoint Supabase:** `https://zmirilugwaffgnnxhxkr.supabase.co`  
**Veredito:** **APROVADO (ETAPA 2C IMPLEMENTADA COM SUCESSO)**

---

## 1. Fechamento das Ressalvas Formais da Etapa 2B.1

1. **Confirmação do Build de Produção:**
   - O comando `pnpm build` foi executado com código de saída 0 (**sucesso total**). Todas as rotas de storefront, checkout, webhook e painel administrativo foram compiladas e estaticamente otimizadas.
2. **Versionamento Criptográfico de Chave/Algoritmo:**
   - O módulo [`src/lib/security/encryption.ts`](file:///f:/projetos/pecabenza/src/lib/security/encryption.ts) foi atualizado para gerar e validar o cabeçalho de versão no ciphertext:
     `v1:iv_hex:auth_tag_hex:encrypted_hex`
   - O decifrador suporta tanto a versão ativa (`v1`) quanto o formato legado sem prefixo, permitindo rotação futura de chaves sem descontinuidade para os tenants cadastrados.

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

### 2.2 Máquina de Estados Centralizada (`order-status.machine.ts`)
As transições operacionais são controladas por uma matriz centralizada de estados válidos:
- `pending` → `confirmed`, `cancelled`
- `confirmed` → `preparing`, `cancelled`
- `preparing` → `ready`, `cancelled`
- `ready` → `out_for_delivery` (somente delivery), `delivered`, `cancelled`
- `out_for_delivery` → `delivered`, `cancelled`
- `delivered` / `cancelled` → Estados terminais imutáveis.
- **Regra de Retirada (Pickup):** Pedidos de retirada não podem transicionar para `out_for_delivery`; são movidos diretamente de `ready` para `delivered`.
- **Regra Financeira:** A confirmação de pagamento Pix (`paid`) transiciona o pedido para `confirmed`, e **não** para `preparing`. O início da produção depende da ação da equipe da cozinha.

### 2.3 Migration 00010 (`00010_order_tracking_and_events.sql`)
- **Tabela `order_status_events` (Histórico Imutável):**
  - Registra cada transição com `tenant_id`, `order_id`, `from_status`, `to_status`, `source` (`system`, `admin`, `payment_webhook`, `delivery_provider`, `driver`), `actor_user_id`, `metadata` e `created_at`.
  - **Trigger Anti-Tampering:** Bloqueia qualquer tentativa de `UPDATE` ou `DELETE` na tabela de eventos, garantindo trilha de auditoria append-only.
- **Token Público Seguro (`public_tracking_token`):**
  - Coluna única não-sequencial de 48 caracteres hexadecimais gerados criptograficamente (`crypto.randomBytes(24)`). O número do pedido (`#000101`) nunca é a única chave de acesso.
- **RPC `update_order_status_atomic`:**
  - Valida a máquina de estados no banco com lock pessimista (`FOR UPDATE`), atualiza `orders.status` e insere o evento em uma única transação atômica.
- **RLS:** Isolamento multi-tenant ativo.

### 2.4 Acompanhamento Público Seguro (`/pedido/[publicToken]`)
- Rota acessível sem login via token seguro não-enumerável.
- **Proteção Estrita contra Vazamento de PII:**
  - Nome mascarado (ex: `Carlos S.`).
  - Telefone mascarado (ex: `(11) 9****-1234`).
  - E-mail e IDs internos omitidos.
  - Endereço resumido por logradouro e bairro, sem exibir número de residência ou complemento.
- **Timeline Visual (`OrderTimeline`):**
  - Exibição sequencial com ícones temáticos (Relógio, Check, Chapéu de Chef, Moto/Loja, Pacote).
  - Horários reais registrados nos eventos históricos (ex: `10:32`, `10:38`).
  - Polling resiliente a cada 6 segundos, interrompido automaticamente quando o pedido atinge estado terminal (`delivered` ou `cancelled`).

### 2.5 Painel Administrativo de Pedidos (`/admin/pedidos`)
- **Visão em Lista (`/admin/pedidos`):**
  - Tabela com número, horário, cliente, modalidade, valor total, status de pagamento, status operacional e indicação de pedidos agendados.
  - Filtros rápidos por status (Todos, Aguardando, Confirmados, Em Preparo, Prontos, A Caminho, Entregues, Cancelados).
- **Detalhe e Ações Operacionais (`/admin/pedidos/[id]`):**
  - Resumo de itens, porções, quantidades, observações do cliente, endereço completo e dados do pagamento.
  - Timeline de auditoria com histórico de quem realizou cada alteração.
  - **Botões Dinâmicos de Ação:** O painel renderiza **apenas as transições permitidas pela máquina de estados** para o estado atual do pedido.
  - Cancelamento com captura de justificativa e marcação de `requires_manual_refund` se o pedido já estiver pago.

---

## 3. Métricas de Homologação e Qualidade

| Verificação | Escopo | Resultado |
|---|---|---|
| **TypeScript Typecheck** | `pnpm typecheck` (`tsc --noEmit`) | **0 erros** |
| **Testes Locais Vitest** | `pnpm test` (18 suítes de teste) | **120 / 120 aprovados** |
| **Testes Remotos Staging** | `tests/staging/migration-00009.test.ts` | **4 / 4 aprovados** |
| **Compilação de Produção Next.js** | `pnpm build` | **Sucesso (0 erros, standalone)** |

---

## 4. Próximo Passo para Go-Live da Etapa 2C

A migration `supabase/migrations/00010_order_tracking_and_events.sql` está criada e pronta para ser aplicada individualmente no Supabase SQL Editor.

Após a execução da migration pelo usuário no painel do Supabase, o teste `pnpm vitest run tests/staging/migration-00010.test.ts` pode ser rodado para validar o trigger de imutabilidade e a RPC remota.

