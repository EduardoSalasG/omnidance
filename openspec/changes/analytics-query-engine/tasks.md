# Tasks — analytics-query-engine

Orden de dependencia: 1 sella los contratos (schema + catálogo shared) →
2 y 4 pueden paralelizar (API vs Web-core) → 3 sigue a 2 (mismo módulo) →
5 sigue a 4.1 (necesita FilterBar) → 6 integra.

## 1. Contratos y schema (fundación — orquestador)

- [x] 1.1 `model SavedReport` en `schema.prisma` (personId, role, name,
  params Json, timestamps, index [personId, role]) + migración versionada
  `20261008000000_saved_report` (migrate dev no corre non-TTY en Windows:
  se generó con `migrate diff` + `migrate deploy`) — verificado:
  `prisma migrate status` → "Database schema is up to date" (29 migraciones)
- [x] 1.2 `packages/shared/src/query-catalog.ts`: `FilterType`,
  `FilterDef`, `EntityDef`, `QUERY_CATALOG` por lente (PRODUCER 7
  entidades, ACADEMY_OWNER 6, ADMIN 13), tipos `QueryRunInput/Result`,
  `SavedReportParams` — verificado: `pnpm --filter @omnidance/shared build`
  limpio. NOTA: zod no existe en el repo (AGENTS.md lo menciona pero nunca
  se instaló) — contratos = types + const arrays; validación server-side
  por whitelist (patrón existente)
- [x] 1.3 `SYSTEM_QUERIES` por lente en shared (plantillas sin scope:
  producer=sales/checkins/guestlist; academy=students/attendance/payments;
  admin=events/payments/payouts) — exportado vía `index.ts`

## 2. API — motor de consultas (workstream API-core)

- [x] 2.1 Extraer las queries por entidad de `browse.controller.ts` a
  `src/query/entities/*.ts` (funciones puras prisma+scope+filters);
  `/admin/browse/:entity` delega al registry — verifica: `/admin/datos`
  responde igual (smoke de 3 entidades) y tests existentes pasan
- [x] 2.2 Scope resolver `role+personId → scopeWhere` por entidad
  (admin={}, producer=eventos/series propios, academy=academias propias) —
  verifica: unit test de scoping (evento ajeno → vacío)
- [x] 2.3 Extraer export builders (`sales/checkins/guestlist`, `toCsv`,
  PDF) de `events.controller.ts` al engine; `/events/:id|series/:id/export.*`
  delegan y aceptan filtros opcionales (from/to + whitelist por dataset) —
  verifica: `node apps/api/scripts/smoke-export-pdf.cjs` pasa y
  `?status=FOO` → 400
- [x] 2.4 `src/query/query.controller.ts`: `GET /query/catalog?role=`,
  `POST /query/run`, `GET /query/export.csv|pdf` con SessionGuard +
  validación de lente aprobado + gate `pro.required` en lente PRODUCER —
  verifica: curl de los 4 endpoints por rol; 403 sin aprobación
- [x] 2.5 `GET|POST|PATCH|DELETE /query/saved` (CRUD SavedReport, params
  validados por zod del catálogo; ajeno → 404) — verifica: tests o curl
  de ciclo create→list→patch→delete

## 3. API — datasets por lente (workstream API-datasets)

- [x] 3.1 PRODUCER: registrar `attendees` (check-ins distinct persona),
  `reservations` (TableReservation), `waitlist`, `rsvps` con sus
  filtros — verifica: `/query/run` devuelve filas por cada entity
- [x] 3.2 ACADEMY_OWNER: `students`, `attendance`, `bookings`,
  `memberships`, `payments`, `private_lessons` (scope academia propia,
  selector multi-academia) — verifica: run por entity + scoping (academia
  ajena → vacío)
- [x] 3.3 ADMIN: exponer las entidades de browse ya migradas + `payouts`
  si no está — verifica: catálogo admin lista las entidades y run responde
- [x] 3.4 Columnas/labels y `summary` por dataset (es-CL), nombres de
  Person resueltos vía join existente — verifica: paridad preview/export

## 4. Web — componentes + página Consultas (workstream Web-core)

- [x] 4.1 `components/query/FilterBar.tsx` (q debounce, selects enum,
  selects FK lazy, fechas con presets) + `QueryTable.tsx` (tabla
  headers/rows + total) — verifica: compilación + render con catálogo
  mock
- [x] 4.2 `/analitica` gana sub-nav Dashboard|Consultas (pills del mismo
  patrón que el selector de lente); `/analitica/consultas/page.tsx`
  completa: builder → preview → export links → guardar/listar consultas —
  verifica: flujo E2E manual por rol + `tsc --noEmit` limpio
- [x] 4.3 Quitar `ExportSection` de `/productor/eventos/[id]` y sus keys
  i18n huérfanas — verifica: página renderiza sin la sección, audit i18n
- [x] 4.4 `i18n/parts/query.json` (labels de filtros, acciones, saved) —
  verifica: `ALL_KEYS_OK`

## 5. Refactor de filtros en módulos (workstream Web-refactor + API)

- [x] 5.1 `/admin/datos` migra a `FilterBar`+`DataTable`+saved/export —
  verifica: mismas entidades/filtros que antes + export funciona
- [x] 5.2 Academia: `alumnos` (status/plan/q/gender), `asistencia`,
  `clases`, `cobros`, `particulares`, `planes`, `series` — FilterBar +
  params en su endpoint de lista — verifica: filtrar por estado funciona
  y las acciones por fila siguen operando
- [x] 5.3 Productor: `eventos` (status/type/fechas/venue), `listas`,
  `pagos`, `comprobantes`, `codigos` — verifica igual
- [x] 5.4 Admin restantes: `usuarios` (gana filtros del catálogo sobre su
  `q` actual), `finanzas`, `auditoria`, `campanas` — verifica igual
- [x] 5.5 Params de catálogo en endpoints de lista (academies, events,
  admin controllers) — default sin params = comportamiento actual —
  verifica: tests o curl por endpoint tocado

## 6. Integración (orquestador)

- [x] 6.1 `openspec validate --changes` verde; `pnpm build` web+api;
  `pnpm test` — verifica: output citado
- [x] 6.2 `node apps/api/scripts/export-api-docs.cjs` → docs/openapi.json
  + postman regenerados; `docs/architecture.md` y `docs/flows.md`
  actualizados — verifica: diff commiteado
- [ ] 6.3 QA manual por lente (320/768/1024/1440) + handoff en `docs/` —
  verifica: handoff escrito con evidencia
