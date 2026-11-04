# Handoff: auditoría consola + console-audit-fixes implementado

**Rama**: `dev` · commits `6642bd75` (feat) + archivo openspec.
Working tree limpio.

## Qué se hizo

### Auditoría post-polish (7 agentes herdr)
`docs/console-audit-2026-11-04.md`: cobertura del polish `25e1cea8`
contra console-patterns + expand "Ver todo". 2 bloqueantes (colas de
cobros tragando errores; `/analitica/usuarios` sin ConsoleHeader) +
~25 gaps + 10 lugares sin expand. Briefs en `docs/audit-briefs/`.

### `console-audit-fixes` (archivado, `6642bd75`)
Implementado por 6 implementadores herdr en paralelo (scopes
disjuntos) + 1 para API query. Todo verificado: `tsc --noEmit` web y
api limpios, `i18n-audit` ALL_KEYS_OK, vitest api 2458 pass / 1 fallo
**preexistente** (`private-lessons.controller.spec.ts`: el fake no
implementa `academyInstructor.findMany` que HEAD ya usa en detail() —
no es de este change, candidato a fix chico).

- `SeeAllRow`+`LIST_PREVIEW` en `components/ui` (series migrado);
  expands en alumnos, planes, preventas, encuestas profe, ficha
  analítica, import CSV, cola claims (preview 20).
- ConsoleHeader universal (raíces drawer + config sub-pages).
- Forbidden≠error en fichas cobros y equipo; niveles al patrón
  (/nuevo + /[id]); promos refactor módulo-prop + vuelta a lista;
  Spinner inline; cross-refs Link; hover /60; ThemeToggle min-h-11.
- API: `?limit`+cap comentarios en instructor surveys; `q` en
  /instructors; `personId` suplementario en `POST /query/run`
  (drill QueryTable; export no lo propaga).
- Specs canónicas actualizadas al archivar; openapi+postman
  regenerados (367 paths); qa-flows-inventory + skill
  console-patterns actualizados (excepción videos, SeeAllRow).

## En vuelo

- **orch-a/orch-b** (panes herdr w1:pT/pV): análisis de orquestación
  multi-agente → `docs/orchestration-model.md` (pods + revisor vs
  alternativas, prior art superpowers/openspec). Revisar y decidir si
  se adopta → actualizar sección "Orquestación multi-agente" de
  AGENTS.md.

## Pendiente

- Smoke visual de las superficies tocadas (task §13): cobros,
  alumnos/[id], planes/[id], preventas, niveles (nuevo/[id]), promos,
  analitica/usuarios, import CSV — el dev server quedó corriendo
  (`pnpm dev`, stack OK en :3000/:4000).
- Test roto preexistente arriba citado.
- Secciones NO auditadas: asistencia, horarios, clases, particulares,
  academia/page (candidatas próxima pasada; asistencia/horarios sin
  ConsoleHeader ni skeletons).
- `pnpm db:enrich` sigue sin correr; multipais-foundation tasks
  10/11/13.
