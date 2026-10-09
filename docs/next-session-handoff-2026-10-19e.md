# Handoff - 2026-10-19e (academy-console-v3: consola owner completa)

## Completado en esta sesión (commits en dev, sin push)

Change OpenSpec `academy-console-v3` **completo y archivado**
(`2026-10-09-academy-console-v3`). Reestructura integral de la consola
de dueño de academia pedida por el usuario: navegación, Clases como
entidad navegable, detalles con acciones, KPIs por módulo, encuestas,
y paginación en todos los listados.

Commits del change (en orden):

| Commit | Slice |
|---|---|
| `295e46e` | A-C: warn token, nav, Clases listado+detalle, borrado lógico, asistencia instructor |
| `1024d1e` | D-F: Planes KPIs/detalle, Cobros detalle+historial unificado, Equipo con acuerdo económico |
| `52ab2e9` | G-I: Particulares sin comisión, /analitica única por lente, score alumno, perfil owner, config multi-page |
| `55c2672` | J: Encuestas mensuales curso/profe end-to-end |
| `0d18309` | K: Paginación en todos los listados + docs API |
| `68555f6` | Archive del change (specs canónicas actualizadas) |

### A. UI fixes
- `ExpiringList`: `flex-1` en celda nombre (mobile colapsaba con
  `truncate`).
- Token `--warn` (amber-700 claro / amber-300 oscuro) en globals +
  `warn` en tailwind; amber literal fuera de consola owner, billing y
  HomeHub (en modo claro el amber-500/100 se lavaba).

### B. Nav y estructura
- Sidebar owner: Inicio solo al tope; Planes→sección Administración;
  eliminados Analítica duplicado, Asistencia y Horarios; "Series"
  →"Clases".
- `ConsoleHeader`: back con nombre solo en subpáginas (nivel ≥2); las
  raíces del sidebar no muestran back.
- Perfil owner sin racha/pagos/academias; Apariencia movida a
  Configuración (owner y productor); configuración como sección de
  páginas (incl. medios de pago).

### C. Clases (series)
- `/academia/series` rebautizada "Clases": default solo activas,
  filtros modalidad (`typeId`) y nivel (`levelId`), cards navegables
  sin acciones inline, botón "Importar clases" (CSV) junto a filtros.
- Detalle `/academia/series/[id]`: editar, slots, desactivar/
  reactivar, **eliminar lógico** (`ClassSeries.deletedAt` +
  migración), próximas clases con reservas, historial con asistencia
  e instructor.
- Asistencia: nuevo `POST /classes/:id/attendance` — solo instructor
  efectivo del slot o admin; alumno debe tener reserva BOOKED. Roster
  gana `canMark` + botón Presente. `POST /academies/:id/attendance`
  legacy restringido igual. `/academia/asistencia` y
  `/academia/horarios` → redirect a Clases.
- Import CSV: `capacidad` → `ClassSeries.quorum`; grupo por nombre de
  serie; materialización rodante (hoy → fin del mes siguiente + fechas
  futuras del mes CSV).

### D. Planes
- KPIs: activos, top3 del mes con alumnos + comparativa.
- Sort nombre/precio asc/desc; cards → detalle `/academia/planes/[id]`
  con alumnos vigentes (inicio/fin); editar desde ahí.

### E. Cobros
- `GET /academies/:id/claims/:claimId` y `GET /academies/:id/payments/
  :paymentId` (capacidad payments): detalle con comprobante,
  validador, fechas.
- Historial unificado (claims resueltos + pagos pasarela), estilo del
  segundo; cards → página de detalle.
- KPIs: facturación mes, ticket promedio, top3 métodos + comparativa.
- Medios de pago movidos a `/academia/configuracion/medios-pago`.

### F. Equipo
- Un solo CTA "Agregar": elige profe vs colaborador → form común →
  permisos o acuerdo económico.
