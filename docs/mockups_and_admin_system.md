# Sistema de Mockups, Gestão de Mídia e Painel Administrativo

**SaaS SysFood — Arquitetura de Mídia e Parametrização Multi-Tenant**  
**Documento de Referência:** Homologação Etapa 1B  
**Tenant Referência:** BENZA (Tenant 01)

---

## 1. Classificação e Inventário de Assets

Para garantir conformidade com as diretrizes do cliente e integridade da marca, todos os arquivos de mídia do projeto são categorizados de maneira explícita:

| Identificador | Localização Atual | Origem do Arquivo | Classificação do Asset | Regra de Exibição no SaaS |
|---|---|---|---|---|
| **Logomarca Principal** | `public/assets/brands/benza/mockup-provisional-logo-primary.svg` | Vetor provisório de teste | ⚠️ **Mockup Provisório** | **Desativado no storefront.** O sistema exibe tipografia neutra elegante `{tenant.name}` até o cliente fornecer a marca oficial. |
| **Logomarca Fundo Escuro** | `public/assets/brands/benza/mockup-provisional-logo-white.svg` | Vetor provisório de teste | ⚠️ **Mockup Provisório** | **Desativado.** Reservado apenas para homologação técnica interna. |
| **Favicon** | `public/assets/brands/benza/mockup-provisional-favicon.svg` | Vetor provisório de teste | ⚠️ **Mockup Provisório** | **Desativado.** Aguarda ícone oficial homologado. |
| **Hero Editorial** | `public/assets/brands/benza/mockup-hero-editorial.jpg` | Imagem gerada por IA | 🧪 **Mockup Ilustrativo** (`asset_source = 'mockup'`) | Permitido temporariamente apenas em desenvolvimento para validação de layout. Flag `is_mockup: true`. |
| **Prato Feijoada** | `public/assets/brands/benza/products/mockup-feijoada.jpg` | Imagem gerada por IA | 🧪 **Mockup Ilustrativo** (`asset_source = 'mockup'`) | Apresentado no painel administrativo com o rótulo obrigatório: **"Imagem ilustrativa / mockup"**. Não representa foto real. |
| **Prato Lasanha** | `public/assets/brands/benza/products/mockup-lasanha.jpg` | Imagem gerada por IA | 🧪 **Mockup Ilustrativo** (`asset_source = 'mockup'`) | Apresentado no painel administrativo com o rótulo obrigatório: **"Imagem ilustrativa / mockup"**. Não representa foto real. |

---

## 2. Política de Substituição de Assets

### 2.1 Identidade Visual (Logomarcas e Favicon)
- **Regra de Ouro:** É terminantemente proibido inventar símbolos, redesenhar traçados ou alterar a tipografia da marca oficial.
- Quando a contratante fornecer o pacote de identidade oficial:
  1. Os arquivos definitivos serão depositados em formato original (`.svg` ou `.png` de alta resolução).
  2. A associação poderá ser feita diretamente pelo painel administrativo em `/admin/identidade` ou via migration de dados.
  3. No banco de dados, o campo `branding.logo_url` receberá a URL final e a mídia terá `asset_source = 'official'`.

### 2.2 Fotografias Gastronômicas dos Pratos
- Nenhuma imagem gerada por inteligência artificial pode ser divulgada como fotografia real dos pratos BENZA.
- No momento da produção das fotos reais de estúdio ou cozinha:
  1. O administrador realiza o upload da imagem homologada na edição do prato em `/admin/produtos`.
  2. O sistema armazena o arquivo no bucket multi-tenant do Supabase Storage.
  3. O campo `product.asset_source` é alterado para `'official'` e `product.is_mockup` para `false`.

---

## 3. Arquitetura Definitiva de Storage

### 3.1 Isolamento Multi-Tenant no Supabase Storage
Para ambientes de staging e produção, o armazenamento de mídia segue uma hierarquia estrita no bucket `tenant-assets`:

```
tenant-assets/{tenant_id}/{categoria}/{nome-sanitizado}-{timestamp}-{hash}.{ext}
```

