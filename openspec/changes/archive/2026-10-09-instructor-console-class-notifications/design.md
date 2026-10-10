# Diseño: consola de instructor refinada + notificaciones de clase

## Chrome sin sidebar para INSTRUCTOR

El patrón de desktop es sidebar para todos los roles con drawer-groups.
El instructor (como el bailarín en móvil) tiene solo 4 destinos - caben
en el tab bar. Decisión: `sidebarGroups` vacío para INSTRUCTOR → el
chrome no monta `AppSidebar`, elimina el `lg:pl-*` del wrapper y la tab
bar inferior se muestra también en ≥lg (sin `lg:hidden`). El padding
inferior del contenido se mantiene en ≥lg vía `html[data-tabbar="all"]
#contenido` (mismo mecanismo que `data-notabbar`/`data-anon`).

`TEACHING_TAB` pierde `center: true` → tab normal con icono `staff`
(solo acentuado cuando está activo).

## Home: "Próximas clases" del instructor

`GET /home/stats` para INSTRUCTOR gana `myClasses`: las próximas clases
que dicta (mismo OR de `/classes/teaching`: primario/class join/slot/
slot join/serie), ordenadas por fecha+hora, máx 3, via `classCardItem`
- mismo shape de card que el rail "Mis clases" del alumno.

En HomeHub la sección instructor reusa el bloque de `myClasses` del
alumno con dos overrides: `href="/academia/clases/:id"` (ClassCard gana
prop `href` opcional; default "/clases/:id") y `statusBadge` con
ocupación `{bookedCount}/{capacity}` en vez del CTA de reserva. Se
elimina el hero card "Mi academia" (retorna null) - la acción principal
es "Mis clases" (botón existente).

## Ventana de asistencia [-30, +30]

`classStart(date, startTime)` ya define el inicio real (medianoche UTC
del día + `startTime`). Regla server-side en `markAttendance`:

- `now < start - 30min` o `now > start + 30min` → 400
  `attendance.out_of_window` con `{opensAt, closesAt}` en la respuesta.
- El roster expone `attendanceWindow: {opensAt, closesAt}` ISO +
  `academyId` para el link de la ficha del alumno.

UI: dentro de la ventana → botón "Marcar presente"; fuera → el control
desaparece y, pasado `closesAt`, el alumno no marcado muestra badge
apagado "Sin confirmar". Sin ventana la reserva sigue BOOKED → cuenta
en `bookedCount` (cupo y quórum) y consume el crédito del plan
(invariante existente - la asistencia nunca libera cupo).

## Notificación de asignación

Puntos donde aparece un instructor nuevo sobre una clase:

| Origen | Señal |
|---|---|
| POST /class-series | `dto.instructorId` + `slots[].instructorId` |
| PATCH /class-series | `dto.instructorId` si cambia + `addSlots[].instructorId` |
| PATCH /class-slots | `data.instructorId` al crear |
| POST import schedule | `s.instructorId` por slot nuevo |

Regla anti-duplicado: **notificar solo asignaciones nuevas** (diff
prev→dto en update; ids explícitos en create/import). Un slot sin
`instructorId` propio hereda el de la serie - si la serie ya notificó
al nuevo instructor en el mismo request, no re-notificar. Tipo
`class.instructor_assigned`, data `{seriesId, academyId}`,
título `Te asignaron una clase`, body `Serie · Academia`.
Best-effort post-commit via `notifySafe` (nunca aborta el write).

## Recordatorios 30/10 min

Nuevo `ClassRemindersService` en el módulo academies + registro en
`AcademiesScheduler`: key `academies.class_reminders`, cron
`* * * * *` (el JobsRunner ya corre cada minuto).

Sweep: clases no canceladas con `slot`, fecha en `now-1h < start <=
now+30min` (ventana de interés). Por cada clase:

1. `start = classStart(date, slot.startTime)`.
2. `minutesLeft = (start - now)/60k`; offsets `{30,10}` con
   `minutesLeft <= offset` (una clase a 9 min está DUE para ambos -
   llegan las dos notificaciones; nunca llega una sin la otra pasada).
3. Destinatarios: plantel (primario + co-instructores de clase y slot +
   instructor de serie) ∪ alumnos `BOOKED` (no WAITLIST/ATTENDED).
4. Dedupe: `Notification` existente con `type="class.reminder"` +
   `data.classId` + `data.minutes` por persona (fetch por personId +
   createdAt ≥ now-2h, filtro data en memoria).
5. Copia: título `Faltan {minutes} minutos para tu clase`, body
   `{serie} {nivel?} en {academia}`. `data.url` por destinatario:
   instructor → `/academia/clases/{id}`, alumno → `/clases/{id}`.

## Dedupe de selects por etiqueta

`mergeOptions` ya deduplica por `value`; en prod hay filas distintas
con igual nombre visible (reseeds). Helper `dedupeOptions` en
`shared.ts` de academy: colapsa por etiqueta normalizada
(trim/lowercase/collapse espacios) conservando el primer value. Aplica
a los option-builders de academia/serie (teaching-classes), plan
(students-section) y academia (academy-gate) - no globalmente en
FilterBar (entidades distintas pueden legítimamente compartir nombre).

## Perfil instructor

Sets existentes de lente: `STREAKLESS` gana INSTRUCTOR; nuevo set para
insignias (`ADMIN, INSTRUCTOR`); "Mis pagos" se oculta también para
INSTRUCTOR (mismo criterio de gestión que owner).
