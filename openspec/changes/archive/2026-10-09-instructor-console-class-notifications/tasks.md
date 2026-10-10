# Tasks

## Web - chrome y home

- [x] BottomNav: `TEACHING_TAB` sin `center` (tab normal); INSTRUCTOR
      sin sidebar en ≥lg (`sidebarGroups` vacío, no montar AppSidebar,
      sin `lg:pl-*` del wrapper, tab bar visible en todos los
      breakpoints + `data-tabbar="all"` para el padding del contenido).
- [x] HomeHub: eliminar hero card "Mi academia" del instructor; nueva
      sección "Próximas clases" reusa el bloque `myClasses` del alumno
      con `href` a `/academia/clases/:id` y badge de ocupación.
- [x] `class-card.tsx`: prop `href` opcional (default `/clases/:id`).
- [x] `/academia/clases`: quitar `AcademyKpiStrip` (página solo del
      instructor).
- [x] i18n: `home.teachingClassesTitle`, `instructor.unconfirmed`.

## Web - roster y alumnos

- [x] `clases/[id]`: cada alumno BOOKED enlaza a
      `/academia/alumnos/:personId`; botón "Marcar presente" solo si
      `canMark` AND dentro de `attendanceWindow`; tras `closesAt`, no
      marcados muestran badge apagado "Sin confirmar".
- [x] Tipo `ClassRoster` + `attendanceWindow`/`academyId`.
- [x] `alumnos/page.tsx`: lente INSTRUCTOR oculta `AcademyKpiStrip`,
      `StudentsInsights`, `ImportCard`.
- [x] `students-section.tsx`: `STUDENTS_ENTITY` sin filtros `from`/`to`
      (todas las lentes); planes deduplicados por etiqueta.
- [x] `shared.ts` (academy): helper `dedupeOptions` por etiqueta
      normalizada; aplicar en teaching-classes (academia/serie) y
      academy-gate (academias).

## Web - perfil

- [x] `perfil/page.tsx`: `STREAKLESS` += INSTRUCTOR; insignias ocultas
      para `ADMIN, INSTRUCTOR`; "Mis pagos" oculto para `ACADEMY_OWNER,
      INSTRUCTOR`; skeletons acordes.

## API - ventana de asistencia y roster

- [x] `classes.controller.roster()`: respuesta gana `academyId` y
      `attendanceWindow {opensAt, closesAt}` (classStart ± 30min).
- [x] `classes.controller.markAttendance()`: select `date` +
      `slot.startTime`; rechazar fuera de la ventana con 400
      `attendance.out_of_window`. BOOKED sin asistencia sigue contando
      cupo (invariante - sin cambio).

## API - notificaciones

- [x] `class-series.controller`: `notifySafe("class.instructor_assigned")`
      al crear serie (instructor de serie + instructores explícitos de
      slots) y al actualizar (nuevo instructor de serie / nuevos slots
      con instructor). Solo asignaciones nuevas.
- [x] `academy-import.service`: notificar instructores asignados a
      slots nuevos (una vez por instructor por serie).
- [x] Nuevo `class-reminders.service.ts`: sweep de clases próximas;
      destinatarios plantel completo + alumnos BOOKED; dedupe por
      (persona, clase, offset); copia
      `Faltan {30|10} minutos para tu clase` / `{serie} {nivel} en
      {academia}`; `data.url` por lente.
- [x] `AcademiesScheduler`: registrar `academies.class_reminders` con
      cron `* * * * *`.

## Tests y verificación

- [x] Spec `class-reminders.service.spec.ts`: 30min, 10min, dedupe,
      multi-instructor, waitlist excluida, clase iniciada ignorada.
- [x] Spec de ventana en markAttendance (fuera/dentro) si existe spec
      del controller; si no, cubrir en el service o declarar la brecha.
- [x] `pnpm --filter @omnidance/api build` +
      `pnpm --filter @omnidance/web build` (o tsc).
- [x] Vitest academies/notifications.
- [x] i18n audit; `openspec validate`; diff review.
