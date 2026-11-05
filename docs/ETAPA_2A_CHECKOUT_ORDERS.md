# ETAPA 2A — CHECKOUT BASE + PEDIDO TRANSACIONAL

**Status do Gate:** `GO PARA ETAPA 2B — PAGAMENTOS`  
**Data da Auditoria:** 2026-11-03  
**Plataforma:** SysFood Multi-Tenant SaaS  
**Tenant de Referência:** BENZA (`00000000-0000-0000-0000-000000000001`)

---

## 1. Resumo Executivo da Etapa 2A

A Etapa 2A estabeleceu a **fundação transacional de pedidos e o checkout base** da plataforma de comércio, com observância estrita da regra mandatória: **o navegador e o `localStorage` NUNCA são fontes de verdade para preços, produtos, variantes ou cálculos financeiros**.

Nenhum gateway de pagamento real (Pix ou Cartão) foi acoplado nesta etapa, mantendo o escopo estritamente focado em integridade contratual, persistência atômica, cálculo autoritativo server-side, modalidade de recebimento, agendamento e segurança multi-tenant.

---

## 2. Regra Crítica: Servidor como Única Autoridade de Preço

O frontend envia exclusivamente identificadores e quantidades desejadas:
```json
{
  "items": [
    {
      "productId": "00000000-0000-0000-0000-000000000101",
      "variantId": "var-01",
      "quantity": 2,
      "clientPriceInCents": 4800
    }
  ]
}
```

O servidor executa o seguinte fluxo determinístico:
1. **Resolução de Tenancy:** Obtém o tenant autoritativo pelo header da requisição (`x-tenant-host` / `host`).
2. **Consulta Autoritativa:** Busca `products` e `product_variants` vinculados ao `tenant_id`.
3. **Verificação de Status e Disponibilidade:** Rejeita pratos inativos (`status != 'active'`) e porções esgotadas (`is_available = false`).
4. **Isolamento Cross-Tenant:** Rejeita variantes pertencentes a outros estabelecimentos.
5. **Recálculo de Preço:** Substitui qualquer valor informado pelo cliente pelo valor oficial do banco de dados (`unit_price_cents`).
6. **Detecção de Divergência:** Se `clientPriceInCents` divergir do preço do banco, emite aviso transparente:
   > *"O preço de 'Feijoada BENZA (500 ml)' foi atualizado de R$ 0,01 para R$ 48,00. Revise seu pedido."*
7. **Totalização em Centavos:** Calcula subtotal e total com precisão de inteiros (`subtotal_cents + delivery_fee_cents`), eliminando erros de ponto flutuante.

---

## 3. Endpoints Criados

| Endpoint | Método | Descrição | Segurança |
| :--- | :---: | :--- | :--- |
| `/api/checkout/validate` | `POST` | Revalida itens do carrinho contra o catálogo oficial, reporta alterações de preço e itens esgotados | Rate limit (30 req/min/IP), Zod, Server-side recalculation |
| `/api/orders` | `POST` | Criação transacional atômica de pedido (`orders`, `order_items`, `order_addresses`) | Rate limit (10 req/10min/IP), Zod, Sanitização anti-XSS |

---

## 4. Modelagem de Dados e Migration (`00008_commerce_orders.sql`)

A migration `00008_commerce_orders.sql` implementa:

1. **Ampliação do `site_mode`:** Suporte formal a `'prelaunch'`, `'institutional'`, `'commerce'`, `'live'`.
2. **Tabela `tenant_commerce_settings`:** Configurações por tenant para taxas de entrega, pedido mínimo, modalidades habilitadas e prazos estimados.
3. **Tabela `orders`:** Registro do pedido transacional com `order_number` amigável por tenant (`#000101`), `subtotal_cents`, `delivery_fee_cents`, `total_cents`, `status` (`pending`, `awaiting_payment`, `paid`, `cancelled`).
4. **Tabela `order_items`:** Snapshot comercial imutável do prato e da porção no exato momento da compra, isolado com foreign key composta segura contra cross-tenant.
5. **Tabela `order_addresses`:** Snapshot estruturado de endereço de entrega do pedido.
6. **Função `generate_next_order_number`:** Sequenciador por tenant para identificador amigável.
7. **Políticas de RLS:** Habilitadas em todas as 4 tabelas, garantindo que o Tenant 02 jamais consiga ler ou alterar pedidos do Tenant 01.

---

## 5. Experiência de Checkout (`/checkout`)

- **Mobile-First:** Otimizado para telas de 375px e 430px.
- **Seção 1 (Seus Dados):** Nome completo e WhatsApp com validação estruturada, sem forçar criação de conta prévia.
- **Seção 2 (Como Deseja Receber?):** Alternância fluida entre *Entrega* (taxa configurada por tenant e busca automática por CEP) e *Retirada* (isenção de taxa e orientações do ateliê culinário).
- **Seção 3 (Quando Deseja Receber?):** *Primeira Disponibilidade (ASAP)* ou *Agendamento*, com bloqueio no cliente e no servidor de datas passadas.
- **Seção 4 (Resumo e Revisão):** Itens com controles de quantidade, thumbnail, subtotal em tempo real e avisos imediatos de atualização de preço.
- **Acessibilidade do Carrinho (`CartDrawer`):** Tecla `Escape` para fechamento, atributos `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, foco automático no botão fechar e navegação por teclado.

---

## 6. Resultados da Validação Técnica

```bash
pnpm typecheck
# tsc --noEmit: 0 erros

pnpm test
# 16 test files passed (16)
# 97 passed (97)
# Duração: 53.60s

pnpm build
# Route (app)               Size     First Load JS
# ├ ƒ /checkout            8.44 kB  129 kB
# ├ ƒ /checkout/sucesso    2.6 kB   117 kB
# ├ ƒ /api/checkout/validate 187 B   102 kB
# ├ ƒ /api/orders          187 B    102 kB
# ✓ Compiled successfully (0 erros de compilação ou rotas)
```

---

## 7. Veredito

> [!NOTE]
> **GO PARA ETAPA 2B — PAGAMENTOS**  
> A camada de validação server-side, o modelo transacional de pedidos e o fluxo de checkout estão validados e prontos para receber a integração de pagamentos Pix (QR Code e chave copia-e-cola).

