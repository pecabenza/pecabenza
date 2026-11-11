# ETAPA 3C — Pedido Rápido e Atendimento Multicanal (PDV / WhatsApp / Telefone / Balcão)

## 1. Visão Geral e Decisão Arquitetural

A **Etapa 3C** adiciona o módulo de **Pedido Rápido e Atendimento Multicanal (`/admin/pedido-rapido`)** ao SaaS multi-tenant BENZA.

Todos os canais de venda convergem para o **mesmo motor transacional e operacional (`public.orders`)**, sem sistemas paralelos:

- `website`: pedidos criados pelo cliente no cardápio digital público;
- `whatsapp`: pedidos recebidos no atendimento via WhatsApp e lançados pelo operador;
- `phone`: pedidos recebidos por ligação telefônica;
- `counter`: pedidos presenciais lançados no balcão/caixa;
- `admin`: pedidos internos/administrativos.

---

## 2. Evolução do Banco de Dados (`00013_quick_order_multichannel.sql`)

### 2.1 Novas Colunas e Constraints em `public.orders`
- `order_channel varchar(30) NOT NULL DEFAULT 'website'` (`'website' | 'whatsapp' | 'phone' | 'counter' | 'admin'`);
- `payment_method varchar(30) NOT NULL DEFAULT 'pix'` (`'pix' | 'cash' | 'card_on_delivery' | 'pos_card' | 'credit_card'`);
- `cash_change_for_cents integer` (`NULL` ou `>= 0`);
- `created_by_user_id uuid` (operador autenticado que registrou o pedido rápido);
- `idempotency_key varchar(100)` com índice único parcial `uq_orders_tenant_idempotency` em `(tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL`;
- `fulfillment_type` expandido para suportar `'delivery' | 'pickup' | 'dine_in'` (Consumo no Local).

### 2.2 RPCs Atômicas e Auditadas
1. **`public.create_quick_order_atomic`**:
   - Verifica `idempotency_key` por `tenant_id` para evitar duplicidade em cliques repetidos;
   - Revalida todos os itens e calcula o subtotal diretamente a partir de `public.product_variants` e `public.products` do próprio `tenant_id` (impedindo manipulação de preço ou ataques cross-tenant);
   - Mantém `status` operacional (`'confirmed'` ou `'pending'`) **estritamente separado** de `payment_status` (`'pending'` vs `'paid'`);
   - Registra eventos imutáveis em `public.order_status_events` e trilha administrativa em `public.audit_logs` (`action = 'quick_order_created'`);
   - Quando criado com `p_initial_status = 'confirmed'`, aciona automaticamente `public.initialize_order_production_steps_atomic` para rotear os itens às estações do KDS Multiestação (`Cozinha Quente`, `Montagem`, `Expedição`).
2. **`public.confirm_manual_order_payment_atomic`**:
   - Permite que operadores autorizados confirmem manualmente o recebimento de pagamentos (`cash`, `pos_card`, `card_on_delivery` ou conferência manual), gravando auditoria obrigatória em `public.audit_logs` (`action = 'manual_payment_confirmed'`).

---

## 3. Segurança Financeira e Regras de Negócio

1. **Autoridade Exclusiva do Servidor**: O backend nunca confia em preços, subtotais, descontos ou `tenant_id` vindos do navegador.
2. **Separação Pedido vs Pagamento**:
   - Um pedido rápido pode nascer `status = 'confirmed'` (para iniciar o preparo na cozinha imediatamente) com `payment_status = 'pending'` (aguardando pagamento Pix ou pagamento na entrega).
   - **Proibição de Confirmação Falsa de Pix**: Pedidos com `paymentMethod = 'pix'` nunca nascem como `paid` automaticamente; o QR Code Pix real/mock configurado para o tenant é gerado via `PaymentService.createPixPayment`, e a liquidação ocorre via webhook ou ação manual auditada.
3. **Alçada de Desconto**:
   - Descontos até 20% do subtotal podem ser aplicados por `tenant_manager` ou `tenant_admin`;
   - Descontos superiores a 20% exigem obrigatoriamente perfil `tenant_admin`.

---

## 4. Experiência Operacional (`/admin/pedido-rapido`)

- **Busca Inteligente de Clientes Recorrentes**: Ao digitar 3+ dígitos do telefone ou letras do nome, o sistema consulta os pedidos anteriores do mesmo tenant e preenche automaticamente nome, telefone e último endereço de entrega.
- **Modo Balcão Ágil**: Permite gerar identificação rápida (`Balcão #...` ou mesa) sem exigir telefone ou endereço quando a modalidade é `Retirada` ou `Consumo Local`.
- **Pós-Pedido Multicanal em 1 Clique**:
  - Exibição imediata do **QR Code Pix** e botão **Copiar Pix Copia e Cola**;
  - Resumo formatado para **WhatsApp** com link público de rastreamento (`/pedido/[publicTrackingToken]`) e botão de envio direto (`wa.me`);
  - **Impressão Térmica no Navegador (`58mm` e `80mm`)** com seleção entre **Comanda Completa (Cliente/Expedição)** e **Comandas de Cozinha / Estação** (`Cozinha Geral`, `Cozinha Quente`, `Montagem`, `Expedição`).



---

## 5. Homologação e Relatório de Gates (100% Aprovado)

| Validação | Escopo | Resultado | Detalhes |
| :--- | :--- | :--- | :--- |
| **TypeScript (`pnpm typecheck`)** | Global | **0 erros** | Sem erros de tipagem |
| **Testes Unitários Locais (`pnpm test`)** | Local | **158/158 aprovados** | 22/22 suítes locais com exit code 0 |
| **Build de Produção (`pnpm build`)** | Local | **Sucesso** | Exit code 0 (SSR, páginas dinâmicas e bundles) |
| **Migration Remota `00013`** | Supabase Staging | **4/4 aprovados** | Pedido Rápido, idempotência, separação status x financeiro e KDS |
| **Suíte de Staging Completa** | Supabase Staging | **55/55 aprovados** | 14/14 suítes remotas (`00001` a `00013`) sem qualquer regressão |
