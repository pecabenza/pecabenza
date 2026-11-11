# ETAPA 3D — Estoque de Congelados, Insumos, Ficha Técnica e Controle de Lotes

## 1. Visão Geral e Alinhamento Operacional

A **Etapa 3D** adiciona ao sistema SaaS multi-tenant BENZA a camada de **gestão de estoque físico e contábil**, **controle sanitário de lotes e validades (ANVISA/FEFO)**, **fichas técnicas versionadas (BOM)**, **ordens de produção com rendimento real** e **baixa definitiva com apuração do CMV**.

O módulo foi projetado para atender com precisão tanto à realidade de produção artesanal da BENZA (congelados em embalagens seláveis de feijoada, lasanhas, rabada e escondidinhos) quanto a operações de restaurantes que apenas revendem produtos acabados sem ficha técnica de produção própria.

---

## 2. Decisões Arquiteturais e Regras Fundamentais Implementadas

1. **Separação Rigorosa entre Insumos e Produtos Acabados**:
   - `inventory_raw_materials`: Estoque de matérias-primas e embalagens em unidades fracionárias (`kg`, `g`, `l`, `ml`, `un`, `pct`) com custo médio ponderado atualizado a cada recebimento.
   - `product_variants`: Produtos comercializáveis acabados em embalagens fechadas no freezer (ex: Feijoada 500 g, Feijoada 1 kg, Lasanha 1 kg).
   - Restaurantes sem produção própria podem gerenciar apenas os lotes de produtos acabados comercializáveis sem necessidade de cadastrar fichas técnicas.

2. **Produção Baseada no Rendimento Real**:
   - Fichas técnicas (`recipes` e `recipe_items`) definem o rendimento teórico esperado (ex: 40 embalagens de 500 g) e fator de correção ($FC = \frac{\text{peso bruto}}{\text{peso líquido}}$).
   - Ordens de produção (`production_orders`) registram o rendimento real envasado (ex: 38 potes), o consumo da equipe (ex: 1 pote) e eventuais perdas na panela/raspagem (ex: 1 pote), calculando desvio percentual auditado e justificativa.
   - O custo unitário da embalagem envasada é calculado com precisão centesimal:
     $$\text{Custo Unitário da Embalagem} = \frac{\text{Custo Total Real dos Insumos e Embalagens Consumidos}}{\text{Unidades Comerciais Envasadas}}$$

3. **Reserva de Estoque antes da Baixa Definitiva**:
   - Quando o pedido é confirmado (`confirmed`): aciona `reserve_order_inventory_atomic`, alocando produtos dos lotes ativos mais próximos do vencimento (**FEFO**).
   - Saldo físico = Total no freezer. Saldo disponível = Físico - Reservado.
   - Cancelamento do pedido: aciona `release_order_inventory_reservation_atomic`, liberando as reservas atômicas sem criar movimentações físicas ou financeiras indevidas.
   - Expedição ou entrega do pedido: aciona `commit_order_inventory_deduction_atomic`, convertendo a reserva em saída definitiva de venda (`sale_out`) e apurando o CMV real do pedido.

4. **Rastreabilidade Completa (Genealogia de Lotes)**:
   - Tabela `production_batch_inputs`: vincula cada lote de produto acabado diretamente aos lotes exatos de matérias-primas consumidas na batelada.
   - Em caso de recolhimento sanitário (recall), é possível identificar em segundos quais potes de congelados utilizaram determinado lote de matéria-prima e quais pedidos de clientes os receberam.

5. **Validade Configurável e Segurança Sanitária**:
   - Prazo de conservação configurável por ficha técnica (`shelf_life_days`), dispensando presunções genéricas.
   - Bloqueio automático de alocação de lotes com status `expired`, `quarantine` ou `discarded`.

6. **Imutabilidade e Trilha Contábil**:
   - `inventory_movements`: tabela *append-only* com trigger anti-tampering (`trg_prevent_inventory_movements_tampering`), proibindo `UPDATE` e `DELETE`.
   - Ajustes manuais de inventário exigem justificativa e geram trilha em `audit_logs` e `inventory_movements`.

---

## 3. Estrutura do Banco de Dados (`00014_inventory_recipe_and_batch_engine.sql`)

### 3.1 Novas Tabelas Criadas
- `public.inventory_raw_materials`: Insumos, embalagens, estoque mínimo e custo médio ponderado.
- `public.product_variant_stock_settings`: Configurações de controle de estoque por variante comercializável.
- `public.inventory_batches`: Lotes de matérias-primas e produtos congelados acabados com índice FEFO (`expiration_date ASC`).
- `public.recipes`: Fichas técnicas de pratos e receitas com rendimento esperado e validade a -18°C.
- `public.recipe_items`: Ingredientes da ficha técnica com pesos brutos, líquidos e unidades.
- `public.production_orders`: Ordens de produção interna com rendimento real e cálculo de custos.
- `public.production_batch_inputs`: Genealogia e rastreabilidade entre lotes de insumos e bateladas.
- `public.inventory_reservations`: Reservas atômicas por pedido antes da baixa física.
- `public.inventory_movements`: Trilha contábil imutável de todas as movimentações.

