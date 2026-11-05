# BENCHMARKS_COMPETITIVOS.md

## Benchmark competitivo — Plataforma SaaS para Food Service

**Versão:** 1.0

A plataforma está sendo desenvolvida como um SaaS multi-tenant para negócios de alimentação, tendo a BENZA como Tenant 01.

## Posicionamento estratégico

> **Plataforma de vendas, gestão, operação e crescimento para negócios de alimentação.**

O benchmark competitivo orienta discovery e priorização. Não autoriza copiar layout, textos, fluxos proprietários ou identidade de concorrentes.

## Cardápio Web — aprendizados

Capacidades observadas:
- cardápio digital;
- pedido sem conta obrigatória;
- pagamento online;
- agendamento;
- WhatsApp e automações;
- PDV;
- mesas/comandas;
- estoque e ficha técnica;
- caixa e CMV;
- nota fiscal;
- KDS;
- entregadores e roteirização;
- CRM;
- fidelidade;
- recuperação de carrinho;
- integrações com marketplaces e marketing.

Principais aprendizados:
1. Canal próprio de venda deve ser central.
2. WhatsApp deve fazer parte da operação e do Growth.
3. Redução de atrito no checkout é essencial.
4. Operação, CRM e marketing devem compartilhar o mesmo histórico de cliente.
5. Recompra e retenção precisam ser tratadas como produto.

## Saipos — aprendizados

Capacidades observadas:
- PDV;
- estoque;
- ficha técnica;
- dedução automática;
- CMV teórico e real;
- DRE;
- fluxo e fechamento de caixa;
- KDS;
- Kanban;
- delivery;
- roteirização;
- app de entregador;
- fiscal;
- integrações com marketplaces;
- multiunidade e franquias.

Principais aprendizados:
1. Ficha técnica deve ser núcleo operacional.
2. CMV deve nascer dos dados reais da operação.
3. Produção, estoque e venda precisam conversar.
4. Kanban e KDS devem usar o mesmo domínio de pedidos.
5. Financeiro deve ser alimentado automaticamente pela operação.
6. Integrações devem ser modulares.
7. Multiunidade deve ser prevista desde a arquitetura.

## Sete motores do produto

### 1. Presence Engine
- site institucional;
- CMS;
- branding por tenant;
- SEO;
- conteúdo;
- landing pages;
- performance;
- analytics de aquisição.

### 2. Commerce Engine
- catálogo;
- variações;
- carrinho;
- checkout;
- pedido sem conta;
- Pix/cartão;
- cupons;
- agendamento;
- retirada;
- delivery.

### 3. Operations Engine
- pedidos;
- estados configuráveis;
- Kanban;
- KDS;
- preparação;
- separação;
- embalagem;
- expedição;
- tempos;
- ocorrências.

### 4. Inventory & Cost Engine
- insumos;
- fornecedores;
- compras;
- ficha técnica;
- produção por lote;
- rendimento;
- porcionamento;
- estoque;
- perdas;
- consumo interno;
- validade;
- CMV teórico;
- CMV real.

### 5. Delivery Engine
- áreas;
- taxas;
- janelas;
- motoboys;
- atribuição;
- roteirização;
- agrupamento;
- tracking;
- confirmação;
- ocorrências.

### 6. Finance & Fiscal Engine
- caixa;
- fluxo;
- DRE;
- contas;
- conciliação;
- fiscal;
- emissão;
- XML;
- integrações contábeis.

### 7. Growth Engine
- CRM;
- segmentação;
- WhatsApp;
- automações;
- fidelidade;
- cashback;
- recuperação de carrinho;
- avaliações;
- Search Console;
- GA4;
- campanhas;
- UTMs;
- SEO contínuo;
- recomendações de Growth.

## Multi-Tenant Platform Core

Todos os motores operam sobre:
- tenants;
- unidades futuras;
- usuários;
- papéis;
- planos;
- feature flags;
- assinaturas;
- domínios;
- branding;
- integrações;
- auditoria;
- segurança;
- LGPD;
- observabilidade.

## Diferenciais pretendidos

1. Institucional + comércio no mesmo produto.
2. SEO e Growth nativos.
3. Produção e lotes como domínio real.
4. Custos e CMV conectados à operação.
5. Modularidade comercial por tenant/plano.

## O que não fazer

- não copiar interfaces;
- não copiar textos;
- não implementar tudo agora;
- não transformar a Etapa 2 em ERP completo;
- não acoplar BENZA ao core;
- não misturar fiscal com checkout;
- não exigir conta sem necessidade;
- não sacrificar performance.

## Prioridades

### Alta
- canal próprio;
- checkout;
- pagamento;
- agendamento;
- Kanban;
- ficha técnica;
- estoque;
- produção/lotes;
- CMV;
- delivery;
- CRM básico;
- SEO/Growth.

### Média
- KDS;
- caixa;
- marketplace;
- fidelidade;
- recuperação;
- roteirização;
- multiunidade.

### Posterior
- PDV completo;
- mesas/comandas;
- totem;
- fiscal completo;
- contingência;
- franquias;
- hardware.

## Fontes

### Cardápio Web
- https://cardapioweb.com/
- https://cardapioweb.com/funcionalidades/

### Saipos
- https://saipos.com/
- https://saipos.com/sistema/restaurante
- https://saipos.com/sistema/roteirizacao-de-entregas
- https://saipos.com/sistema/saipos-entregador
- https://saipos.com/sistema/franquias
- https://saipos.com/perguntas

## Governança

Benchmark não é escopo automático. Toda funcionalidade deve passar por priorização, análise de dependências, segurança, custo operacional e valor para tenants.
