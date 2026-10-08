# Estratégia de SEO Técnico, Dados Estruturados e Motor de Auditoria — SaaS SysFood

**Status:** Implementado e Homologado (Etapa 1C)  
**Versão:** 2.0  
**Data:** Outubro de 2026  
**Referência:** Google Search Essentials & Core Web Vitals Guidelines

---

## 1. Princípios de SEO da Plataforma

1. **SEO Nativo e Automático para Cada Novo Tenant:**
   - Cada cliente cadastrado no SaaS herda automaticamente:
     - Tags canônicas absolutas baseadas no seu domínio verificado;
     - Sitemap XML dinâmico com prioridades e frequências de atualização;
     - `robots.txt` inteligente (bloqueia staging contra indexação prematura e libera produção com proteção de rotas administrativas);
     - Metadados dinâmicos e Open Graph / Twitter Cards com fallback institucional;
     - Dados estruturados Schema.org injetados como Server Components.
2. **Server-Side Rendering (SSR) e Zero Dependência de JS:**
   - 100% do conteúdo público (títulos, descrições, preços, ingredientes, porções e fichas técnicas) é renderizado no primeiro stream HTML recebido pelos rastreadores do Google.
3. **Conteúdo Útil e Natural (Anti-Keyword Stuffing):**
   - O sistema rejeita repetições artificiais de termos. O foco é a resposta clara à intenção de busca do consumidor.

---

## 2. Estrutura de Metadados e Open Graph

### 2.1 Resolução Dinâmica (`generateMetadata`)
Implementada em todas as páginas públicas:
- `/` (Home)
- `/produtos` (Cardápio geral)
- `/produtos/[slug]` (Página de detalhe do prato)
- `/sobre` (Nossa proposta e manifesto)
- `/contato` (Canais de atendimento e formulário)
- `/privacidade` (Política de privacidade LGPD)
- `/termos` (Termos de uso)

### 2.2 Tags Open Graph e Twitter Cards
```html
<meta property="og:title" content="Feijoada BENZA | BENZA" />
<meta property="og:description" content="Feijão preto cozido com carnes e temperos clássicos. Embalagens de 500 ml e 1000 ml." />
<meta property="og:type" content="product" />
<meta property="og:url" content="https://benza.com.br/produtos/feijoada-benza" />
<meta property="og:site_name" content="BENZA" />
<meta name="twitter:card" content="summary_large_image" />
```

---

## 3. Dados Estruturados Schema.org (JSON-LD)

