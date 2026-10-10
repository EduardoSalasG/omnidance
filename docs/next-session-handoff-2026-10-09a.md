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

---

# Handoff - continuación (consola productor + fix SSR prod)

## Completado (mismo batch, commits en dev, sin push)

### Bug prod: eventos/academias/clases no cargan vía SSR (FIX)

- **Causa raíz**: 11 módulos server-side fetcheaban
  `process.env.API_URL ?? "http://localhost:4000"`. En Netlify
  `API_URL` no existe → el serverless pegaba a su propio localhost →
  `/eventos`, `/eventos/:id`, academias, clases, locales, checkouts,
  `/evaluar` y `/reclamar` devolvían error/vacío en prod (el API
  estaba sano: 200 en list y detail directo y vía proxy `/api/*`).
- **Fix**: `apps/web/src/lib/server-api.ts` exporta `SERVER_API_URL`
  con orden `API_URL → API_PROXY_TARGET → NEXT_PUBLIC_WEB_URL →
  localhost:4000`. En Netlify resuelve a `API_PROXY_TARGET`
  (declarado en `netlify.toml [build.environment]`, disponible en el
  runtime de funciones) o, en su defecto, pega a la propia web por el
  rewrite `/api/*`. Dev local sigue cayendo a `localhost:4000`.
- Los 11 archivos ahora hacen `const API_URL = SERVER_API_URL`
  (eventos list/detail/checkout/evaluar, academias detail/checkout,
  clases detail, locales detail, reclamar, `public-events`,
  `public-academies`).

### Consola del productor (change `2026-10-09-producer-home-console`, archivado)

- **Home**: `/inicio` en lente PRODUCER renderiza `ProducerDashboard`
  (nuevo): KPIs (eventos agendados, entradas vendidas, facturación
  del mes, cobros por revisar) + top 5 por facturación + top 5 por
  asistencia + cola de comprobantes PENDING. Sin hero ni "Próximos
  eventos". API: `GET /producer/dashboard` en `ProducerController`
  (productor APPROVED o `admin.access`).
- **Nav**: tabs = Inicio + Eventos (fuera "Crear evento" central y
  Payouts). Drawer/sidebar: módulos (Códigos, Listas, Comprobantes,
  CRM) + Analítica + grupo **Configuración** (Comisión y defaults,
  Mis pagos) encima de Cuenta. Fuera el hub `/productor` y el grupo
  Social→cartelera. `/productor` → `redirect("/inicio")`.
- **Retorno Flow Pro**: `platform-customer-return` ahora 303 a
  `/productor/parametros?pro=ok`; `ProReturnNotice` vive en esa
  página. `ProducerPulse` eliminado (sin referencias).
- **backHref** de codigos/comprobantes/eventos/listas/pagos/
  parametros → `/inicio`.
- **Perfil**: PRODUCER en `STREAKLESS` y `GAMIFLESS`; "Mis pagos"
  oculto.
- **CTA** "Nuevo evento" en `/productor/eventos`: `primary` (morado).
- `producer.controller.spec.ts` nuevo: 5 tests del dashboard (gate,
  vacío, tops, null eventId, admin).

### Verificación

- `tsc --noEmit` api ✓ (incluye fix de tipos en
  `class-reminders.service.spec.ts` que tsc sí chequea aunque vitest
  corría igual) y web ✓
- Vitest `src/events src/payments src/academies`: **687/687**
  (incl. 5 nuevos del dashboard + 9 del reminders corregidos)
- i18n audit: `ALL_KEYS_OK`
- `impeccable detect --json`: `[]`
- `openspec validate --changes` ✓ y `archive` aplicado:
  `events/producer-console` +2 reqs, `people-profile` +1 req

### Pendiente

- **Re-correr el seed de prod** (`SEED_ENV=dev pnpm db:seed` contra
  `MIGRATION_DATABASE_URL`) si aún no se completó - la data demo
  anterior quedó parcial por el timeout viejo.
- **El fix SSR solo llega a prod con un deploy del web** - push a
  `main` (Netlify rebuildeo) o release. Pendiente de aprobación del
  usuario: promover `dev → main` (release v0.6.1/v0.7.0?).
- La UI del productor no se verificó visualmente en browser (sin
  smoke CDP este batch) - los contratos sí por specs.
