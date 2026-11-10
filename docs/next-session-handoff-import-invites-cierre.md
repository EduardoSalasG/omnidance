# Handoff: academy-import-invites CERRADO (web + docs + archive)

Sesión 2026-11-10 (tarde). Se completó lo pendiente del handoff
`next-session-handoff-import-invites.md`: frontend del flujo,
historial, i18n, docs y cierre del change OpenSpec.

## Commits en dev

- `1550989d` feat(academies): import con vista previa dry-run e
  historial de corridas (web + i18n + docs + archive del change).

## Implementado (web) - verificado

- `ImportCard` (`components/academy/import-section.tsx`): máquina de
  fases `idle → validating → preview → importing → done`. "Validar"
  postea `?dryRun=1` y muestra vista previa (chips de conteo por
  status + tabla + hint "nada se guardó"); "Importar" corre la corrida
  real → `ActionNotice` (`importDone` / `importDoneErrors` plural) +
  `onImported()` refresca el historial. Cambiar el archivo invalida
  la validación. Fallo del import real conserva la preview para
  reintentar.
- `ImportHistory` en la misma página (solo cap `students`, mismo gate
  del endpoint): lista `GET /import/runs` preview 5 + SeeAllRow, fila
  → ficha.
- Ficha `/academia/configuracion/importar/[runId]` solo lectura:
  ConsoleHeader back, header archivo + badge kind, dl
  fecha/tipo/archivo/filas, `StatusCounts`, `ImportResultsTable`
  completa. Estados loading/error/notFound(404 cross-academy).
- i18n `academyImport.*` re-hecho en los 4 catálogos: validate/
  previewHint/importDone(Errors plural)/historyTitle/field*/rowsTotal
  plural/notFound; status ahora `invited|resent|skipped|error|ok|warn`
  (`imported`/`updated` eliminados: AcademyImportRun es tabla nueva,
  no existen corridas legacy con esos status). `studentsCols` sin
  plan/pagado_hasta; nombres de columnas se dejan en español en todos
  los locales (son headers literales del CSV).
- Compartidos exportados: `StatusCounts`, `ImportResultsTable`,
  `kindLabel` (fallback a kind crudo si el API agrega uno nuevo),
  tipos `RowResult`/`ImportRunSummary`.

## Verificación corrida (evidencia)

- `pnpm typecheck`: shared + api + web OK.
- `pnpm lint`: 0 errores (74 warnings preexistentes, ninguno en
  archivos tocados; eslint sobre los 3 archivos: limpio).
- `pnpm test`: shared 20 + api 2615 (136 files) + web 46 (12 files)
  verdes; `page.test.tsx` de importar pasa sin cambios.
- `node scripts/i18n-audit.cjs` → `ALL_KEYS_OK`.
- `impeccable detect --json` sobre los 3 archivos UI → `[]`.
- `pnpm db:seed` re-corrido: idempotente OK.
- `node apps/api/scripts/export-api-docs.cjs` con API viva →
  `docs/openapi.json` + postman regenerados (387 paths; incluye
  `import/runs{,/{runId}}` + param `dryRun`).

## OpenSpec

- `academy-import-invites` archivado como
  `2026-11-10-academy-import-invites` (deltas aplicados a
  bulk-import/enrollment-model/student-invites). El lock stale de
  archive (`openspec/changes/archive/.openspec-archive.lock`, PID
  muerto de la sesión anterior) se borró a mano y el archive corrió
  con `--yes` (la confirmación interactiva falla en shell no-PTY).

## Docs actualizados

- `architecture.md` §Carga masiva: modelo invite + dryRun +
  AcademyImportRun + endpoints runs + consola.
- `flows.md`: diagrama re-hecho (dry-run → import → run) + bullets.
- `omni-dance.md` fila Alumnos: import = invitación bulk.
- `qa-flows-inventory.md`: bullet Alumnos corregido + bullet nuevo en
  §Config documentando la página `/academia/configuracion/importar`
  completa (antes no existía sección de la página).

## Operativo

- API dev corriendo en :4000 (`node dist/main.js`, build fresco de
  esta sesión) - quedó arriba para seguir trabajando.
- Postgres/Redis healthy.
- Prod: la migración `20261129000000_academy_import_invites` corre
  con el deploy - auditar antes enrollments ACTIVE sin plan que
  pasarían a INACTIVE.

## Fix posterior: mermaid en flows.md

- `506cd1ce` fix(docs): 15 de 42 bloques mermaid no renderizaban.
  Causa dominante: `;` literal dentro de texto de mensajes/notas de
  sequenceDiagram (el `;` es separador de statements a nivel lexer;
  ojo que `&lt;`/`&gt;` también lo contienen → se usó `‹›`). Fix:
  `#59;` (entidad mermaid que renderiza `;`). Además: un `alt` sin
  `end` (EOF error) y comillas sin escapar en label de flowchart
  (`["...#quot;..."]`).
- Verificación: `mermaid.parse` sobre todos los bloques → flows.md
  42/42 y architecture.md 3/3 OK. El checker quedó en
  `%TEMP%/mermaid-check` (mermaid 11 + jsdom, fuera del repo) - si se
  quiere permanente, conviene pasarlo a script del repo o CI.

## Pendientes generales (sin cambio)

- multipais-foundation tasks 10/11/13 (slices grandes sin abrir).
- Migración legacy→BYO en prod (ops: dry-run → scoped → global).
- Smoke manual BYO/MP con humano (init_point hosted → retorno →
  ACTIVE).
