# Handoff - 2026-10-09a (consola instructor + recordatorios de clase)

## Completado en esta sesión (commits en dev, sin push)

| Commit | Slice |
|---|---|
| `09555af` | CI: seed one-shot timeout 300→1500s (ya estaba) |
| `27f876f` | Instructor: tab Alumnos, sin drawer móvil, badges tope 2 (ya estaba) |
| `918929e` | Seed: log de progreso por sección (ya estaba) |
| `8ea42c5` | **Este batch**: consola instructor completa + asistencia en ventana + recordatorios |

### Consola del instructor (change `2026-10-09-instructor-console-class-notifications`, archivado)

**Chrome** (`BottomNav.tsx`, `globals.css`):
- `TEACHING_TAB` sin `center` → tab normal, se acentúa solo activo.
- Instructor sin sidebar en ≥lg: `sidebarGroups=[]`, `AppSidebar` no se
  monta, `noSidebar` quita `lg:pl-*` del wrapper y fija
  `html[data-tabbar="all"]` para que el contenido reserve el padding de
  la tab bar también en desktop.

**Home** (`HomeHub.tsx`, `home.service.ts`):
- Sin hero "Mi Academia" (era ruido; sus destinos están en el tab bar).
- "Próximas clases" reusa el bloque `myClasses` del alumno:
  `instructorStats` ahora devuelve `myClasses` con las clases que dicta
  (mismo OR de `/classes/teaching`: primario/co-profe de clase, slot o
  serie). Card con `href` → `/academia/clases/:id` y badge de ocupación.
- `ClassCard` gana prop `href` opcional (default `/clases/:id`).

**Clases** (`academia/clases/page.tsx`, `[id]/page.tsx`):
- Sin `AcademyKpiStrip` (la página es solo del instructor).
- Roster: cada alumno (booked y waitlist) enlaza a `/academia/alumnos/:personId`.
- Botón "Marcar presente" solo si `canMark && dentro de attendanceWindow`;
  fuera de ventana se muestra pista con horario; no marcados muestran
  badge muted "Sin confirmar" (la reserva sigue BOOKED gastando cupo).
- `ClassRoster` type: `+attendanceWindow {opensAt, closesAt}`.

**API asistencia** (`classes.controller.ts`):
- `ATTENDANCE_WINDOW_MS = 30min`; `GET /:id/roster` devuelve
  `attendanceWindow`; `POST /:id/attendance` rechaza fuera de
  `[start-30, start+30]` con 400 `attendance.out_of_window`, exige
  BOOKED, 409 si ya marcada. Marcan: plantel efectivo (clase/slot/serie
  + joins multi-instructor) o platform admin. Owner NO marca.

**Alumnos** (`alumnos/page.tsx`, `students-section.tsx`, `shared.ts`):
- Instructor: sin `AcademyKpiStrip`, `StudentsInsights`, `ImportCard`,
  "Nueva inscripción" (readOnly ya existía).
- Filtros de fecha `from`/`to` fuera del listado para TODAS las lentes.
- `dedupeOptions()` nuevo en `shared.ts`: dedup por label normalizado
  aplicado a academyPlans (alumnos), academias/series (teaching) y al
  selector de `AcademyGate` — fix del reporte de muvet (opciones
  repetidas por data duplicada en el origen).

**Perfil** (`perfil/page.tsx`):
- `STREAKLESS` += INSTRUCTOR (sin "Semanas seguidas").
- `GAMIFLESS` = {ADMIN, INSTRUCTOR} (sin insignias, sin fetch).
- "Mis pagos" oculto para INSTRUCTOR.

**Notificaciones**:
- `class-series.controller`: `notifyInstructorAssigned()` post-commit
  en `create` (instructor de serie + overrides de slot) y `update`
  (instructor nuevo / slots nuevos con instructor). Type
  `class.instructor_assigned`, data `{seriesId, academyId}`.
- `academy-import.service`: mismo aviso para instructores de slots
  nuevos del CSV (una vez por instructor por serie).
- **`class-reminders.service.ts` (nuevo)**: sweep cada minuto
  (`academies.class_reminders` en `AcademiesScheduler`, cron `* * * * *`).
  Clases con inicio en (now, now+30min] → notifica plantel completo +
  alumnos BOOKED a los 30 y 10 min. Copy: `"Faltan {N} minutos para tu
  clase"` / `"{serie} {nivel} en {academia}"`. `data.url` por lente
  (instructor → `/academia/clases/:id`, alumno → `/clases/:id`).
  Dedupe por `(personId, classId, minutes)` contra Notification reciente
  (lookback 2h). Best-effort por destinatario.

### Verificación

- `tsc --noEmit` api ✓ y web ✓
- Vitest academies+home+notifications: **270/270** (incl. 19 tests
  nuevos de roster/markAttendance + 9 del reminders service)
- i18n audit: `ALL_KEYS_OK`
- `impeccable detect --json` sobre los 10 archivos web tocados: `[]`
- `openspec archive` aplicado: specs canónicas +4/reqs ~3

### Pendiente / contexto

- **Data prod parcial**: el seed cortado por el timeout viejo dejó la
  demo a medias (eventos/entradas faltan). Completar con
  `SEED_ENV=dev pnpm db:seed` contra `MIGRATION_DATABASE_URL` (idempotente,
  ahora con logs por sección).
- **Gate de completitud del seed** en el workflow solo mira
  roles+admin — un seed a medias pasa por completo. Sugerencia:
  endurecer con `eventSeries > 0` o similar.
- Sin push ni release: todo quedó en `dev`.
