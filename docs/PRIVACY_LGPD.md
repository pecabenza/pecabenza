# Estrutura de Privacidade e Conformidade LGPD — SaaS SysFood

**Status:** Implementado e Homologado (Etapa 1C)  
**Versão:** 1.0  
**Data:** Outubro de 2026  
**Referência:** Lei Geral de Proteção de Dados Pessoais (Lei Federal nº 13.709/2018)

---

## 1. Papéis na Proteção de Dados (Modelo SaaS Multi-Tenant)

- **Controlador dos Dados:** O Tenant individual (ex: **BENZA**), responsável pelas decisões relativas ao tratamento dos dados pessoais de seus clientes e visitantes.
- **Operador dos Dados:** A plataforma **SysFood SaaS**, responsável por fornecer a infraestrutura tecnológica segura, banco de dados e APIs para viabilizar as operações do controlador.
- **Titulares dos Dados:** Os visitantes do site, clientes e compradores que interagem com o storefront da loja.

---

## 2. Princípios de Minimização e Finalidade Lícita

A plataforma opera sob a diretriz de **não coletar nenhum dado que não seja estritamente indispensável à operação gastronômica e comercial**:

| Dado Pessoal Coletado | Finalidade Específica | Base Legal (Art. 7º LGPD) | Prazo de Retenção |
|---|---|---|---|
| **Nome Completo** | Identificação do cliente para atendimento de pedidos e dúvidas. | Execução de Contrato / Procedimentos Preliminares (Inciso V) | Duração da relação comercial + 5 anos (prescrição cível). |
| **E-mail** | Envio de atualizações de pedidos, respostas a dúvidas e informativos autorizados. | Consentimento (Inciso I) ou Execução de Contrato (Inciso V) | Até revogação do consentimento ou término do contrato. |
| **Telefone / WhatsApp** | Alinhamento operacional de entrega e confirmação de encomendas. | Execução de Contrato (Inciso V) | Período de vigência do pedido e histórico do cliente. |
| **Hash de IP (`SHA-256`)** | Registro de log de conexão e segurança contra fraudes. Não armazena IP bruto. | Cumprimento de Obrigação Legal (Marco Civil da Internet - Art. 15). | 6 meses (exigência legal do Marco Civil). |
| **Preferência de Cookies** | Registro da escolha do usuário sobre telemetria analítica. | Consentimento (Inciso I) | 12 meses no navegador do usuário. |

> **PROIBIÇÃO EXPRESSA:** É terminantemente vedada a coleta de dados pessoais sensíveis (origem racial, convicção religiosa, dados de saúde, biometria ou dados genéticos) em qualquer componente da plataforma.

---

## 3. Gestão e Registro de Consentimentos (`user_consents`)

Tabela no banco: [`public.user_consents`](file:///e:/projetos/sysfood/supabase/migrations/00007_privacy_lgpd_and_seo.sql)  
Endpoint: [`/api/privacy/consent`](file:///e:/projetos/sysfood/src/app/api/privacy/consent/route.ts)

Quando o visitante interage com o banner de cookies ([`CookieConsentBanner.tsx`](file:///e:/projetos/sysfood/src/components/common/CookieConsentBanner.tsx)), o sistema registra:
- `tenant_id`: Identificador isolado da marca;
- `consent_type`: `'essential_only'` ou `'cookies_analytics'`;
- `purpose`: Finalidade expressa;
- `ip_hash`: Hash criptográfico SHA-256 do IP do cliente com salt seguro (garante pseudonimização);
- `user_agent`: Versão resumida do navegador;
- `created_at`: Carimbo de data/hora oficial.

---

## 4. Direitos do Titular e Atendimento a Solicitações (`privacy_requests`)

Tabela no banco: [`public.privacy_requests`](file:///e:/projetos/sysfood/supabase/migrations/00007_privacy_lgpd_and_seo.sql)  
Endpoint: [`/api/privacy/request`](file:///e:/projetos/sysfood/src/app/api/privacy/request/route.ts)

Em conformidade com o **Artigo 18 da LGPD**, qualquer titular pode solicitar:
1. **Acesso aos Dados (`access`):** Relatório dos dados pessoais vinculados ao seu e-mail.
2. **Exclusão de Dados (`deletion`):** Anonimização ou exclusão definitiva de registros de leads ou históricos não obrigatórios por lei fiscal.
3. **Retificação (`rectification`):** Atualização de dados cadastrais incorretos.

### Fluxo de Atendimento
1. A solicitação é recebida com rate limiting restrito (máximo 3 envios por minuto por IP);
2. É gerado um registro com status `'pending'` acessível apenas pelos administradores do tenant via RLS;
3. O prazo legal para resposta e conclusão é de até **15 dias úteis**.

---

## 5. Páginas Institucionais Obrigatórias

- **Política de Privacidade:** Disponível publicamente em [`/privacidade`](file:///e:/projetos/sysfood/src/app/(storefront)/privacidade/page.tsx), parametrizada com os dados de contato do tenant.
- **Termos de Uso:** Disponível publicamente em [`/termos`](file:///e:/projetos/sysfood/src/app/(storefront)/termos/page.tsx), esclarecendo as condições de consulta e encomenda.
