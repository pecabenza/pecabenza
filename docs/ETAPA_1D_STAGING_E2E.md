# Relatório de Homologação E2E — Etapa 1D: Supabase Único e Migrations Individuais

**Projeto:** PECABENZA SaaS (Tenant 01 — BENZA & Núcleo Multi-tenant)  
**Data:** Outubro de 2026  
**Ambiente:** Projeto Supabase Único (Homologação com `APP_ENV=staging` -> Transição Futura para Produção)  
**Estratégia de Banco:** **Migrations Individuais e Sequenciais** (00001 a 00007 como fonte oficial de verdade; bundle não utilizado como método principal).

---

## 1. Diretriz de Infraestrutura: Ambiente Único

Para otimizar custos, governança e integridade operacional do SaaS, adotamos um **único projeto no Supabase**:
1. **Fase Atual (Homologação):**
   - `APP_ENV=staging` ativo no `.env.local`;
   - Meta tags `noindex, nofollow` injetadas no storefront;
   - Domínio de homologação;
   - Modo `prelaunch` ativo na BENZA;
   - Checkout e pagamentos desativados.
2. **Fase Posterior (Produção Institucional):**
   - Transição assistida para `APP_ENV=production`;
   - Domínio definitivo configurado;
   - Liberação de indexação orgânica controlada;
   - Remoção de flags temporárias sem migração dolorosa entre instâncias de banco distintas.

---

## 2. Rito Obrigatório por Migration

