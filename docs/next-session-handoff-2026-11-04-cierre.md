# Handoff: cierre de maratón console-audit + KPI hints + ficha video

**Rama**: `dev`. Working tree limpio al commit de este doc.
Stack: `pnpm dev:api` (:4000) y `pnpm dev:web` (:3000) corriendo en
background shells de esta sesión; si murieron, `pnpm dev`.

## Commits de la sesión (orden)

1. `6642bd75` feat: `console-audit-fixes` (6 implementadores paralelos
   + 1 query-api). Archivado en
   `openspec/changes/archive/2026-11-04-console-audit-fixes/`; specs
   canónicas sincronizadas. Auditoría en
   `docs/console-audit-2026-11-04.md`.
2. `abd3cb5b` fix test preexistente: fake `academyInstructor.findMany`
   en spec de private-lessons.
3. `a6a9b0b4`+`195db308` docs: `docs/orchestration-model.md` (pods +
   revisor analizado: NO adoptar capa fija; fan-out por partición de
   archivos, wait al-vuelo, review bajo demanda, pod-reviewer solo
   si 5+ impl Y contrato compartido) → sección AGENTS.md ya al día.
4. `2aa220fd` e2e smoke visual 21 rutas mobile+desktop (8/8).
5. Redirect fix nivel `[id]` save + `e2e/states-check.spec.ts`
   (forbidden y error+retry verificados verdes con screenshots).
6. Commit grande KPI+videos: hint visible en TODAS las KPI/insight
   cards (patrón `academy-kpi-strip`, registrado en skill
   console-patterns §"KPI / insight cards"); ficha
   `/academia/videos/[id]` nueva (card navega, delete en zona roja
   ConfirmSheet, fuera la excepción del skill);
   `docs/e2e-flow-tests-design.md` (mapa ruta→spec + tags).
7. impl-vapi: `PATCH` + `GET` by-id de
   `/academies/:id/videos/:videoId` en videos.controller.ts + spec
   13/13 verde, tsc api limpio. openapi.json + postman regenerados.

## Pendiente INMEDIATO (continuar aquí)

- **Ficha video front**: `apps/web/.../academia/videos/[id]/page.tsx`
  sigue escaneando el listado paginado; refactor para usar el nuevo
  GET by-id + convertirla en página de editar (PATCH ya existe;
  reusar `video-form.tsx` si sirve). Comentario del archivo dice que
  los endpoints no existen — actualizarlo.
- **`docs/qa-flows-inventory.md` sección Videos**: anotar los nuevos
  endpoints (PATCH edit, GET detalle).
- Smoke visual de la ficha video (nueva superficie, no cubierta por
  el recorrido).

## Pendiente mayor

- Implementar los specs de flujo según `docs/e2e-flow-tests-design.md`
  (mapa ruta→spec ya diseñado; arrancar por la lista priorizada).
- Secciones NO auditadas contra console-patterns: asistencia,
  horarios, clases, particulares, academia/page.
- multipais-foundation tasks 10/11/13.

## Notas operativas

- Patrón nuevo para tests de estados: `page.route("**/academies/**",
  r => r.abort())` simula API caída sin tocar el server;
  `--no-deps` salta el auth setup cuando los storageStates ya
  existen (los logins del setup golpean throttle si la API está caída).
- "done"/"idle" de `herdr agent list` puede ser prematuro (agente
  bloqueado en diálogo de permiso): confirmar con `agent read` antes
  de dar por cerrado un scope.
- Matar procesos: el watch de nest (`start --watch`) y el server
  (`node dist/main`) son procesos distintos; matar solo el watch
  deja el server vivo. Al matar el padre de `pnpm dev` muere web
  también — reiniciar ambos.
