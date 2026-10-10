# Consola de instructor refinada + notificaciones de clase

## Why

La consola del instructor quedó navegable pero conserva piezas de la
lente owner que no le corresponden (tab "Mis clases" en verde como
acción central, sidebar desktop, card "Mi academia" en el home, KPIs e
insights en Alumnos/Clases, racha/insignias/pagos en Perfil) y le falta
lo operativo: próximas clases en el inicio, fichas de alumno desde el
roster, una ventana real para marcar asistencia, y aviso cuando le
asignan una clase. Además nadie (ni instructores ni alumnos) recibe
recordatorio antes de la clase - la asistencia se marca a ciegas.

En producción (muvet) los selects de academia/serie/plan muestran la
misma etiqueta repetida: son filas distintas con igual nombre en la DB
(reseeds parciales) - la UI debe deduplicar por etiqueta.

## What Changes

- **Chrome del instructor**: `Clases` pasa de tab central verde a tab
  normal; sin sidebar ni drawer en ningún breakpoint - el tab bar
  inferior es su única navegación también en ≥lg.
- **Home instructor**: sin card "Mi academia"; nueva sección "Próximas
  clases" que reusa ClassCard contra `GET /home/stats` (el endpoint
  devuelve las clases que dicta, máx 3) enlazando a `/academia/clases/:id`.
- **`/academia/clases`**: sin strip de KPIs (la página ya es solo del
  instructor - el owner es redirigido).
- **Roster de clase**: cada alumno reservado enlaza a su ficha
  `/academia/alumnos/:personId`; "Marcar presente" solo habilita dentro
  de la ventana `[inicio-30min, inicio+30min]` (server enforce + estado
  visual fuera de ventana: "Sin confirmar" al cerrar). Una reserva sin
  asistencia marcada queda BOOKED - ocupa cupo y consume crédito.
- **Alumnos (vista módulo)**: lente instructor oculta KPI strip,
  StudentsInsights, ImportCard y el CTA de alta (readOnly ya lo cubre);
  los filtros de fecha se retiran de la vista para todas las lentes.
- **Perfil instructor**: sin racha, insignias ni "Mis pagos" (mismo
  criterio que las lentes de gestión).
- **Selects sin duplicados**: las opciones FK cosechadas (academia,
  serie, plan) deduplican por etiqueta normalizada además de por value.
- **Notificación de asignación**: al asignar instructor a una serie,
  slot nuevo o via import, el instructor recibe `class.instructor_assigned`
  (best-effort, post-commit, solo asignaciones nuevas).
- **Recordatorios de clase**: job `academies.class_reminders` cada
  minuto notifica a plantel + alumnos BOOKED a los 30 y 10 minutos del
  inicio real (classStart), deduplicado por (persona, clase, offset).

## Impact

- Specs: `academies/staff-roles`, `academies/class-series`,
  `academies/console-lists`, `people-profile`.
- API: classes.controller (ventana + roster), class-series.controller +
  academy-import.service (asignación), nuevo class-reminders.service +
  scheduler (cron `* * * * *`), home.service (myClasses del instructor).
- Web: BottomNav (tab normal, sin sidebar instructor), HomeHub,
  class-card (href override), clases/[id] (link + ventana),
  alumnos page + students-section + teaching-classes (dedup/sin fechas),
  perfil (lente instructor).
- i18n: claves nuevas en instructor/home.
- Sin cambios de schema - dedupe via Notification existente
  (mismo patrón que ticket.day_of).