### 3.2 RPCs Atômicas Transacionais
1. `record_raw_material_receipt_atomic`: Entrada de insumo com lote, fornecedor e recálculo do custo médio.
2. `record_finished_product_receipt_atomic`: Entrada direta de congelados prontos para venda.
3. `create_production_order_atomic`: Início de batelada na cozinha.
4. `complete_production_order_atomic`: Conclusão com consumo FEFO de insumos, rendimento real e geração do lote.
5. `reserve_order_inventory_atomic`: Reserva de lotes ativos no momento da confirmação do pedido.
6. `release_order_inventory_reservation_atomic`: Liberação limpa de reservas no cancelamento.
7. `commit_order_inventory_deduction_atomic`: Baixa definitiva na expedição e apuração do CMV.
8. `adjust_inventory_batch_atomic`: Ajuste manual auditado de lote.

---

## 4. Interfaces e Telas Administrativas

- `/admin/estoque`:
  - KPIs de Valor Total em Estoque, Lotes Ativos, Alertas de Validade (< 30 dias) e Insumos Críticos.
  - Abas: `Lotes & Congelados` (FEFO e saldos), `Insumos & Matérias-Primas` e `Histórico & Auditoria`.
  - Modais para Entrada Rápida de Insumos/Congelados e Ajuste Manual com Justificativa.
- `/admin/producao`:
  - Gestão de Bateladas e Fichas Técnicas da BENZA.
  - Acompanhamento de rendimento real envasado vs esperado, desvio percentual, consumo da equipe e desperdício.
  - Apontamento de conclusão de produção com geração de lote no freezer.

---

## 5. Relatório do Gate Local 3D (100% Aprovado)

| Validação | Escopo | Resultado | Status |
| :--- | :--- | :--- | :---: |
| **TypeScript (`pnpm typecheck`)** | Global | **0 erros** | Aprovado |
| **Testes Unitários Locais (`pnpm test`)** | Local | **166/166 aprovados** (23/23 arquivos) | Aprovado |
| **Build de Produção (`pnpm build`)** | Local | **Exit code 0** (SSR + rotas dinâmicas) | Aprovado |
| **Migration 00014** | Local | Arquivo gerado em `supabase/migrations/` | Pronto para Homologação |
| **Testes de Homologação Staging** | Staging | Arquivo gerado em `tests/staging/migration-00014.test.ts` | Pronto para o Gate Remoto 3D.1 |

---

## 6. Relatório do Gate Remoto 3D.1 (100% Homologado em Staging)

A **Migration 00014** e todo o motor de estoque, lotes FEFO, genealogia de produção e segurança sanitária ANVISA foram integralmente aplicados e validados no banco Supabase Staging (`zmirilugwaffgnnxhxkr`).

### 6.1 Resultados dos Testes Remotos da Migration 00014 (`tests/staging/migration-00014.test.ts`)

| Cenário de Teste | Itens Validados | Resultado |
| :--- | :--- | :---: |
| **1. Estrutura de Schema** | Existência de todas as 9 tabelas, índices e triggers de imutabilidade | **Passou** |
| **2. Entrada de Insumo e Custo Médio** | Entrada fracionária, lote, cálculo de custo médio ponderado e movimentação imutável | **Passou** |
| **3. Imutabilidade Anti-Tampering** | Tentativa de `UPDATE`/`DELETE` em `inventory_movements` bloqueada pelo trigger | **Passou** |
| **4. Isolamento Multi-Tenant** | Isolamento bidirecional Tenant 01 x Tenant 02 e bloqueio a clientes anônimos via RLS | **Passou** |
| **5. Produção Real e Ficha Técnica** | Consumo FEFO de insumos, rendimento real envasado, desvio auditado e genealogia | **Passou** |
| **6. Reserva FEFO, Idempotência e Quarentena Sanitária** | Reserva atômica, baixa na expedição, cancelamento pós-expedição sem reintegração indevida e quarentena sanitária | **Passou** |
| **7. Descarte Sanitário Direto** | Descarte definitivo (`discard_loss`) de produto impróprio com apontamento de perda contábil | **Passou** |

### 6.2 Validação da Suíte Completa de Staging (Zero Regressões)

- **Test Files**: 15/15 aprovados
- **Total de Testes Remotos**: 62/62 aprovados
- **Cobertura**: Migrations `00001` a `00014` com integridade operacional, KDS multiestação e conformidade sanitária.

---

## 7. Status Consolidado da BENZA

| Etapa | Escopo | Status |
| :--- | :--- | :---: |
| **Etapa 3A** | KDS Base & Checklist de Itens | Concluída e Homologada |
| **Etapa 3B** | KDS Multiestação & Capacidade | Concluída e Homologada |
| **Etapa 3C** | Pedido Rápido & Atendimento Multicanal | Concluída e Homologada |
| **Etapa 3D** | Estoque de Congelados, Insumos, Fichas Técnicas e Controle de Lotes | **100% Homologada (Gate Remoto 3D.1 Concluído)** |


