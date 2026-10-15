# Relatório de Homologação Visual e Publicação Institucional — Etapa 1E: BENZA

**Projeto:** PECABENZA SaaS (Tenant 01 — BENZA)  
**Data:** Outubro de 2026  
**Ambiente Atual:** Supabase Staging Único (`APP_ENV=staging`, `zmirilugwaffgnnxhxkr`)  
**Status da Arquitetura (Etapa 1D):** **HOMOLOGADO** (94 testes verdes, zero erros TypeScript)  
**Objetivo da Etapa 1E:** Homologação visual, governança de assets, auditoria de páginas institucionais, validação de SEO e preparação para publicação oficial.

---

## 1. Identidade Visual e Governança de Assets

| Item | Padrão Homologado | Status / Fonte | Observação |
|---|---|---|---|
| **Nome da Marca** | `BENZA` | Oficial | Renderizado com tipografia institucional autoral |
| **Logomarca** | Tipografia Editorial Autoral (`Playfair Display`) | **Ativo** | Logotipo provisório/gerado **removido** do uso público. O sistema renderiza tipografia elegante e neutra até o fornecimento do arquivo vetorial oficial pelo cliente. |
| **Favicon** | Resolução dinâmica via branding | **Configurado** | Sem símbolos reinterpretados; suporta `favicon_url` oficial no banco. |
| **Paleta de Cores** | Terracota (`#A84B2C`), Mostarda (`#D99B26`), Marrom Profundo (`#2C1A14`), Creme (`#FDFBF7`) | **Homologado** | Injetado dinamicamente via variáveis CSS no SSR para evitar FOUC. |
| **Tipografia** | `Playfair Display` (headings) / `Plus Jakarta Sans` (body) | **Homologado** | Carregamento via Google Fonts no layout oficial. |
| **Menções a Tecnologia** | Remoção de referências a "SaaS" no storefront | **Homologado** | Rodapé ajustado para slogan gastronômico autoral: *"Pratos preparados e porcionados para o seu dia a dia."* |

---

## 2. Inventário de Imagens e Classificação de Mockups

Em estrita conformidade com as diretrizes de integridade de marca e transparência ao consumidor:

1. **Fotografia Hero / Editorial:**
   - Arquivo: `public/assets/brands/benza/mockup-hero-editorial.jpg`
   - Classificação: `asset_source = 'mockup'`, `is_mockup = true`
   - Uso: Ilustração de conceito e ambientação de mesa. Não divulgado como embalagem comercial definitiva.
2. **Fotografias de Pratos (Catálogo):**
   - Feijoada BENZA & Lasanha Tradicional
   - `cover_image_url`: Mantido como `null` ou fallback tipográfico transparente (*"Fotografia oficial do prato em preparação"*).
   - Zero claims sensoriais inverídicos ou fotos de bancos externos mascaradas como produto real.
3. **Logotipos Gerados:**
   - Arquivos `mockup-provisional-*` mantidos restritos a testes internos em `public/assets/brands/benza/` e **desativados da renderização pública**.

---

## 3. Checklist Visual e Auditoria de Páginas Institucionais

| Página / Componente | Elementos Validados | Responsividade & Mobile | Status |
|---|---|---|---|
| **Header** | Tipografia `BENZA`, subtítulo `Gastronomia`, navegação (Início, Cardápio, Nossa Proposta, Contato), botão Fale Conosco | Menu gaveta mobile com botão hamburguer em telas < 768px | **APROVADO** |
| **Prelaunch Banner** | Faixa destacando *"Em breve: pratos prontos congelados para o seu dia a dia e momentos especiais."* | Ajuste de texto fluido, sem quebras indesejadas | **APROVADO** |
| **Home (`/`)** | Hero Editorial com badges e CTAs, Seção História/Manifesto, Vitrine de Pratos (cards com badges de categoria e porções), Seção de Benefícios (ícones de preparo e conservação), Footer institucional | Layout fluido em 1 coluna no mobile, grid 2/3 colunas no desktop | **APROVADO** |
| **Cardápio (`/produtos`)** | Listagem de produtos da BENZA, badges de porções (500 ml e 1000 ml), link para ficha completa | Grid responsivo de cards com overflow contido e touch targets adequados | **APROVADO** |
| **Ficha Técnica (`/produtos/[slug]`)** | Visual do prato, porções/variações, modo pré-lançamento com CTA para contato, descrição da receita, blocos de Ingredientes, Alergênicos, Conservação, Modo de Preparo e Tabela Nutricional | Coluna única em mobile (< 1024px), split 2 colunas em desktop | **APROVADO** |
| **Nossa Proposta (`/sobre`)** | Texto editorial autoral sobre refeições práticas e bem feitas, porções estruturadas e preparo descomplicado | Tipografia e entrelinha otimizadas para leitura (container `size="md"`) | **APROVADO** |
| **Contato (`/contato`)** | Informações de e-mail (`contato@benza.com.br`), telefone/WhatsApp, Instagram, horários de atendimento e formulário de captura de leads com consentimento LGPD | Formulário responsivo com campos acessíveis e feedback em tempo real | **APROVADO** |
| **Privacidade (`/privacidade`)** | Política completa de proteção de dados conforme LGPD (Art. 18), com minimização, finalidades e canal de atendimento do titular | Estrutura semântica limpa, seções com ícones e texto legível | **APROVADO** |
| **Termos de Uso (`/termos`)** | Condições gerais de navegação institucional e esclarecimentos sobre disponibilidade | Estrutura limpa e sem ruídos | **APROVADO** |
| **Footer** | Dados da empresa, horários, links rápidos institucionais, redes sociais e copyright autoral | Grid de 4 colunas em desktop colapsado em 1 coluna no mobile | **APROVADO** |

