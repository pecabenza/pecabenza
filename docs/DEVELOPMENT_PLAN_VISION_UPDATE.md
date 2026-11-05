# DEVELOPMENT_PLAN_VISION_UPDATE.md

## Addendum ao DEVELOPMENT_PLAN.md

A ampliação da visão não reabre a Etapa 1 já homologada.

## Roadmap macro

### Etapa 1 — Presence Foundation
Multi-tenancy, segurança, CMS, institucional, SEO, LGPD, analytics e observabilidade.

### Etapa 2 — Commerce Engine
- catálogo;
- disponibilidade;
- carrinho;
- checkout sem conta obrigatória;
- cliente/endereço;
- retirada;
- delivery;
- agendamento;
- Pix/cartão;
- pedido;
- confirmação;
- eventos de e-commerce.

Não incluir PDV, fiscal completo ou mesas.

### Etapa 3 — Operations Engine
- Kanban;
- estados configuráveis;
- separação;
- preparação;
- embalagem;
- expedição;
- KDS inicial;
- SLA;
- ocorrências.

### Etapa 4 — Inventory & Cost Engine
- insumos;
- fornecedores;
- compras;
- ficha técnica;
- baixa teórica;
- estoque;
- lote;
- produção;
- rendimento;
- porcionamento;
- perdas;
- consumo interno;
- validade;
- custo;
- CMV teórico;
- CMV real.

### Etapa 5 — Delivery Engine
- entregadores;
- áreas;
- taxas;
- janelas;
- atribuição;
- agrupamento;
- roteirização;
- tracking;
- confirmação;
- ocorrências;
- métricas.

### Etapa 6 — Growth Engine
- CRM;
- segmentação;
- WhatsApp;
- automações;
- recuperação;
- fidelidade;
- cupons;
- avaliações;
- Search Console;
- GA4;
- funil;
- UTMs;
- SEO contínuo;
- recomendações.

### Etapa 7 — Finance Engine
- caixa;
- abertura/fechamento;
- sangria;
- suprimento;
- conciliação;
- contas;
- fluxo;
- DRE;
- relatórios.

### Etapa 8 — Fiscal Engine
- configuração fiscal;
- dados tributários;
- emissão;
- cancelamento;
- XML;
- DANFE/NFC-e;
- integrações contábeis.

### Etapa 9 — Physical Store Engine
- PDV;
- mesas;
- comandas;
- garçom;
- QR Code;
- impressão;
- totem;
- hardware.

### Etapa 10 — Multiunit & Franchise
- unidades;
- permissões por unidade;
- catálogo central/local;
- estoque por unidade;
- relatórios consolidados;
- políticas de rede.

## Ordem recomendada para BENZA

1. publicar institucional;
2. Commerce;
3. Operations;
4. Inventory & Cost;
5. Delivery;
6. Growth;
7. Finance;
8. Fiscal quando necessário.

## Gate para qualquer funcionalidade nova

Antes de entrar em sprint:
1. resolve problema real?
2. BENZA precisa agora?
3. futuros tenants precisam?
4. pertence a qual engine?
5. exige nova entidade?
6. pode ser feature flag?
7. depende de serviço externo?
8. qual risco de segurança?
9. qual custo operacional?
10. qual métrica comprova valor?

## Próxima etapa recomendada

Após publicação institucional:

> **Etapa 2 — Commerce Engine**

Primeiro recorte:
- catálogo;
- disponibilidade;
- carrinho;
- checkout sem conta;
- pedido;
- Pix;
- delivery/retirada;
- agendamento;
- confirmação.
