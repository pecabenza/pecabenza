# Arquitetura de Analytics, Google Consent Mode v2 e Telemetria Multi-Tenant — SaaS SysFood

**Status:** Implementado e Homologado (Etapas 1C e 1C.1)  
**Versão:** 1.1  
**Data:** Outubro de 2026  
**Tecnologia:** Google Analytics 4 (GA4), Google Consent Mode v2, Google Search Console (GSC) e DataLayer Nativo

---

## 1. Princípios da Telemetria Multi-Tenant

1. **Configuração Isolada por Tenant:**
   - Cada empresa possui seus próprios IDs de rastreamento configuráveis em `tenant_settings`:
     - `ga4_measurement_id`: ID de fluxo da Web do GA4 (ex: `G-ABC123XYZ`);
     - `gsc_verification_tag`: Código do meta tag de verificação do Google Search Console.
   - Nenhuma métrica ou tráfego de um tenant vaza ou é compartilhado com outro.
2. **Carregamento Otimizado (Zero Impacto no LCP/INP):**
   - O script do Google Tag Manager é carregado com a estratégia `afterInteractive` do Next.js via [`GoogleAnalytics.tsx`](file:///e:/projetos/sysfood/src/components/common/GoogleAnalytics.tsx).
   - O carregamento só ocorre se houver um ID configurado e se o usuário tiver aceitado cookies analíticos.
3. **Respeito Estrito à Privacidade e LGPD:**
   - Se o usuário selecionar "Apenas Essenciais" no banner de consentimento, nenhum script de terceiros é executado e nenhuma chamada para `google-analytics.com` é disparada.
   - A diretiva `anonymize_ip: true` é ativa por padrão no GA4.

---

## 2. Google Consent Mode v2 (Privacidade por Design)

A plataforma implementa conformidade total com o **Google Consent Mode v2**, garantindo que nenhum dado analítico ou de publicidade seja coletado antes da manifestação de vontade do usuário.

Módulo centralizador: [`src/lib/analytics/consent.ts`](file:///e:/projetos/sysfood/src/lib/analytics/consent.ts)

### 2.1 Parâmetros Regulatórios Suportados

| Parâmetro Consent Mode v2 | Finalidade | Estado Padrão (Default) | Estado se "Aceitar Todos" | Estado se "Apenas Essenciais" |
|---|---|---|---|---|
| **`analytics_storage`** | Armazenamento de cookies analíticos (GA4) | `denied` | `granted` | `denied` |
| **`ad_storage`** | Armazenamento de cookies de publicidade | `denied` | `granted` | `denied` |
| **`ad_user_data`** | Envio de dados do usuário para anúncios Google | `denied` | `granted` | `denied` |
| **`ad_personalization`** | Remarketing e publicidade personalizada | `denied` | `granted` | `denied` |

### 2.2 Fluxo de Inicialização e Atualização

1. **Estado Inicial Negado:**
   - Antes do carregamento de qualquer script externo, um script inline (`strategy="beforeInteractive"`) registra no `window.dataLayer`:
     ```javascript
     gtag('consent', 'default', {
       'analytics_storage': 'denied',
       'ad_storage': 'denied',
       'ad_user_data': 'denied',
       'ad_personalization': 'denied',
       'wait_for_update': 500
     });
     ```
2. **Interação com o Banner:**
   - Quando o visitante clica em **"Aceitar Todos"**:
     - `localStorage` armazena `sysfood_privacy_consent = 'all'`;
     - Dispara `gtag('consent', 'update', { analytics_storage: 'granted', ... })`;
     - O componente [`GoogleAnalytics.tsx`](file:///e:/projetos/sysfood/src/components/common/GoogleAnalytics.tsx) carrega o script GA4 assincronamente sem exigir recarregamento de página.
   - Quando o visitante clica em **"Apenas Essenciais"**:
     - `localStorage` armazena `sysfood_privacy_consent = 'essential'`;
     - Dispara `gtag('consent', 'update', { analytics_storage: 'denied', ... })`;
     - Nenhum script externo de tracking é injetado.

---

## 3. Catálogo Oficial de Eventos da Plataforma

Módulo centralizador: [`src/lib/analytics/events.ts`](file:///e:/projetos/sysfood/src/lib/analytics/events.ts)

### 3.1 Eventos Atuais (Fase de Staging & Cardápio Institucional)

| Nome do Evento | Parâmetros Enviados | Gatilho / Momento de Disparo | Finalidade Analítica |
|---|---|---|---|
| **`page_view`** | `page_path`, `page_title`, `tenant_id` | Carregamento de qualquer página pública. | Medição de volume de acessos e páginas mais visitadas. |
| **`product_view`** | `product_id`, `product_name`, `product_price`, `tenant_id` | Abertura da página `/produtos/[slug]`. | Avaliação de interesse por prato específico. |
| **`contact_click`** | `contact_channel`, `tenant_id` | Clique em links de e-mail ou telefone. | Medição de intenção de contato direto. |
| **`whatsapp_click`** | `tenant_id`, `page_path` | Clique em botões de WhatsApp oficial. | Medição de conversão comercial primária. |
| **`lead_submit`** | `page_path`, `tenant_id` | Envio com sucesso do formulário de contato. | Medição de captação de leads e dúvidas. |

### 3.2 Eventos Preparados para a Etapa 2 (Loja Virtual & Checkout)

A arquitetura do módulo `events.ts` já possui as tipagens e interfaces preparadas para integração imediata na Etapa 2:

| Evento Futuro | Parâmetros Previstos |
|---|---|
| **`add_to_cart`** | `product_id`, `product_name`, `variant_id`, `price`, `quantity`, `unit_value` |
| **`begin_checkout`** | `cart_value`, `items_count`, `currency` |
| **`coupon_apply`** | `coupon_code`, `discount_value` |
| **`delivery_selected`** | `delivery_mode` (retirada / delivery), `neighborhood`, `fee` |
| **`purchase`** | `order_id`, `transaction_value`, `payment_method`, `items` |

---

## 4. Integração com Google Search Console (GSC)

- A tag de verificação configurada pelo tenant em `tenant_settings.gsc_verification_tag` é injetada automaticamente como Server Component no `<head>` de todas as páginas:
  ```html
  <meta name="google-site-verification" content="CÓDIGO_DO_TENANT" />
  ```
- Isso permite que cada dono de tenant valide a propriedade do seu domínio no Google Search Console de forma autônoma pelo painel administrativo em `/admin/seo`, sem necessitar de suporte de engenharia ou acesso a registros DNS.