Para cada migration individual em [`supabase/migrations/`](file:///e:/projetos/pecabenza/supabase/migrations):
1. **Executar** no SQL Editor do Supabase;
2. **Registrar** status de execução (sucesso/erro, tempo, observações);
3. **Validar** tabelas, funções, triggers e constraints criados;
4. **Validar** políticas de RLS e isolamento;
5. **Executar** teste automatizado específico (`tests/staging/migration-XXXXX.test.ts`);
6. **Avançar** para a próxima migration **apenas após validação 100% verde**.

*Caso ocorra erro:* Não avançar. Investigar a causa, corrigir o arquivo SQL correspondente, documentar e repetir a execução.

---

## 3. Matriz Oficial de Migrations Individuais & Testes Automatizados

| Migration | Arquivo SQL | Teste Automatizado | Status Atual |
|---|---|---|---|
| **00001** | [`00001_multi_tenant_foundation.sql`](file:///e:/projetos/pecabenza/supabase/migrations/00001_multi_tenant_foundation.sql) | [`tests/staging/migration-00001.test.ts`](file:///e:/projetos/pecabenza/tests/staging/migration-00001.test.ts) | **HOMOLOGADO** (3/3 testes verdes) |
| **00002** | [`00002_catalog_and_media.sql`](file:///e:/projetos/pecabenza/supabase/migrations/00002_catalog_and_media.sql) | [`tests/staging/migration-00002.test.ts`](file:///e:/projetos/pecabenza/tests/staging/migration-00002.test.ts) | **HOMOLOGADO** (3/3 testes verdes) |
| **00003** | [`00003_cms_and_sections.sql`](file:///e:/projetos/pecabenza/supabase/migrations/00003_cms_and_sections.sql) | [`tests/staging/migration-00003.test.ts`](file:///e:/projetos/pecabenza/tests/staging/migration-00003.test.ts) | **HOMOLOGADO** (3/3 testes verdes) |
| **00004** | [`00004_seed_benza.sql`](file:///e:/projetos/pecabenza/supabase/migrations/00004_seed_benza.sql) | [`tests/staging/migration-00004.test.ts`](file:///e:/projetos/pecabenza/tests/staging/migration-00004.test.ts) | **HOMOLOGADO** (4/4 testes verdes) |
| **00005** | [`00005_homologation_tenant_02.sql`](file:///e:/projetos/pecabenza/supabase/migrations/00005_homologation_tenant_02.sql) | [`tests/staging/migration-00005.test.ts`](file:///e:/projetos/pecabenza/tests/staging/migration-00005.test.ts) | **HOMOLOGADO** (3/3 testes verdes) |
| **00006** | [`00006_storage_tenant_assets.sql`](file:///e:/projetos/pecabenza/supabase/migrations/00006_storage_tenant_assets.sql) | [`tests/staging/migration-00006.test.ts`](file:///e:/projetos/pecabenza/tests/staging/migration-00006.test.ts) | **HOMOLOGADO** (2/2 testes verdes) |
| **00007** | [`00007_privacy_lgpd_and_seo.sql`](file:///e:/projetos/pecabenza/supabase/migrations/00007_privacy_lgpd_and_seo.sql) | [`tests/staging/migration-00007.test.ts`](file:///e:/projetos/pecabenza/tests/staging/migration-00007.test.ts) | **HOMOLOGADO** (4/4 testes verdes) |

---

### Migration 00001: [`00001_multi_tenant_foundation.sql`](file:///e:/projetos/pecabenza/supabase/migrations/00001_multi_tenant_foundation.sql)
- **Objetos Criados:**
  - Tabelas: `tenants`, `tenant_domains`, `tenant_members`, `tenant_settings`, `tenant_branding`, `audit_logs`;
  - Funções RBAC: `is_tenant_member`, `has_tenant_role`;
  - Triggers: `prevent_audit_log_tampering` (imutabilidade de logs);
  - Políticas RLS fundamentais em todas as 6 tabelas.
- **Critérios de Validação:**
  - Consulta com sucesso em todas as tabelas via client;
  - Tentativa de `UPDATE` ou `DELETE` em `audit_logs` rejeitada pelo trigger anti-tampering;
  - Leitura anônima permitida apenas para tenants e domínios ativos/verificados.
- **Teste Automatizado:** [`tests/staging/migration-00001.test.ts`](file:///e:/projetos/pecabenza/tests/staging/migration-00001.test.ts)

---

### Migration 00002: [`00002_catalog_and_media.sql`](file:///e:/projetos/pecabenza/supabase/migrations/00002_catalog_and_media.sql)
- **Objetos Criados:**
  - Tabelas: `product_categories`, `products`, `product_variants`, `product_information`, `media_assets`;
  - Constraints: `uq_product_categories_composite`, `uq_products_composite`, `uq_product_variants_composite`, `uq_product_information_composite`;
  - Políticas RLS: leitura pública de produtos ativos; edição restrita a administradores do respectivo tenant.
- **Critérios de Validação:**
  - Integridade referencial composta por `(tenant_id, id)` ativa;
  - RLS garantindo que um tenant não consiga manipular categorias ou produtos de outro.
- **Teste Automatizado:** [`tests/staging/migration-00002.test.ts`](file:///e:/projetos/pecabenza/tests/staging/migration-00002.test.ts)

---

### Migration 00003: [`00003_cms_and_sections.sql`](file:///e:/projetos/pecabenza/supabase/migrations/00003_cms_and_sections.sql)
- **Objetos Criados:**
  - Tabelas: `tenant_pages`, `tenant_page_sections`, `site_leads`;
  - Constraints de unicidade de slugs por tenant;
  - Políticas RLS: páginas publicadas visíveis no storefront; rascunhos visíveis apenas a administradores.
- **Critérios de Validação:**
  - Inserção e versionamento de seções JSONB;
  - Captura pública de leads vinculada autoritativamente ao tenant.
- **Teste Automatizado:** [`tests/staging/migration-00003.test.ts`](file:///e:/projetos/pecabenza/tests/staging/migration-00003.test.ts)

---

### Migration 00004: [`00004_seed_benza.sql`](file:///e:/projetos/pecabenza/supabase/migrations/00004_seed_benza.sql)
- **Objetos Criados:**
  - Tenant 01: `BENZA` (`id: 00000000-0000-0000-0000-000000000001`);
  - Domínios: `benza.localhost`, `localhost`, `benza.com.br`;
  - Configurações operacionais e branding oficial neutro (sem logo fictício);
  - Páginas institucionais: `home`, `sobre`, `produtos`, `contato`;
  - Produtos oficiais: `Feijoada BENZA`, `Lasanha Tradicional`;
  - Variantes em `ml` (500 ml e 1000 ml);
  - Mídias neutras, sem claims não homologados.
- **Critérios de Validação:**
  - Presença dos registros no banco com `site_mode = 'prelaunch'`;
  - Zero claims não homologados.
- **Teste Automatizado:** [`tests/staging/migration-00004.test.ts`](file:///e:/projetos/pecabenza/tests/staging/migration-00004.test.ts)

---

### Migration 00005: [`00005_homologation_tenant_02.sql`](file:///e:/projetos/pecabenza/supabase/migrations/00005_homologation_tenant_02.sql)
- **Objetos Criados:**
  - Tenant 02: `Cacau & Flor` (`id: 00000000-0000-0000-0000-000000000002`);
  - Domínio independente, branding distinto (Verde Oliva / Lavanda), páginas e produtos próprios;
  - Variantes em gramas (`g`);
  - Criação da base para testes reais de isolamento cruzado (cross-tenant).
- **Critérios de Validação:**
  - Isolamento estrito entre Tenant 01 e Tenant 02 confirmado no banco (zero overlap de IDs).
- **Teste Automatizado:** [`tests/staging/migration-00005.test.ts`](file:///e:/projetos/pecabenza/tests/staging/migration-00005.test.ts)

---

### Migration 00006: [`00006_storage_tenant_assets.sql`](file:///e:/projetos/pecabenza/supabase/migrations/00006_storage_tenant_assets.sql)
- **Objetos Criados:**
  - Bucket `tenant-assets` no Supabase Storage;
  - Estrutura de pastas: `tenants/{tenant_id}/{category}/{filename}`;
  - Colunas de conservação em `product_information` e asset classification (`asset_source`, `is_mockup`);
  - Storage Policies: Leitura pública para assets públicos; Upload, Update e Delete estritamente restritos a administradores do tenant identificado no path.
- **Critérios de Validação:**
  - Tentativa de upload em pasta de outro tenant rejeitada pelo Storage RLS.
- **Teste Automatizado:** [`tests/staging/migration-00006.test.ts`](file:///e:/projetos/pecabenza/tests/staging/migration-00006.test.ts)

---

### Migration 00007: [`00007_privacy_lgpd_and_seo.sql`](file:///e:/projetos/pecabenza/supabase/migrations/00007_privacy_lgpd_and_seo.sql)
- **Objetos Criados:**
  - Tabelas: `user_consents`, `privacy_requests`;
  - Campos em `site_leads`: `consent_ip_hash`, `consent_user_agent`, `consent_purpose`;
  - Campos em `tenant_settings`: `ga4_measurement_id`, `gsc_verification_tag`, `business_type`, `serves_cuisine`, `price_range`;
  - Campos de SEO em `tenant_pages` e `products`.
- **Critérios de Validação:**
  - Tabelas de privacidade ativas com RLS;
  - Inserção anônima de consentimento e solicitação de titular permitidas; leitura restrita a admins.
- **Teste Automatizado:** [`tests/staging/migration-00007.test.ts`](file:///e:/projetos/pecabenza/tests/staging/migration-00007.test.ts)

---

## 4. Status das Etapas e Homologação Atual

| Etapa / Objeto | Status | Observação |
|---|---|---|
| **Rate Limit Resiliente (Staging warn, Prod fail-closed)** | **HOMOLOGADO** | Testes de unidade e spy na observabilidade 100% verdes. |
| **CSP Menor Privilégio (Sem Cloudinary, sem Gateways)** | **HOMOLOGADO** | Whitelist estrita para serviços ativos. |
| **Testes Locais de Unidade & Segurança** | **APROVADO** | 66 testes verdes em 13 arquivos. |
| **Typecheck (`pnpm typecheck`)** | **APROVADO** | Zero erros de compilação TypeScript. |
| **Bateria Completa de Testes de Staging** | **HOMOLOGADO** | 28 testes verdes em 8 arquivos (`tests/staging/`). |
| **Conexão com Supabase Real** | **HOMOLOGADO** | Conexão autenticada e validada com sucesso. |
| **Migrations 00001 a 00007** | **100% HOMOLOGADAS** | Todas as 7 migrations individuais executadas e validadas. |
| **Suíte Global de Testes (`pnpm test`)** | **100% VERDE** | 94 testes verdes em 21 arquivos de teste. |

---

## 5. Conclusão da Etapa 1D

A infraestrutura e isolamento multi-tenant do **PECABENZA SaaS** em ambiente único de Supabase Staging estão plenamente homologados e funcionais.
Todas as migrações (00001 a 00007), RLS policies, schemas de dados, SEO e regras de privacidade LGPD foram verificadas e validadas.
