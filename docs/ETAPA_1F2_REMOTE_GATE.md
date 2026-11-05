# ETAPA 1F.2 — RELATÓRIO DO GATE REMOTO E TRANSIÇÃO PARA A ETAPA 2

**Data:** 03 de Novembro de 2026  
**Status da Etapa 1:** CONCLUÍDA LOCALMENTE (PRONTA PARA HOMOLOGAÇÃO REMOTA)  
**Veredito Técnico:** `GO TÉCNICO LOCAL`  
**Pendências Externas Congeladas:**
1. Apontamento de projeto Supabase ativo no `.env.local` (o host anterior retornou NXDOMAIN).
2. Substituição dos SVGs provisórios pela logomarca oficial do proprietário da BENZA.

---

## 1. Síntese do Estado da Etapa 1

A fundação do sistema (`Presence Foundation`, `Multi-Tenant Core`, `Admin Real`, `CMS Persistente`, `Segurança` e `SEO`) está completamente implementada, compilada e testada no código local:

* **Checagem de Tipos (`pnpm typecheck`):** 0 erros.
* **Suíte Local de Testes (`pnpm test`):** 14 arquivos, 78 testes unitários e de segurança aprovados (100% verde).
* **Compilação de Produção (`pnpm build`):** Compilação bem-sucedida de todas as rotas públicas, estáticas, dinâmicas e administrativas.
* **Contratos de Storage & Upload:** Frontend (`ImageUploadField.tsx`) e backend (`/api/upload`) unificados estritamente nas categorias `['logo', 'hero', 'products', 'general']`.
* **RBAC:** Alinhado com o banco de dados em `tenant_admin` e `tenant_manager`.
* **Segurança:** CSP sem resíduos de Cloudinary, uploads sem fallback para disco em staging/produção, upload de SVG de usuário desabilitado contra Stored XSS e sanitização de dados ativa.

---

## 2. Decisão de Continuidade

Por instrução do usuário, a criação e vínculo da nova conta do Supabase foi postergada para um momento oportuno, permitindo que o desenvolvimento avance sem interrupções desnecessárias.

Quando a nova conta do Supabase for criada, o procedimento será direto e sem impacto no código já pronto:
1. Inserir a nova URL e chaves no `.env.local`.
2. Executar as migrations sequenciais `00001` a `00007` no SQL Editor do Supabase.
3. Executar `pnpm vitest run tests/staging/` para homologação remota.

---

## 3. Próximo Marco: Etapa 2 — Commerce Engine

Com a Etapa 1 tecnicamente fechada, o projeto avança para a **Etapa 2 — Commerce Engine**:

1. **Catálogo Transacional & Disponibilidade:**
   - Detalhes de pratos, porções, variações e preços.
   - Regras de corte e lote de produção (ex.: produção Seg-Qua, entregas Qui-Dom).
2. **Motor de Carrinho de Compras (`CartContext`):**
   - Drawer/modal responsivo do carrinho.
   - Adição de pratos com escolha de porções e quantidades.
   - Cálculo de subtotal e persistência em `localStorage`.
3. **Checkout Sem Conta Obrigatória:**
   - Formulário ágil (Nome, WhatsApp, E-mail, CPF para nota).
   - Modalidade de entrega: Retirada no balcão vs Delivery.
   - Endereço de entrega e janelas de agendamento.
4. **Pagamento Inicial & Confirmação:**
   - Pix estático com chave, QR Code e instrução para envio de comprovante.
   - Tela de confirmação e resumo de pedido (`/pedido/[id]`).
   - Integração com notificação via WhatsApp.

