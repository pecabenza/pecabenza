# ETAPA 3E — Gestão de Entregas, Expedição, Motoboys e Rastreamento

## 1. Visão Geral & Reaproveitamento da Arquitetura Existente

A **Etapa 3E** fecha o ciclo operacional da plataforma BENZA — do recebimento e preparo no KDS Multiestação até a expedição, entrega efetiva ao cliente e tratamento sanitário de eventuais retornos.

### Reaproveitamento sem Duplicação (`00008` a `00014`)
- **`public.orders`**: Reaproveita os status canônicos (`ready`, `out_for_delivery`, `delivered`, `cancelled`), `public_tracking_token`, `fulfillment_type`, `payment_method` e `cash_change_for_cents` (troco).
- **`public.order_addresses`**: Reaproveita o snapshot de endereço existente, apenas adicionando colunas nulas opcionais (`latitude`, `longitude`, `geocoded_at`) para geocodificação/roteirização futura (ex.: Google Route Optimization API).
- **`public.order_status_events`**: Reaproveita integralmente a trilha imutável e a origem `'driver'` / `'delivery_provider'` já previstas na Migration `00010`.
- **Etapa 3D (`00014`)**: Mantém a baixa FEFO idempotente (`commit_order_inventory_deduction_atomic`) ao despachar e integra retornos físicos ao fluxo de quarentena sanitária (`process_order_return_quarantine_atomic`), evitando reintegração automática de congelados que saíram da cadeia de frio.

### Separação Estrita: Status Comercial do Pedido x Status Logístico da Entrega
- O status comercial/operacional do pedido permanece em `orders.status` (`ready` → `out_for_delivery` → `delivered`).
- O ciclo logístico independente reside em `public.order_deliveries` (`pending_dispatch` → `assigned` → `picked_up` → `in_transit` → `arrived` → `delivered` / `failed_attempt` / `returned_to_store`).
- Isso permite tentativas frustradas, re-despachos e troca de entregador sem corromper `orders.status` nem duplicar baixas de estoque.

---

## 2. Arquivos Criados e Modificados

