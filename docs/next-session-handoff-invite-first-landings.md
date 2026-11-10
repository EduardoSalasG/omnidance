# Handoff: invite-first + landings cost visuales CERRADO

Sesión 2026-11-10 (tarde-noche). Se completó todo el trabajo encargado
del handoff `next-session-handoff-import-invites-cierre.md` (§ Trabajo
NUEVO): 4 ítems implementados + fixtures seed. Dos changes OpenSpec
creados, implementados y archivados.

## Commits en dev

- `f7d581eb` feat(web): sección de costos de landings pro como cards
  visuales - pasos del dinero en academias y fee por plan destacado en
  productores.
- `ce9733fa` feat(academies): invitar como CTA principal de alumnos,
  alta directa como inscripción manual, valores por columna en
  importar y fixtures demo de corridas e invitados.

## Implementado

### Landings (`landing-cost-tables-visual`)

- Bloque `costTable` de `Landing.tsx` re-hecho: ya no es tabla de
  texto. Cards por medio de cobro/venta (método label → costo
  `text-3xl tabular-nums text-neon` + `costNote` sufijo → gain
  secundario), caption `perLabel` ("Por cada $10.000") sobre la
  grilla, `sm:grid-cols-3` si ≥3 filas.
- Academy: `steps` nuevo en catálogo (alumno paga → plataforma ordena
  → plata entra a ti) renderizado como `<ol>` de 3 pasos numerados.
- Producer: `planFees` nuevo - banda `border-neon/40 bg-neon/5` con
  Standard ~$736/~$417 y Pro ~$617/~$298 (gestionada vs métodos
  propios) como contenido destacado. `note` quedó solo "El asistente
  siempre paga el precio publicado."
- Catálogo: `colMethod`/`colCost`/`colGain` eliminados de los 4
  locales; `costNote` opcional por fila; `perLabel` nuevo.
  `CostTableMessages` tipo local en Landing.tsx (steps/planFees
  opcionales por variante; `planFees` extraído a binding por
  narrowing de TS en el map anidado).

### Consola academy (`academy-invite-first-polish`)

- `/academia/alumnos`: "Invitar" → botón primario; "+ Nueva
  inscripción" → `variant="secondary"` con `newEnrollment`
  renombrada a "Inscripción manual" (es) en `messages/*.json` ×4 -
  la misma clave titula el form de `/alumnos/nuevo` (coherente: es
  el mismo camino de liquidación). Tour `academia-alumnos` s5
  reescrito ×4 al orden nuevo.
- `/academia/configuracion/importar`: `studentsValues`/
  `scheduleValues` nuevos (arrays `{col, values}` ×4 locales) con
  valores reales del parser (sexo m/f/otro + alias, fecha DD/MM/YYYY
  o ISO, dia_semana nombres ES o 0-6 con domingo=0, HH:MM, mes
  YYYY-MM, estilo/nivel match insensible a acentos). Render `<dl>`
  col mono → valores antes de "Descargar plantilla". `studentsCols`
  perdió el paréntesis de fecha (ya está en values).
- `enrich-academy-seed.cjs` §8 nueva: por academia activa 1
  `AcademyImportRun` students (+1 schedule si no es COBROS) con
  results/counts textuales del servicio y 2 `AcademyInvite`
  pendientes (emails `local+{slug}@omnidance.dev`, `invitedById`=
  owner). Idempotente por clave natural. Verificado: 1ª corrida
  +38 runs/+42 invites, 2ª corrida +0/+0.

## Verificación corrida (evidencia)

- `pnpm --filter @omnidance/web typecheck`: OK.
- `npx eslint` sobre Landing/import-section/students-section: limpio.
- `node apps/web/scripts/i18n-audit.cjs` → ALL_KEYS_OK.
- `page.test.tsx` de importar: 3/3 verde.
- `node --check` del enrich + `pnpm db:enrich` ×2 (idempotente).
- `impeccable detect --json` sobre los 3 archivos UI → `[]`.
- Smoke HTML contra dev vivo: `/para-academias` sirve los pasos +
  "+ tu pasarela" + "Por cada $10.000"; `/para-productores` sirve la
  banda planFees con los 4 montos.
- `openspec validate --changes`: 3 changes OK antes de archivar.
- Ambos archivados con `openspec archive <name> --yes` (deltas
  aplicados: landing-marketing +1, student-invites/bulk-import/
  academy-demo-seed +1 c/u). El `.openspec-archive.lock` stale
  volvió a aparecer entre corridas: `rm` manual antes de reintentar.

## Docs actualizados

- `docs/qa-flows-inventory.md`: bullet Invitación reescrito (CTA
  principal + inscripción manual fallback) y bullet de importar con
  la muestra de valores.

## Operativo

- API dev :4000 y web dev :3000 vivos; Postgres/Redis healthy.
- Dev DB ya tiene los fixtures de corridas/invites del enrich.

## Pendientes generales (sin cambio)

- multipais-foundation tasks 10/11/13 (slices grandes sin abrir).
- Migración legacy→BYO en prod (ops: dry-run → scoped → global).
- Smoke manual BYO/MP con humano (init_point hosted → retorno →
  ACTIVE).
- Migración `20261129000000_academy_import_invites` corre con el
  deploy: auditar enrollments ACTIVE sin plan que pasarían a
  INACTIVE (sigue vigente del handoff anterior).

## Ideas no pedidas detectadas en el camino

- La card "Historial" de importar solo aparece con cap students;
  staff con solo `schedule` nunca ve corridas de su propio kind
  (mismo gate del endpoint - decision, no bug).
- `studentsCols`/`scheduleCols` y los `*Values` duplican parcialmente
  info del template descargable; si el parser gana columnas, ambos
  catálogos hay que tocarlos (sin fuente única).
