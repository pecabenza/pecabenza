# ETAPA 2A.1 — HOMOLOGAÇÃO TRANSACIONAL REMOTA (RELATÓRIO DE GATE)

**Data:** 04/11/2026  
**Ambiente:** `staging`  
**Supabase Endpoint:** `https://zmirilugwaffgnnxhxkr.supabase.co`  
**Veredito:** **GO PARA ETAPA 2B — PAGAMENTOS**

---

## 1. Conectividade e Saúde do Supabase Remoto

- **Resolução DNS:** Sucesso (`zmirilugwaffgnnxhxkr.supabase.co` resolvido com IP válido).
- **HTTPS & Handshake:** Sucesso (HTTP 200 via `auth/v1/health` e PostgREST).
- **Isolamento de Secrets:** Nenhuma chave (`ANON_KEY`, `SERVICE_ROLE_KEY`) exposta em logs, relatórios ou stdout.
- **Tenants Operacionais Confirmados no Banco Real:**
  - **BENZA (Tenant 01):** `00000000-0000-0000-0000-000000000001` (slug: `benza`, domínio: `pecabenza.com.br`)
  - **Cacau & Flor (Tenant 02):** `00000000-0000-0000-0000-000000000002` (slug: `cacau-flor`, domínio: `cacauflor.com.br`)

---

## 2. Resolução das 4 Questões Arquiteturais Críticas

### 1. Atomicidade Real (RPC `create_order_atomic`)
- **Problema anterior:** Criação de pedido sequencial no cliente (`orders` -> `order_items` -> `order_addresses`) corria risco de deixar registros órfãos se a inserção de itens ou endereço falhasse.
- **Solução implementada:** Desenvolvida e aplicada a function PostgreSQL `public.create_order_atomic(p_order jsonb, p_items jsonb, p_address jsonb) RETURNS jsonb`.
- **Garantia:** Todo o fluxo (`tenant_order_counters` + `orders` + `order_items` + `order_addresses`) é executado dentro de uma única transação atômica nativa no PostgreSQL (`LANGUAGE plpgsql`).
- **Homologação:** Testada com injeção proposital de foreign key inválida em itens. O rollback foi completo: 0 registros de pedido, 0 itens e 0 endereços persistidos.

### 2. Concorrência Segura do Número do Pedido (`order_number`)
- **Problema anterior:** Contadores baseados em `count(*) + 1` sofrem de race conditions sob requisições simultâneas, gerando duplicações de `#000101`.
- **Solução implementada:** Criada a tabela `tenant_order_counters` com constraint única por tenant (`PRIMARY KEY (tenant_id)`). O incremento utiliza `INSERT ... ON CONFLICT (tenant_id) DO UPDATE SET last_order_number = tenant_order_counters.last_order_number + 1 RETURNING last_order_number`, garantindo row-level lock no PostgreSQL.
- **Homologação:** Executado teste de carga de 5 requisições assíncronas concorrentes simultâneas via `Promise.all`. Resultado: 5 números sequenciais únicos gerados, 0 colisões.

### 3. Simplificação Conceitual de `site_mode`
- **Problema anterior:** Havia 4 termos (`prelaunch`, `institutional`, `commerce`, `live`), sendo `live` redundante e gerando ambiguidade arquitetural.
- **Solução implementada:** Eliminado o alias `live`. O sistema possui agora exatamente 3 modos estritos tipados em `src/lib/tenancy/site-mode.ts` e no banco:
  - `'prelaunch'`: Modo vitrine de lançamento (banner de lançamento, botão "Pedir no WhatsApp", carrinho desabilitado).
  - `'institutional'`: Modo institucional (cardápio vitrine para consulta, checkout indisponível).
  - `'commerce'`: E-commerce completo (carrinho ativo, revalidação server-side, checkout `/checkout` liberado).

### 4. Transparência da Busca de CEP
- **Diagnóstico:** O checkout possui conveniência de preenchimento automático de endereço consumindo a API pública ViaCEP no evento `blur`.
- **Alinhamento:** Não é um motor interno de cotação ou geolocalização server-side. Se o ViaCEP estiver indisponível ou retornar erro, a interface não trava: os campos de rua, bairro, cidade e estado permanecem 100% editáveis pelo cliente final.

---

## 3. Auditoria Física da Migration `00008_commerce_orders.sql`

| Objeto de Banco | Tipo | Status Remoto | Validação |
|---|---|---|---|
| `tenant_commerce_settings` | Tabela | Ativo | Configurações de frete, pedido mínimo e delivery por tenant |
| `tenant_order_counters` | Tabela | Ativo | Controle de concorrência com lock em nível de linha |
| `orders` | Tabela | Ativo | Cabeçalho do pedido com FK `tenant_id` e check constraints |
| `order_items` | Tabela | Ativo | Itens recalculados server-side com FKs em cascata |
| `order_addresses` | Tabela | Ativo | Endereço de entrega com integridade referencial 1:1 |
| `create_order_atomic` | Function RPC | Ativo | Execução atômica transacional no PostgreSQL |
| RLS Policies | Segurança | Ativo | Isolamento estrito entre Tenant 01 e Tenant 02 |

---

## 4. Métricas de Testes e Homologação

| Suíte | Escopo | Total de Testes | Status |
|---|---|---|---|
| `tests/staging/migration-00008.test.ts` | Homologação Remota (RPC, Rollback, Concorrência, RLS) | 5 / 5 | **APROVADO** |
| `tests/staging/*.test.ts` | Suíte Remota Completa (Supabase Real) | 33 / 33 | **APROVADO** |
| `pnpm typecheck` | TypeScript Compiler (`tsc --noEmit`) | 0 erros | **APROVADO** |
| `pnpm test` | Testes Unitários e Integração Local | 97 / 97 | **APROVADO** |
| `pnpm build` | Compilação de Produção Next.js | Standalone Build | **APROVADO** |

---

## 5. Veredito Final: GO PARA ETAPA 2B

A fundação transacional de pedidos e checkout está homologada no banco de dados real com atomicidade garantida, prevenção de condições de corrida em concorrência e isolamento multi-tenant validado.

O sistema está apto para o início da **Etapa 2B — Pagamentos (Integração Pix & Gateways)**.

