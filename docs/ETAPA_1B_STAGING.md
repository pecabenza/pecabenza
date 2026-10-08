# ETAPA 1B — STAGING REAL, CORREÇÕES MANDATÓRIAS E HOMOLOGAÇÃO VISUAL DA BENZA

**Data de Atualização:** Outubro de 2026  
**Status do Pipeline de Staging:** 🛑 **NO-GO COM PENDÊNCIAS** (Aguardando criação da conta e projeto de Staging no Supabase pelo usuário)  
**Tenant Principal:** BENZA (Tenant 01)  
**Tenant de Homologação Cruzada:** Cacau & Flor Confeitaria (Tenant 02)  
**Veredito Técnico:** **CÓDIGO 100% HIGIENIZADO, ASSETS PROVISIONAIS IDENTIFICADOS COMO MOCKUP, BUNDLE DE MIGRATIONS PRONTO — PENDÊNCIA EXCLUSIVA DE PROVISÃO DO BANCO DE STAGING**

---

## 1. Diagnóstico do Pipeline de Staging Real (Ordem de Execução)

Em conformidade com o protocolo estrito de homologação, foi iniciada a verificação para conexão com o Supabase Staging real:

| Etapa | Verificação Obrigatória | Resultado / Diagnóstico Técnico | Status |
| :--- | :--- | :--- | :---: |
| **1** | Presença do `.env.local` | Arquivo localizado na raiz (`e:\projetos\sysfood\.env.local`). | ✅ **Presente** |
| **2** | Validação de Variáveis | `APP_ENV=staging` está presente. Porém, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` contêm valores literais de template/placeholder (`[ID_DO_PROJETO_STAGING]`, `[ANON_KEY...]`, `[SERVICE_ROLE_KEY...]`). Usuário confirmou que a conta e o projeto no Supabase ainda não foram criados. | ⚠️ **Pendente (Placeholder)** |
| **3 a 11** | Migrations, RLS, Auth, Upload e CMS em Staging | **Interrompido preventivamente conforme Regra 12**, pois a conexão com o banco real depende das credenciais autênticas do Supabase. | ⏸️ **Pausado** |
| **12** | Tratamento de Falha / Bloqueio | Interrupção imediata, documentação do estado e instruções claras para desbloqueio. | ✅ **Ativo** |
| **13** | Documentação Técnica | Atualização deste documento formalizando o status. | ✅ **Concluído** |
| **14** | Decisão Final | **NO-GO COM PENDÊNCIAS** (Impedimento externo de infraestrutura). | 🛑 **NO-GO COM PENDÊNCIAS** |

---

## 2. Guia de Ação Rápida para o Usuário (Desbloqueio de Staging)

Para que possamos avançar para os itens 3 a 11 (aplicação de migrations, criação de admin, testes de RLS, upload real e homologação), execute os seguintes passos no Supabase:

### Passo 1: Criar o Projeto no Supabase
1. Acesse [https://supabase.com](https://supabase.com) e faça login / crie sua conta gratuita.
2. Clique em **"New project"**.
3. Defina um nome (ex: `sysfood-staging`), selecione a região (ex: `São Paulo (sa-east-1)`) e defina uma senha forte para o banco.

### Passo 2: Copiar as Credenciais para o `.env.local`
No dashboard do projeto criado, acesse **Project Settings** (ícone de engrenagem) ➔ **API**:
- **Project URL:** Copie o valor (ex: `https://xyzcompany.supabase.co`) e coloque em:
  ```env
  NEXT_PUBLIC_SUPABASE_URL=https://xyzcompany.supabase.co
  ```
- **Project API Keys ➔ `anon` (public):** Copie o token JWT e coloque em:
  ```env
  NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
  ```
- **Project API Keys ➔ `service_role` (secret):** Copie o token e coloque em:
  ```env
  SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...
  ```
- Mantenha:
  ```env
  APP_ENV=staging
  ```

*(Lembrete de segurança: Nunca cole essas chaves diretamente no chat; salve-as apenas no arquivo `.env.local` do seu computador).*