### Banco de Dados (`supabase/migrations/`)
- [`supabase/migrations/00015_delivery_dispatch_tracking.sql`](file:///f:/projetos/pecabenza/supabase/migrations/00015_delivery_dispatch_tracking.sql):
  - Tabelas: `delivery_drivers`, `tenant_delivery_counters`, `delivery_runs`, `order_deliveries`, `delivery_events` (*append-only* com trigger *anti-tampering*), `delivery_location_pings` (retenção efêmera com `expires_at` de 7 dias).
  - RPCs atômicas: `generate_next_delivery_run_code`, `dispatch_delivery_run_atomic`, `update_delivery_step_atomic`, `confirm_delivery_proof_atomic`, `record_delivery_failure_atomic`, `toggle_run_location_sharing_atomic`, `record_driver_location_ping_atomic`, `purge_expired_delivery_locations`.

### Domínio & Serviços (`src/modules/delivery/` e `src/modules/orders/`)
- [`src/types/database.types.ts`](file:///f:/projetos/pecabenza/src/types/database.types.ts): Interfaces e tipos da Etapa 3E.
- [`src/modules/delivery/delivery.schema.ts`](file:///f:/projetos/pecabenza/src/modules/delivery/delivery.schema.ts): Schemas Zod de validação.
- [`src/modules/delivery/delivery.engine.ts`](file:///f:/projetos/pecabenza/src/modules/delivery/delivery.engine.ts): Máquina de estados logística, geração/hash SHA-256 de tokens de entregador, expiração, mascaramento LGPD, heurística de sequência de paradas (`suggestDeliveryStopSequence`) e formatação WhatsApp.
- [`src/modules/delivery/delivery.service.ts`](file:///f:/projetos/pecabenza/src/modules/delivery/delivery.service.ts): Gestão de entregadores, painel de despacho, despacho de romaneio, portal por token, comprovação, ocorrência/quarentena e enriquecimento público seguro.
- [`src/modules/orders/orders.service.ts`](file:///f:/projetos/pecabenza/src/modules/orders/orders.service.ts): `getPublicOrderTracking` enriquecido com `delivery` (status, primeiro nome do motoboy, parada, comprovante e localização somente se ativa e consentida).

### APIs REST
- [`src/app/api/admin/delivery/drivers/route.ts`](file:///f:/projetos/pecabenza/src/app/api/admin/delivery/drivers/route.ts)
- [`src/app/api/admin/delivery/dispatch/route.ts`](file:///f:/projetos/pecabenza/src/app/api/admin/delivery/dispatch/route.ts)
- [`src/app/api/admin/delivery/runs/[id]/route.ts`](file:///f:/projetos/pecabenza/src/app/api/admin/delivery/runs/[id]/route.ts)
- [`src/app/api/admin/delivery/orders/[deliveryId]/action/route.ts`](file:///f:/projetos/pecabenza/src/app/api/admin/delivery/orders/[deliveryId]/action/route.ts)
- [`src/app/api/driver/[token]/route.ts`](file:///f:/projetos/pecabenza/src/app/api/driver/[token]/route.ts)
- [`src/app/api/driver/[token]/action/route.ts`](file:///f:/projetos/pecabenza/src/app/api/driver/[token]/action/route.ts)

### Interfaces (Painel Admin, Entregador e Cliente)
- [`src/components/admin/AdminLayoutShell.tsx`](file:///f:/projetos/pecabenza/src/components/admin/AdminLayoutShell.tsx): Novos atalhos `Expedição & Rotas` e `Entregadores`.
- [`src/app/(tenant-admin)/admin/expedicao/page.tsx`](file:///f:/projetos/pecabenza/src/app/(tenant-admin)/admin/expedicao/page.tsx): Painel de despacho, montagem e reordenação de romaneio, conferência de cobrança/troco, geração de link WhatsApp, acompanhamento de rotas, ocorrências e encaminhamento à quarentena sanitária (3D).
- [`src/app/(tenant-admin)/admin/entregadores/page.tsx`](file:///f:/projetos/pecabenza/src/app/(tenant-admin)/admin/entregadores/page.tsx): Cadastro, disponibilidade e métricas de entregadores.
- [`src/app/entregador/layout.tsx`](file:///f:/projetos/pecabenza/src/app/entregador/layout.tsx) e [`src/app/entregador/[token]/page.tsx`](file:///f:/projetos/pecabenza/src/app/entregador/[token]/page.tsx): Portal mobile-first do entregador autenticado por token temporário com toggle explícito de consentimento GPS.
- [`src/app/(storefront)/pedido/[publicToken]/page.tsx`](file:///f:/projetos/pecabenza/src/app/(storefront)/pedido/[publicToken]/page.tsx): Exibição de progresso de entrega, posição na rota, link de posição em tempo real (apenas quando ativo e consentido) e comprovante de recebimento.

---

## 3. Segurança, LGPD e Auditoria de Riscos Legados

### Controles Implementados na Etapa 3E
1. **RLS Multi-Tenant Bidirecional Estrita**: Todas as 6 novas tabelas têm RLS habilitada sem nenhuma política `anon` pública; apenas membros/gestores do tenant autenticado ou `service_role` via Server APIs controladas.
2. **Tokens Criptográficos com Expiração**: O link do entregador usa token aleatório de 48 caracteres hex (192 bits) cujo hash SHA-256 é salvo em `delivery_runs.driver_token_hash`. Ao encerrar a última parada da rota, o token expira imediatamente e a rota passa para `completed`.
3. **Privacidade & Minimização de Localização (LGPD)**:
   - O rastreamento funciona 100% com atualizações manuais sem exigir GPS.
   - O envio de GPS exige consentimento explícito (`location_sharing_enabled = true`) em rota ativa.
   - Ao concluir ou encerrar a rota, `confirm_delivery_proof_atomic` e `record_delivery_failure_atomic` desligam `location_sharing_enabled` automaticamente, bloqueiam novos pings no banco e ocultam coordenadas da API pública do cliente.
   - Pings possuem retenção limitada (`expires_at = now() + 7 days`) com função de expurgo `purge_expired_delivery_locations`.
4. **Imutabilidade**: Trigger `trg_prevent_delivery_events_mutation` impede `UPDATE`/`DELETE` em `delivery_events`.
5. **Escopo Horizontal do Entregador**: A API `/api/driver/[token]/action` valida que `deliveryId` pertence às paradas autorizadas daquele token antes de qualquer transição, além de aplicar rate-limiting por IP.

### Resolução das Políticas Públicas Legadas (`00008_commerce_orders.sql`)
- **Achado & Correção Aplicada**: Na Migration [`00008_commerce_orders.sql`](file:///f:/projetos/pecabenza/supabase/migrations/00008_commerce_orders.sql#L251-L290), existiam 6 políticas permissivas (`"Public view..."` e `"Public insert..."`) em `orders`, `order_items` e `order_addresses`.
- **Ação Executada na `00015`**: Remoção (`DROP POLICY IF EXISTS`) dessas 6 políticas diretamente na `00015_delivery_dispatch_tracking.sql`, mantendo apenas acesso autenticado restrito ao próprio tenant (`is_tenant_member(tenant_id)`) e acesso de sistema via Server APIs (`service_role`) + RPCs `SECURITY DEFINER`.
- **Comprovação no Staging**: Após aplicação da `00015`, consultas `anon` em `orders`, `order_items` e `order_addresses` retornaram **0 linhas** (`PII sample: none`), enquanto o fluxo público legítimo [`getPublicOrderTracking`](file:///f:/projetos/pecabenza/src/modules/orders/orders.service.ts#L634-L760) permaneceu 100% operacional.

---

## 4. Relatório do Gate Local 3E & Gate Remoto 3E.1 (100% Homologados)

| Verificação | Escopo | Resultado | Status |
| :--- | :--- | :--- | :---: |
| **TypeScript (`pnpm typecheck`)** | Global | **0 erros** | Aprovado |
| **Testes Locais (`pnpm test`)** | Unitários & Segurança | **173/173 aprovados** (24/24 arquivos) | Aprovado |
| **Build de Produção (`pnpm build`)** | Next.js 15.5.27 | **Exit code 0** (`/admin/expedicao`, `/admin/entregadores`, `/entregador/[token]`, APIs) | Aprovado |
| **Testes Específicos `00015`** | Staging Remoto | **4/4 cenários aprovados** (`migration-00015.test.ts`) | Homologado |
| **Suíte Completa de Staging** | Migrations `00001`–`00015` | **66/66 testes aprovados** (16/16 arquivos) | Zero Regressões |
| **Bloqueio Anônimo (`anonClient`)** | `orders`, `order_items`, `order_addresses` e tabelas 3E | **0 linhas expostas** + `INSERT` anônimo bloqueado | Aprovado |

---

## 5. Próxima Prioridade: Fase B — Correções P0 do MVP Operacional BENZA

Com o **Gate Remoto 3E.1 formalmente homologado** e a exposição RLS encerrada, iniciamos imediatamente as **Correções P0 do MVP Operacional** conforme [`docs/BENZA_MVP_OPERACIONAL_READINESS.md`](file:///f:/projetos/pecabenza/docs/BENZA_MVP_OPERACIONAL_READINESS.md):
1. Cadastro e fotos de produtos (`cover_media_id` / `media_assets`).
2. `createOrderAtomic` sem erros silenciosos.
3. Configurações comerciais administrativas (`tenant_commerce_settings` + `business_hours`).
4. Cardápio e `/checkout` sincronizados com regras e taxas reais.
5. Trava de prontidão comercial antes de ativar `site_mode = 'commerce'`.