- `AcademyInstructor`: `payType` (PER_CLASS/MONTHLY), `payAmount`,
  `payClasses` + migración; `commissionPct` queda legacy (validación
  manual 0-100 en `updateInstructor` porque specs saltan pipes).
- Detalle miembro (permisos editables, nivel 3) y detalle profe
  (stats, clases impartidas, acuerdo editable, encuestas por mes).

### G. Clases particulares
- Sin filtro de comisión ni sección instructor-neto — solo solicitudes
  + confirmar fecha/hora. La relación económica se gestiona en Equipo.

### H. Analítica
- `/analitica` = única superficie (consultas); chips rol/vista fuera;
  rol = lente activa. Dashboard viejo eliminado.

### I. Alumno + perfil
- Detalle alumno muestra `RelationshipScore` (score + segmento,
  privado al actor academia).

### J. Encuestas mensuales curso/profe
- `CourseSurvey` schema + migración; job mensual
  `academies.course_surveys` (1ro 06:00); endpoints alumno
  (`/me/course-surveys`, POST submit rating 1-5 curso y profe +
  observación opcional); resultados owner **agregados y anónimos**
  por mes en detalle de clase y por mes/serie en detalle de profe.

### K. Paginación (este commit)
- Contrato `{items,total,page,pageSize}` + helper `pageParams`
  (default page=1/size=25, max 100, inválidos→defaults, `skip/take`)
  en `academies/infrastructure/list-filters.ts` + spec. Tipo `Paged<T>`
  en `@omnidance/shared`.
- Paginados: students, plans, series, staff, instructors,
  private-lessons, academy claims, payments-by-academy (max 200),
  producer claims (`{claims,...}` por compat), crm people (q/segment/
  tag + `segmentCounts`/`allTags` del universo completo, filtros
  servidor antes de paginar), crm campaigns.
- `components/ui/pager.tsx` (keys `common.pager`); vistas con estado
  de página + `Pager`; pickers acotados `pageSize=100`; `planes/[id]`
  usa endpoint de detalle.
- Producer claims UI: filtro explícito → request paginado; default →
  requests acotados por estado (PENDING cola, APPROVED+REJECTED
  historial).
- Tests: specs y e2e actualizados a `.items`; asistencia e2e reescrito
  a la regla nueva (owner 403, instructor 201); import e2e al modelo
  quorum/ventana rodante.
- Fix: teardown `gap-crm`/`gap-events` con retry ante FK de
  notificaciones async (suites e2e comparten DB; carrera
  pre-existente, ya no flakea).

## Verificación

- `pnpm vitest run` (apps/api): **92 archivos / 1789 tests, todo verde**.
- `tsc --noEmit` API y web: limpio.
- i18n audit: `ALL_KEYS_OK`.
- `impeccable detect --json` sobre el diff web: `[]`.
- `openspec validate`: change válido; archivado con specs canónicas
  `academies/console-lists` (nueva), `academies/course-surveys`
  (nueva), `class-series` y `staff-roles` (update).
- `docs/openapi.json` + Postman regenerados (270 paths).

## Brechas conocidas / próximo slice

- **QA visual manual pendiente** de toda la consola owner nueva
  (desktop+mobile): detalle de clase, detalle de cobro, equipo
  (nivel 3 edición), `/analitica`, encuestas, `Pager` en tablas.
- El flake de teardown estaba en otras suites e2e con el mismo patrón
  (person delete tras notification delete): si reaparece, aplicar el
  mismo retry.
- `commissionPct` sigue en API/DTO por compat (privadas legacy); ya no
  se renderiza en UI. Remover en un change dedicado si se decide.
- Nada pusheado; `dev` acumula commits sobre prod (v0.3.0). El release
  gate `dev → main` sigue pendiente de aprobación — este trabajo NO
  promueve nada.
- Queda del pedido original de analítica compartida (thread previo):
  saved queries por usuario/rol y exports de productor fuera del
  detalle de evento — evaluar si sigue en scope en próximo change.
