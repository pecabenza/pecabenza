# Diretório de Assets da Marca — BENZA (Tenant 01)

> **DIRETRIZ ESTRITA DE HOMOLOGAÇÃO (ETAPA 1B):**  
> 1. É terminantemente proibido redesenhar, reinventar símbolos ou reinterpretar a identidade visual da BENZA.  
> 2. Logomarcas e imagens oficiais devem ser fornecidas pelo cliente e depositadas neste diretório mantendo proporções, traçados e tipografia originais.  
> 3. Quaisquer arquivos com prefixo `mockup-` são ilustrações provisórias de teste para desenvolvimento e homologação visual, com flag `asset_source = 'mockup'`. NUNCA devem ser divulgados como produto ou fotografia oficial.

---

## 1. Status dos Assets

| Asset Esperado | Arquivo Alvo Oficial | Status Atual | Observação |
|---|---|---|---|
| **Logomarca Principal** | `logo-primary.svg` / `logo-primary.png` | ⏳ **Aguardando cliente** | Aplicação opera com tipografia institucional neutra |
| **Logomarca Fundo Escuro** | `logo-white.svg` / `logo-white.png` | ⏳ **Aguardando cliente** | Sem versão oficial homologada |
| **Favicon** | `favicon.png` / `favicon.ico` | ⏳ **Aguardando cliente** | Sem versão oficial homologada |
| **Fotografia Hero** | `hero-editorial.jpg` | 🧪 *Mockup ilustrativo (`mockup-hero-editorial.jpg`)* | Uso restrito a testes de layout |
| **Fotografia Feijoada** | `products/feijoada.jpg` | 🧪 *Mockup ilustrativo (`products/mockup-feijoada.jpg`)* | Uso restrito a testes de layout |
| **Fotografia Lasanha** | `products/lasanha.jpg` | 🧪 *Mockup ilustrativo (`products/mockup-lasanha.jpg`)* | Uso restrito a testes de layout |

---

## 2. Política de Substituição

Assim que os arquivos oficiais forem disponibilizados:
1. Depositar os arquivos oficiais com os nomes de destino acima;
2. Atualizar o cadastro via painel administrativo (`/admin/identidade` e `/admin/produtos`);
3. Os metadados no banco de dados registrarão `asset_source = 'official'`.