Módulo: [`src/lib/seo/schema.ts`](file:///e:/projetos/sysfood/src/lib/seo/schema.ts)

Injetados no `<head>` das páginas como Server Components:

### 3.1 `Restaurant` / `LocalBusiness` (Home, Sobre e Contato)
```json
{
  "@context": "https://schema.org",
  "@type": "Restaurant",
  "name": "BENZA",
  "url": "https://benza.com.br",
  "telephone": "+55 11 98765-4321",
  "servesCuisine": "Brasileira",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "São Paulo, SP — Atendimento e encomendas programadas",
    "addressCountry": "BR"
  }
}
```

### 3.2 `Product` & `Offer` (Detalhe do Prato)
```json
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "Feijoada BENZA",
  "description": "Feijão preto cozido com carnes e temperos clássicos.",
  "offers": {
    "@type": "Offer",
    "priceCurrency": "BRL",
    "price": "48.00",
    "availability": "https://schema.org/PreOrder",
    "url": "https://benza.com.br/produtos/feijoada-benza",
    "seller": {
      "@type": "Organization",
      "name": "BENZA"
    }
  }
}
```

### 3.3 `BreadcrumbList` (Navegação Estruturada)
Auxilia o Google a exibir breadcrumbs nos snippets de pesquisa (ex: `Início > Cardápio > Feijoada BENZA`).

---

## 4. Motor de Auditoria SEO do SaaS (SEO Health Engine)

Módulos:
- Motor de Avaliação: [`src/lib/seo/audit.ts`](file:///e:/projetos/sysfood/src/lib/seo/audit.ts)
- API de Diagnóstico: [`src/app/api/seo/audit/route.ts`](file:///e:/projetos/sysfood/src/app/api/seo/audit/route.ts)
- Painel Administrativo: [`src/app/(tenant-admin)/admin/seo/page.tsx`](file:///e:/projetos/sysfood/src/app/(tenant-admin)/admin/seo/page.tsx)

### Matriz de Regras e Classificação de Problemas

| Regra Auditada | Condição de Alerta | Severidade | Impacto Técnico |
|---|---|---|---|
| **Title Tag** | Ausente ou vazio | 🔴 **Crítico** | Falha grave de indexação nos mecanismos de busca. |
| **Title Length** | `< 25` ou `> 65` caracteres | 🟡 **Importante** | Risco de truncamento no snippet de busca do Google. |
| **Meta Description** | Ausente ou vazia | 🔴 **Crítico** | Reduz taxa de cliques (CTR) nos resultados orgânicos. |
| **Meta Description Length** | `< 50` ou `> 165` caracteres | 🟡 **Importante** | Snippet incompleto ou cortado no mobile. |
| **Heading H1** | Ausente | 🔴 **Crítico** | Prejudica a compreensão da hierarquia semântica. |
| **URL / Slug** | Letras maiúsculas ou caracteres especiais | 🟡 **Importante** / 🔴 **Crítico** | Risco de conteúdo duplicado e URLs quebradas. |
| **Canonical URL** | Ausente | 🟡 **Importante** | Falta de sinalização do domínio canônico principal. |
| **Alt Text em Imagens** | Imagens sem descrição alternativa | 🟡 **Importante** (ou 🔴 se > 2) | Acessibilidade prejudicada e perda de tráfego no Google Imagens. |
| **Keyword Stuffing** | Densidade da palavra-chave `> 4.5%` | 🔴 **Crítico** | Risco de punição por prática enganosa (spam). |
| **Thin Content** | Texto editorial `< 40` palavras | 🔵 **Recomendação** | Oportunidade de enriquecer com instruções de conservação e preparo. |

---

## 5. Estratégia de Conteúdo por Intenção de Busca (Exemplo BENZA)

O CMS permite configurar a **intenção de busca** predominante para cada conteúdo:

1. **Comercial (Cardápio e Vitrine):**
   - Intenção: Comparação de pratos, porções e preços.
   - Termos alvo: *"comida congelada em porções"*, *"cardápio de refeições congeladas"*, *"feijoada individual congelada"*.
2. **Transacional (Detalhe do Prato):**
   - Intenção: Decisão de compra e encomenda.
   - Termos alvo: *"comprar feijoada congelada"*, *"encomendar lasanha tradicional"*.
3. **Informacional (Sobre e Ficha Técnica):**
   - Intenção: Dúvidas sobre descongelamento, tempo de aquecimento no forno e conservação.
   - Termos alvo: *"como aquecer feijoada congelada no fogão"*, *"como descongelar lasanha forneável"*.
4. **Navegacional (Institucional e Contato):**
   - Intenção: Encontrar os canais oficiais da marca.
   - Termos alvo: *"BENZA gastronomia"*, *"contato BENZA"*.

---

## 6. Blindagem de Core Web Vitals (CWV)

- **LCP (Largest Contentful Paint):**
  - Componente Next.js `Image` com propriedade `priority` restrita ao banner da dobra superior.
  - Imagens com formatos modernos (`WEBP` e `AVIF`) e compressão otimizada.
- **CLS (Cumulative Layout Shift):**
  - Proporções (`aspectRatio`) e dimensões declaradas em todas as imagens e containers.
  - Fontes Google carregadas via `next/font` com `font-display: swap` prevenindo FOIT/FOUC.
- **TTFB (Time to First Byte):**
  - Next.js Edge Runtime e Server Components com streaming direto do servidor.
  - Headers de segurança cacheados via CDN em produção.