### Passo 3: Aplicar as Migrations (1 Clique)
Foi gerado o arquivo consolidado [`supabase/staging_bundle.sql`](file:///e:/projetos/sysfood/supabase/staging_bundle.sql) contendo as 6 migrations completas (00001 a 00006):
1. No painel do Supabase, vá em **SQL Editor** no menu lateral esquerdo.
2. Clique em **"New query"**.
3. Copie todo o conteúdo de [`supabase/staging_bundle.sql`](file:///e:/projetos/sysfood/supabase/staging_bundle.sql), cole no editor e clique em **"Run"**.
4. Alternativamente, podem ser executadas as 6 migrations individuais da pasta `supabase/migrations/` em ordem sequencial.

Assim que você preencher o `.env.local` e executar o script SQL, avise no chat para executarmos os testes de validação real imediatamente!

---

## 3. Relatório das Correções Mandatórias da Etapa 1B (Já Concluídas)

Todas as 8 correções mandatórias de código e integridade da marca solicitadas foram concluídas e testadas:

| Item | Diretriz Obrigatória | Implementação Técnica Realizada | Status |
| :--- | :--- | :--- | :---: |
| **1. Logomarcas Geradas** | Proibido redesenhar ou reinterpretar a marca BENZA. | Arquivos renomeados para `mockup-provisional-*`. Storefront opera com **tipografia institucional neutra** (`{tenant.name}`) sem símbolos inventados até o cliente fornecer a marca oficial. | ✅ **Homologado** |
| **2. Imagens de IA como Mockup** | Marcar explicitamente como ilustrativas/mockup no código, seed e admin. | Arquivos renomeados para `mockup-*`. Tipagem e banco com `asset_source: 'mockup'` e `is_mockup: true`. Badge **"Imagem ilustrativa / mockup"** exibido no admin. | ✅ **Homologado** |
| **3. Remoção de -18°C Fixo** | Proibido hardcode de temperatura no seed, componentes ou CMS. | Removido qualquer `-18°C` fixo. Campos estruturados e configuráveis por prato: `temp_min`, `temp_max`, `temp_unit`, `shelf_life`, `conservation_instructions` e `after_thawing_instructions`. Para BENZA, mantido em aberto até homologação técnica do protocolo. | ✅ **Homologado** |
| **4. Storage Multi-Tenant** | `public/uploads` exclusivo para dev local. Produção/Staging via Supabase Storage. | Migration `00006_storage_tenant_assets.sql` cria bucket `tenant-assets` e RLS por tenant. Rota `/api/upload` resolve `tenant_id` autoritativamente via host no servidor, valida MIME/5MB e registra metadados em `media_assets`. | ✅ **Homologado** |
| **5. Botão "Restaurar Mockup"** | Tornar o botão agnóstico e desacoplado da BENZA. | Componente `ImageUploadField` refatorado para aceitar a prop genérica `defaultImageUrl` com rótulo institucional **"Restaurar imagem padrão"**. | ✅ **Homologado** |
| **6. Conteúdo Factual e Sóbrio** | Expurgar claims não homologados (*artesanal*, *gourmet*, *carnes nobres*, *ragu*, *ingredientes selecionados*, etc.). | Varredura e higienização completa em todo o código (`/src`), storefront, seed inaugural (`00004_seed_benza.sql`) e CMS. | ✅ **Homologado** |
| **7. Documentação Técnica** | Registrar inventário de assets, origens, política de substituição e Storage. | Documentado formalmente neste arquivo e em [`/docs/mockups_and_admin_system.md`](file:///e:/projetos/sysfood/docs/mockups_and_admin_system.md). | ✅ **Homologado** |
| **8. Validação e Qualidade** | `pnpm typecheck` com 0 erros e testes 100% verdes. Não iniciar Etapa 2. | `tsc --noEmit` executado com código 0. 25 testes aprovados no Vitest. Etapa 2 (checkout/pagamentos) intocada. | ✅ **Validado** |

---

## 4. Inventário Oficial de Assets e Origens

| Asset | Caminho no Projeto | Origem | Classificação | Política de Exibição / Substituição |
| :--- | :--- | :--- | :--- | :--- |
| **Logomarca Principal** | `public/assets/brands/benza/mockup-provisional-logo-primary.svg` | Vetor Provisório | ⚠️ **Mockup Provisório** | **Não exibido na loja.** Storefront renderiza tipografia neutra. Aguarda entrega do arquivo oficial (`.svg` ou `.png` em alta definição) pelo cliente. |
| **Logomarca Fundo Escuro** | `public/assets/brands/benza/mockup-provisional-logo-white.svg` | Vetor Provisório | ⚠️ **Mockup Provisório** | **Não exibido.** Aguarda asset oficial fornecido pelo cliente. |
| **Favicon da Marca** | `public/assets/brands/benza/mockup-provisional-favicon.svg` | Vetor Provisório | ⚠️ **Mockup Provisório** | **Não ativo como padrão.** Aguarda arquivo oficial do cliente. |
| **Hero Editorial** | `public/assets/brands/benza/mockup-hero-editorial.jpg` | Gerado por IA | 🧪 **Mockup Ilustrativo** (`asset_source = 'mockup'`) | Permitido apenas para validação de grid e contraste em desenvolvimento. Deve ser substituído por fotografia real homologada antes da publicação. |
| **Feijoada BENZA** | `public/assets/brands/benza/products/mockup-feijoada.jpg` | Gerado por IA | 🧪 **Mockup Ilustrativo** (`asset_source = 'mockup'`) | Exibido no admin com aviso obrigatório *"Imagem ilustrativa / mockup"*. Não pode ser utilizado para alegar apresentação real do produto. |
| **Lasanha Tradicional** | `public/assets/brands/benza/products/mockup-lasanha.jpg` | Gerado por IA | 🧪 **Mockup Ilustrativo** (`asset_source = 'mockup'`) | Exibido no admin com aviso obrigatório *"Imagem ilustrativa / mockup"*. Não pode ser utilizado para alegar apresentação real do produto. |

---

## 5. Delimitação Estrita de Escopo

- **Etapa 2 NÃO Iniciada:** Nenhuma funcionalidade de carrinho de compras, gateway de pagamento, cálculo de frete, checkout ou delivery foi codificada.
- **Próxima Ação Imediata:** Assim que o usuário salvar as credenciais reais no `.env.local` e executar o `staging_bundle.sql`, serão disparados os testes de integração do item 5 e a validação ponta a ponta dos itens 6 a 11.