Exemplos de paths gerados:
- `tenant-assets/00000000-0000-0000-0000-000000000001/branding/logo-oficial-1728345678-a1b2c3d4.svg`
- `tenant-assets/00000000-0000-0000-0000-000000000001/products/feijoada-lote1-1728345678-e5f6g7h8.jpg`
- `tenant-assets/00000000-0000-0000-0000-000000000001/hero/banner-inaugural-1728345678-i9j0k1l2.jpg`

### 3.2 Segurança e RLS
- **Resolução Autoritativa de Tenant:** O endpoint `/api/upload` extrai o host da requisição via headers seguros do servidor e resolve o tenant através de `resolveTenantByHost`. Qualquer tentativa de forjar `tenant_id` no client-side é sumariamente ignorada.
- **Validação de Conteúdo:**
  - Tipos MIME estritamente aceitos: `image/jpeg`, `image/png`, `image/webp`, `image/svg+xml`, `image/x-icon`.
  - Tamanho máximo por arquivo: 5 MB (5.242.880 bytes).
- **Políticas de Storage RLS (Migration 00006):**
  - **Leitura pública:** Permissão `SELECT` para todos os objetos do bucket `tenant-assets` para permitir distribuição via CDN rápida.
  - **Gravação restrita:** Permissões `INSERT`, `UPDATE` e `DELETE` em `storage.objects` condicionadas à claim JWT do usuário autenticado correspondente ao prefixo do path (`(storage.foldername(name))[1] = auth.jwt() ->> 'tenant_id'`).
- **Registro em `media_assets`:** Todo upload registra dimensões, tamanho em bytes, MIME, caminho relativo e `asset_source`.
- **Fallback Local de Desenvolvimento:** Se as credenciais do Supabase não estiverem configuradas (desenvolvimento local offline), o upload salva temporariamente em `public/uploads/`. Esse comportamento é restrito exclusivamente ao ambiente de desenvolvimento local (`APP_ENV !== 'production' && APP_ENV !== 'staging'`).

---

## 4. Componente Agnóstico `ImageUploadField`

O componente reutilizável do SaaS SysFood ([`src/components/admin/ImageUploadField.tsx`](file:///e:/projetos/sysfood/src/components/admin/ImageUploadField.tsx)) é completamente desacoplado de qualquer tenant individual:

- **Preview Dinâmico:** Exibe a imagem atual com badge informativo caso seja um asset classificado como mockup.
- **Rótulo Agnóstico:** O botão de restauração é padronizado como **"Restaurar imagem padrão"** (e não mais "Restaurar Mockup").
- **Parametrização por Prop:** O comportamento de imagem padrão é controlado via prop `defaultImageUrl`, definida no contexto de cada tenant ou mídia.
- **Upload e URL Remota:** Suporta tanto o envio de arquivo local com sanitização e barra de progresso quanto a atribuição direta por URL externa.

---

## 5. Parametrização de Produtos e Conservação

Seguindo a diretriz de não utilizar valores fixos ou hardcoded (como o antigo `-18°C`), a conservação é um conjunto de parâmetros configuráveis e opcionais por produto:

| Campo no Banco (`product_information`) | Tipo | Descrição Técnica | Exemplo no Admin |
|---|---|---|---|
| `temp_min` | `DECIMAL` (opcional) | Temperatura mínima recomendada | `-18.0` ou `null` |
| `temp_max` | `DECIMAL` (opcional) | Temperatura máxima recomendada | `-12.0` ou `null` |
| `temp_unit` | `VARCHAR(2)` | Unidade de medida de temperatura | `'C'` ou `'F'` |
| `shelf_life` | `VARCHAR` (opcional) | Prazo ou critério de validade | `"Conforme rótulo do lote"` |
| `conservation_instructions` | `TEXT` (opcional) | Orientações detalhadas de armazenamento | `"Manter congelado conforme orientação da embalagem."` |
| `after_thawing_instructions` | `TEXT` (opcional) | Procedimento e prazo pós-descongelamento | `"Após descongelar, manter refrigerado e consumir em até 24h. Não recongelar."` |

Para a marca BENZA, todos os dados de temperatura numérica permanecem em aberto/despublicados até que o protocolo de congelamento, transporte e rotulagem seja formalmente homologado pela equipe técnica.
