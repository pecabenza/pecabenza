# ETAPA 3B — Multiestação, Etapas Sequenciais e Capacidade Operacional

## 1. Visão Geral

A **Etapa 3B** evolui o Operations Engine e o KDS (`/admin/kds`) para suportar **múltiplas estações de produção configuráveis por tenant**, **fluxos sequenciais de etapas por produto ou variante**, **cálculo de capacidade e carga em tempo real**, **previsão de conclusão por caminho crítico**, **SLA preditivo (`at_risk`)**, **KDS dedicado por estação (`/admin/kds/[stationSlug]`)** e **override administrativo auditado**, preservando total retrocompatibilidade com restaurantes ou itens que operam em etapa única (Etapa 3A).

---

## 2. Modelo de Estações (`public.production_stations`)

Definido na migration [`supabase/migrations/00012_multi_station_capacity_engine.sql`](file:///f:/projetos/pecabenza/supabase/migrations/00012_multi_station_capacity_engine.sql):

- `id` (`uuid`, PK) + `UNIQUE (tenant_id, id)`
- `tenant_id` (`uuid`, FK para `tenants`)
- `name` (`varchar(120)`) e `slug` (`varchar(80)`, `UNIQUE (tenant_id, slug)`)
- `station_type`: `'kitchen' | 'grill' | 'oven' | 'assembly' | 'drinks' | 'dessert' | 'expedition' | 'custom'`
- `display_order` (`integer`)
- `default_capacity` (`integer >= 1`, capacidade simultânea de slots da estação)
- `default_duration_seconds` (`integer >= 10`, tempo estimado padrão em segundos)
- `is_active` (`boolean`)

Estações padrão semeadas de forma idempotente para o tenant BENZA:
1. **Cozinha Quente** (`cozinha-quente`, `kitchen`, capacidade `4`, `600s`)
2. **Montagem** (`montagem`, `assembly`, capacidade `4`, `300s`)
3. **Expedição** (`expedicao`, `expedition`, capacidade `6`, `180s`)

---

## 3. Modelo de Etapas Sequenciais e Regra de Precedência

### 3.1 Configuração de Catálogo (`public.product_production_steps`)
Permite configurar 1 ou mais etapas sequenciais (`step_order = 1..N`) associadas a um `product_id` (escopo geral do produto, `variant_id IS NULL`) ou a um `variant_id` específico:
- Índices únicos parciais garantem que `step_order` não se repita dentro do mesmo produto ou da mesma variante.
- `estimated_duration_seconds` (`>= 5`) e `capacity_weight` (`>= 1`).

### 3.2 Snapshot Operacional Imutável (`public.order_item_production_steps`)
Quando o pedido entra em preparo (`initialize_order_production_steps_atomic`), o sistema cria um snapshot operacional imutável para cada `order_item`, copiando `snapshot_station_name`, `snapshot_station_slug`, `snapshot_station_type`, `step_order`, `estimated_duration_seconds` e `capacity_weight`. Alterações futuras no catálogo não corrompem pedidos em andamento ou históricos.

### 3.3 Regra de Precedência (`resolveItemProductionFlow`)
1. **Variante específica (`product_id + variant_id`)**: se a variante possuir etapas ativas em estações ativas, estas têm precedência total;
2. **Produto geral (`product_id + variant_id IS NULL`)**: se a variante não possuir etapas próprias, utiliza o fluxo do produto;
3. **Fallback automático (Etapa Única)**: se o produto não possuir etapas configuradas (ou se o tenant não tiver configurado fluxos), gera automaticamente **1 etapa operacional padrão** (`step_order = 1`, `status = 'pending'`), mantendo funcionamento transparente como na Etapa 3A.

---

## 4. Máquina de Estados e Desbloqueio Sequencial de Etapas

Estados de cada etapa em `order_item_production_steps`:
- `blocked`: etapa futura (`step_order > 1`) aguardando conclusão da etapa anterior;
- `pending`: etapa liberada e disponível na fila da estação;
- `preparing`: etapa em execução ativa na bancada da estação;
- `ready`: etapa concluída na estação;
- `skipped`: etapa pulada via override administrativo auditado;
- `cancelled`: etapa cancelada.

### Regras de Transição (RPCs Atômicas com `FOR UPDATE`):
- **Inicialização (`initialize_order_production_steps_atomic`)**: Etapa `1` nasce `pending`; Etapas `> 1` nascem `blocked`.
- **Início (`start_production_step_atomic`)**: Rejeita etapas `blocked` ou finalizadas. Se já estiver `preparing`, retorna sucesso idempotente sem duplicar eventos.
- **Conclusão (`complete_production_step_atomic`)**:
  - Rejeita conclusão de etapa `blocked`;
  - Marca a etapa atual como `ready` (`completed_at = now()`) e grava `station_step_completed`;
  - **Desbloqueio sequencial**: localiza a próxima etapa (`step_order > atual`) com `status = 'blocked'` do mesmo item e a promove automaticamente para `status = 'pending'`;
  - Quando **todas** as etapas do item atingem `ready` ou `skipped`, marca `order_item_operations.preparation_status = 'ready'` e emite `item_ready`;
  - **Liberação para Expedição (`complete_order_preparation_atomic`)**: o pedido só pode avançar `preparing -> ready` mediante confirmação explícita do operador e quando **100% dos itens e 100% das etapas obrigatórias em todas as estações** estiverem concluídas.

---

## 5. Capacidade, Saturação, Caminho Crítico e SLA Avançado

Implementados em [`src/modules/orders/station-capacity.engine.ts`](file:///f:/projetos/pecabenza/src/modules/orders/station-capacity.engine.ts):

### 5.1 Carga e Saturação da Estação (`calculateStationLoad`)
- `inUseUnits`: soma de `capacity_weight` das etapas em `preparing`;
- `pendingUnits`: soma de `capacity_weight` das etapas em `pending`;
- `estimatedQueueWaitSeconds`: tempo estimado de espera na fila da estação ponderado pela capacidade (`default_capacity`);
- Classificação de Saturação:
  - `normal` (**Normal**): capacidade livre e fila baixa;
  - `warning` (**Alta Carga**): capacidade 100% ocupada ou fila moderada (`>= 5 min`);
  - `saturated` (**Saturada**): carga acima da capacidade ou espera estimada crítica (`>= 15 min`).

### 5.2 Previsão por Caminho Crítico (`calculateOrderCriticalPathAndPrediction`)
- Para cada item, soma sequencialmente `(queueWaitSeconds + remainingExecutionSeconds)` das etapas ainda abertas (`estimated_item_completion_at`).
- Como itens distintos do mesmo pedido progridem em paralelo nas estações, a conclusão prevista do pedido (`estimated_order_ready_at`) é determinada pelo **Caminho Crítico** (`max` entre os tempos restantes dos itens do pedido), identificando o item e a estação gargalo (`bottleneckStationName`).

### 5.3 SLA Preditivo (`calculateAdvancedOrderSla`) e Agendados (`calculateRecommendedStartAt`)
- Estados: `on_time` (**No Prazo**), `at_risk` (**Em Risco**), `delayed` (**Atrasado**).
- Detecta atraso provável **antes** de estourar o horário prometido quando `estimated_order_ready_at > promised_time_at` (ou dentro do buffer de alerta).
- Para pedidos agendados, `recommended_start_at` recua dinamicamente a recomendação de início com base no caminho crítico + fila das estações + buffer do tenant.

---

## 6. Override Administrativo e Auditoria

- Disponível apenas para usuários com papel `tenant_admin` (validado em [`src/app/api/admin/orders/[id]/steps/route.ts`](file:///f:/projetos/pecabenza/src/app/api/admin/orders/[id]/steps/route.ts) — retorna `403 Forbidden` para `tenant_manager`).
- Exige motivo textual obrigatório (`>= 3` caracteres).
- Executa `override_production_step_atomic`, que desbloqueia a próxima etapa sequencial se aplicável e grava trilha imutável simultaneamente em:
  - `public.order_operation_events` (`event_type = 'station_step_skipped'`)
  - `public.audit_logs` (`action = 'kds_step_override'`)

---

## 7. Rotas e Componentes Criados / Atualizados

- [`supabase/migrations/00012_multi_station_capacity_engine.sql`](file:///f:/projetos/pecabenza/supabase/migrations/00012_multi_station_capacity_engine.sql)
- [`src/modules/orders/station-capacity.engine.ts`](file:///f:/projetos/pecabenza/src/modules/orders/station-capacity.engine.ts)
- [`src/modules/orders/kds.engine.ts`](file:///f:/projetos/pecabenza/src/modules/orders/kds.engine.ts)
- [`src/modules/orders/orders.service.ts`](file:///f:/projetos/pecabenza/src/modules/orders/orders.service.ts)
- [`src/app/api/admin/kds/stations/[stationSlug]/route.ts`](file:///f:/projetos/pecabenza/src/app/api/admin/kds/stations/[stationSlug]/route.ts)
- [`src/app/api/admin/orders/[id]/steps/route.ts`](file:///f:/projetos/pecabenza/src/app/api/admin/orders/[id]/steps/route.ts)
- [`src/app/api/admin/operations/config/route.ts`](file:///f:/projetos/pecabenza/src/app/api/admin/operations/config/route.ts)
- [`src/app/(tenant-admin)/admin/kds/page.tsx`](file:///f:/projetos/pecabenza/src/app/(tenant-admin)/admin/kds/page.tsx)
- [`src/app/(tenant-admin)/admin/kds/[stationSlug]/page.tsx`](file:///f:/projetos/pecabenza/src/app/(tenant-admin)/admin/kds/[stationSlug]/page.tsx) (suporta `?mode=tv` e painel de conferência de Expedição)
- [`src/components/admin/kds/KdsStationStepCard.tsx`](file:///f:/projetos/pecabenza/src/components/admin/kds/KdsStationStepCard.tsx)
- [`src/components/admin/kds/KdsOrderCard.tsx`](file:///f:/projetos/pecabenza/src/components/admin/kds/KdsOrderCard.tsx)
- [`src/app/(tenant-admin)/admin/configuracoes/operacao/page.tsx`](file:///f:/projetos/pecabenza/src/app/(tenant-admin)/admin/configuracoes/operacao/page.tsx)

---

## 8. Resultados dos Gates Local e Remoto (Etapa 3B & 3B.1 — 100% Homologada)

| Verificação | Comando | Resultado |
| :--- | :--- | :--- |
| **TypeScript** | `pnpm typecheck` | **0 erros** (`exit code 0`) |
| **Testes Locais** | `pnpm test` | **149/149 aprovados** (21 suítes, 0 falhas) |
| **Build de Produção** | `pnpm build` | **Sucesso** (`exit code 0` — compilado sem avisos bloqueantes) |
| **Migration `00012` Remota** | `pnpm vitest run tests/staging/migration-00012.test.ts` | **5/5 aprovados** (6.00s, 0 falhas) |
| **Suíte Remota Completa** | `pnpm vitest run tests/staging/` | **51/51 aprovados** (13 suítes de migrations `00001`–`00012`, 20.72s, 0 falhas) |

---

## 9. Limitações Atuais e Roadmap Evolutivo

- **Escopo Respeitado na 3B:** Não foram implementados estoque/ficha técnica, baixa de insumos, módulo fiscal, cartão de crédito, GPS/roteirização de entregadores ou impressão térmica automática por setor.
- **Status do Gate Remoto (Etapa 3B.1):** **HOMOLOGADO (GO)**. Fluxo real `Cozinha Quente → Montagem → Expedição`, bloqueio de etapas futuras, desbloqueio sequencial, concorrência/idempotência, override administrativo auditado (`audit_logs` + `order_operation_events`) e isolamento bidirecional multi-tenant validados no Supabase oficial (`zmirilugwaffgnnxhxkr`).
- **Sequência Evolutiva Planejada:**
  1. **Etapa 3C** — Pedido Rápido / Telefone / WhatsApp / Balcão (`/admin/pedido-rapido` integrado ao motor `orders` + KDS)
  2. **Etapa 4A** — Inventory Engine para congelados e produto acabado
  3. **Etapa 4B** — Lotes, produção, perdas, validade e rastreabilidade por freezer
  4. **Etapa 4C** — Ficha técnica + custo + CMV
  5. **Etapa 5A** — Relatórios de vendas e operação (`/admin/vendas`)
  6. **Etapa 5B** — Impressão térmica automática (58 mm / 80 mm e por estação)
  7. **Etapa 6A** — Delivery Engine / motoboys (`/admin/entregas` e `/entregador`)
  8. **Etapa 6B** — GPS + tracking público em tempo real (`/pedido/[publicToken]`)
  9. **Etapa 6C** — Roteirização inteligente de entregas
  10. **Etapa 6D** — Uber Direct / integrações externas de entrega


