# ARCHITECTURE_VISION_UPDATE.md

## Addendum ao ARCHITECTURE.md

A plataforma passa a ser definida como:

> **SaaS multi-tenant de vendas, gestão, operação e crescimento para negócios de alimentação.**

A BENZA permanece como Tenant 01 e primeiro ambiente real de validação.

## Motores funcionais

1. Presence Engine
2. Commerce Engine
3. Operations Engine
4. Inventory & Cost Engine
5. Delivery Engine
6. Finance & Fiscal Engine
7. Growth Engine

Todos operam sobre o Multi-Tenant Platform Core.

## Regras arquiteturais

Cada engine deve:
- possuir domínio funcional próprio;
- evitar dependências circulares;
- respeitar `tenant_id`;
- respeitar papéis/permissões;
- operar com feature flags;
- permitir ativação por plano;
- registrar auditoria/eventos;
- expor interfaces estáveis.

## Feature flags

Preparar suporte futuro para:
- `features`;
- `plan_features`;
- `tenant_features`;
- limites;
- overrides;
- ativação/desativação.

Validação deve ocorrer também no backend.

## Multiunidade

Preparar arquitetura para futura entidade `business_units`, sem implementar agora.

## Eventos de domínio

Preparar arquitetura para:
- `order.created`;
- `order.paid`;
- `order.ready`;
- `order.dispatched`;
- `order.delivered`;
- `inventory.reserved`;
- `inventory.consumed`;
- `production.completed`;
- `cart.abandoned`.

Não introduzir broker externo nesta fase.

## Pedido como entidade central

`orders` será compartilhado conceitualmente por Commerce, Operations, Delivery e Finance.

Deve registrar tenant, origem, cliente, itens, valores, descontos, entrega/retirada, janela, pagamento, status, timestamps e histórico imutável.

## Ficha técnica

A ficha técnica será entidade estratégica do Inventory & Cost Engine.

Deverá suportar insumos, unidades, quantidades, conversões, perdas, rendimento, custos, embalagens, versões e vigência.

## Produção por lote

Preparar domínio futuro:
- `production_batches`;
- `production_batch_inputs`;
- `production_batch_outputs`;
- `production_losses`;
- `production_internal_consumption`.

## Kanban e KDS

KDS será uma visão operacional do mesmo domínio de pedidos. Não criar base paralela.

## Financeiro e Fiscal

Financeiro deve derivar dados dos demais módulos quando possível.

Fiscal deve permanecer desacoplado do core e ser integrado por adapters.

## Integrações

Criar adapters para pagamentos, marketplaces, fiscal, WhatsApp, mapas/roteirização, analytics e contabilidade.

## Growth Engine

Growth utiliza dados e eventos dos demais engines para segmentação, recompra, recuperação, SEO, campanhas, conversão e recomendações.

## BENZA como referência

BENZA deve validar prioritariamente:
- Presence;
- Commerce;
- Operations;
- Inventory & Cost;
- Delivery;
- Growth.

PDV, mesas, fiscal completo e multiunidade não são requisitos para o primeiro go-live.