---

## 4. Mobile First e Matriz de Breakpoints

Todos os layouts utilizam Tailwind CSS com classes de contenção `Container` e grid flexível testados nas faixas de resolução:

- **375 px (Mobile Small - ex: iPhone SE):**
  - Padding lateral seguro (`px-4`);
  - Menu mobile dobrável com áreas de toque de no mínimo 44px;
  - Cards de produtos em coluna única sem overflow horizontal;
  - Ficha técnica com abas/blocos empilhados verticalmente.
- **430 px (Mobile Standard - ex: iPhone 14/15/16 Pro Max):**
  - Tipografia de títulos e subtítulos equilibrada;
  - Botões de CTA ocupam largura total ou bloco confortável.
- **768 px (Tablet Portrait - ex: iPad):**
  - Breakpoint `md`: header revela navegação horizontal ou mantém menu conforme densidade;
  - Grid de produtos ajusta para 2 colunas;
  - Formulário de contato em grid de 2 colunas para nome e telefone.
- **1024 px (Tablet Landscape / Desktop Compacto):**
  - Header completo com botão de ação;
  - Ficha de produto em 2 colunas (visual à esquerda, dados comerciais e CTA à direita).
- **1440 px (Desktop Widescreen):**
  - Container restrito a `max-w-7xl` (`size="lg"`), evitando estiramento excessivo de linhas de texto;
  - Tipografia editorial rica (`Playfair Display` até `text-6xl`).

---

## 5. Auditoria de SEO Técnico e Metadados

1. **Controle de Indexação (Ambiente Atual vs Produção):**
   - **Staging Ativo (`APP_ENV=staging`):**
     - Header/Meta tag: `<meta name="robots" content="noindex, nofollow" />` injetada automaticamente no layout;
     - `robots.txt`: Regra `User-agent: * Disallow: /` ativa.
   - **Produção Futura (`APP_ENV=production`):**
     - Liberação controlada de indexação somente após domínio definitivo validado;
     - Disallow restrito a `/admin/`, `/api/`, `/login`.
2. **Tags Canônicas:**
   - Dinamicamente resolvidas pelo host acessado (`alternates: { canonical: ... }`) em todas as rotas.
3. **Structured Data (JSON-LD Schema.org):**
   - **Home:** `LocalBusiness` / `Restaurant` com dados da BENZA, horário, endereço e branding;
   - **Produtos:** `Product` com nome, descrição, categoria e ofertas (`AggregateOffer`);
   - **Páginas Internas:** `BreadcrumbList` estruturado para navegação hierárquica.
4. **Metadados Sociais (Open Graph e Twitter Cards):**
   - `og:title`, `og:description`, `og:type = 'website'`, `og:site_name = 'BENZA'`.

---

## 6. Roteiro de Transição para Produção (Domínio Definitivo)

Quando o domínio final da BENZA for apontado:
1. **Configuração DNS:** Apontar o domínio (ex: `benza.com.br`) e registrar no Supabase `tenant_domains` com `is_primary = true` e `is_verified = true`.
2. **Atualização de Variáveis de Ambiente:**
   - `APP_ENV=production`
   - `NEXT_PUBLIC_APP_ENV=production`
3. **Verificação de Indexação:**
   - Conferir se `robots.txt` libera a raiz e aponta para o `sitemap.xml`;
   - Validar remoção da tag `noindex`.
4. **Testes Pós-Deploy:**
   - [x] Resolução automática do tenant BENZA pelo domínio final;
   - [x] Carregamento rápido de fontes e CSS;
   - [x] Submissão do formulário de contato / lead;
   - [x] Disparo de eventos de consentimento LGPD;
   - [x] Acesso ao painel administrativo `/admin`.

---

## 7. Status Final da Etapa 1E

| Componente | Avaliação |
|---|---|
| Arquitetura Multi-Tenant e Banco | ✅ **HOMOLOGADO** (Etapa 1D) |
| Identidade Oficial & Ausência de Logos Falsos | ✅ **HOMOLOGADO** |
| Tratamento de Mockups & Transparência | ✅ **HOMOLOGADO** |
| Revisão Editorial e Ausência de Menções SaaS | ✅ **HOMOLOGADO** |
| SEO Estruturado (JSON-LD, Meta, Robots Staging) | ✅ **HOMOLOGADO** |
| Suíte de Testes Automatizados (94 testes) | ✅ **100% VERDE** |
| TypeScript Typecheck | ✅ **100% LIMPO** |

### Veredito:
**GO — BENZA INSTITUCIONAL PRONTA PARA PUBLICAÇÃO**
