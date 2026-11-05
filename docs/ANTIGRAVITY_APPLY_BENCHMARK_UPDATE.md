# ANTIGRAVITY_APPLY_BENCHMARK_UPDATE.md

Leia integralmente:
- `/docs/ARCHITECTURE.md`
- `/docs/DEVELOPMENT_PLAN.md`
- `/docs/BENCHMARKS_COMPETITIVOS.md`
- `/docs/ARCHITECTURE_VISION_UPDATE.md`
- `/docs/DEVELOPMENT_PLAN_VISION_UPDATE.md`

## Objetivo

Incorporar formalmente a visão ampliada do produto nos documentos oficiais, sem alterar funcionalidades já homologadas.

## Ações

1. Atualizar `/docs/ARCHITECTURE.md` com:
   - novo posicionamento;
   - sete engines;
   - Multi-Tenant Platform Core;
   - feature flags;
   - preparação para multiunidade;
   - eventos de domínio;
   - pedido como entidade central;
   - ficha técnica;
   - produção/lotes;
   - Kanban/KDS;
   - integrações desacopladas;
   - Growth Engine.

2. Atualizar `/docs/DEVELOPMENT_PLAN.md` com o roadmap macro por engines.

3. Manter `/docs/BENCHMARKS_COMPETITIVOS.md` separado como documento estratégico.

4. Não modificar código, banco ou migrations nesta tarefa.

5. Não iniciar Etapa 2.

6. Não reabrir decisões homologadas de multi-tenancy, RLS, segurança, SEO, LGPD, observabilidade e institucional.

7. Preservar BENZA como Tenant 01 sem hardcode.

8. Ao final, apresentar diff resumido dos documentos alterados e confirmar que nenhum código foi modificado.

## Regra

Benchmark não é escopo automático.

Toda funcionalidade nova entra somente por etapa planejada e homologada.
