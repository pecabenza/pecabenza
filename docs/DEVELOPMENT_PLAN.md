# Plano de Desenvolvimento — Plataforma SaaS Multi-Tenant

> **Fase Vigente:** Etapa 1 — Fundação + Site Institucional BENZA (Tenant 01)  
> **Status:** Em execução  
> **Data:** 30/09/2026  
> **Referência Arquitetural:** `/docs/ARCHITECTURE.md`

---

## 1. Visão Geral da Etapa 1

A Etapa 1 estabelece os alicerces arquiteturais da plataforma SaaS multi-tenant e entrega o primeiro produto público em produção: o **site institucional premium da BENZA (Tenant 01)** em modo pré-lançamento (`prelaunch`).

### Escopo Inclusivo
- Fundação multi-tenant (banco, RLS, middleware de resolução por host e injeção de contexto).
- Supabase PostgreSQL com integridade referencial cross-tenant (composite foreign keys).
- Funções auxiliares seguras de RBAC (`SECURITY DEFINER` com `search_path` fixo).
- Sistema de CMS com seções reutilizáveis e schemas estritos via Zod.
- Identidade visual configurável (tokens injetados via CSS Variables no SSR, sem FOUC).
- Site institucional BENZA (Home, Sobre, Produtos, Ficha Técnica, Contato) em modo `prelaunch`.
- Painel administrativo inicial do Tenant (`/admin`) para gestão de identidade, páginas, catálogo e SEO.
- SEO técnico e editorial de primeiro nível (Server Components, JSON-LD, sitemap, robots, Open Graph).
- Responsividade estrita Mobile First (320px a 1440px).

### Escopo Exclusivo (NÃO implementar nesta etapa)
- Carrinho de compras.
- Checkout e processamento de pagamentos.
- Gestão e fila de pedidos transacionais.
- Logística, entregas e portal do entregador.
- Controle avançado de lotes e estoque em tempo real.

---

## 2. Cronograma de Execução e Portas de Aprovação

| Marco | Atividade | Entregáveis | Critério de Aceite |
|---|---|---|---|
| **M1** | **Documentação Técnica** | `DEVELOPMENT_PLAN.md`, `DATABASE.md`, `SECURITY.md`, `SEO.md` | Alinhamento total com as 11 diretrizes aprovadas. |
| **M2** | **Setup do Projeto** | Next.js 15+ (App Router), TypeScript, Tailwind CSS, Zod, Supabase Client | Build sem erros, linting estrito, tipagem 100%. |
| **M3** | **Modelagem & Migrations** | `00001_multi_tenant_foundation.sql`, `00002_catalog_and_media.sql`, `00003_cms_and_sections.sql`, `00004_seed_benza.sql` | Integridade cross-tenant (composite FKs), RLS default-deny, audit_logs imutável. |
| **M4** | **Fundação do Núcleo** | Middleware de resolução de host, contexto do tenant, injeção de tema/tokens SSR | Isolamento comprovado; zero menções hardcoded à BENZA no core. |
| **M5** | **Sistema CMS & Seções** | Schemas Zod de seções, `SectionRenderer`, blocos modulares neutros | Conteúdo e claims 100% parametrizados via banco/props. |
| **M6** | **Storefront Institucional BENZA** | Páginas Home, Sobre, Produtos, Detalhe do Produto, Contato | Visual editorial premium, modo `prelaunch`, sem botões de compra. |
| **M7** | **Painel Administrativo Inicial** | Autenticação Supabase, edição de identidade, seções, produtos e SEO | Rota privada protegida, feedback de validação, auditoria de mudanças. |
| **M8** | **Homologação & Auditorias** | Auditoria RLS cross-tenant, teste responsivo (320–1440px), SEO & Core Web Vitals | Relatório final da Etapa 1 apresentado. |

---

## 3. Matriz de Responsabilidades e Regras de Qualidade

1. **Pureza do Núcleo Compartilhado:**
   - Nenhum componente, função de utilidade, middleware ou rota pode conter condicionais do tipo `if (tenant.slug === 'benza')`.
   - O UUID da BENZA gerado no seed é determinístico para testes locais, mas o sistema deve operar estritamente por resolução dinâmica de domínio/slug.
2. **Mobile First Inegociável:**
   - Todo componente deve ser desenhado e implementado a partir de telas pequenas (320px–390px) e expandido via breakpoints utilitários (`md:`, `lg:`).
   - Zero rolagem horizontal indevida.
3. **Defesa em Profundidade:**
   - Acesso a dados é filtrado no PostgreSQL via RLS e reiterado na camada de aplicação através de `tenant_id` explícito nas consultas.
