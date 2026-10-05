# Proposal — particular-reserva-unificada

## Por qué

La integración anterior (`particulares-en-reservadas`) dejó la
superficie alumno duplicada: `/clases` hacía DOS fetches
(`/classes/mine` + `/private-lessons/mine`), la particular tenía un
card propio distinto al `ClassCard` del resto, y cancelar se hacía
inline en la lista en vez de dentro de la ficha como toda reserva.

El modelo `PrivateLesson` separado de `Class` se **mantiene**: no es
una clase con aforo 1 — se paga antes de agendarse (`scheduledAt`
null), no tiene serie/slot/recurrencia, lleva `price`/`paymentId`/
`commissionPct`/`commissionPaidAt` y un ciclo REQUESTED→CONFIRMED→DONE
distinto al de reserva. Lo que converge es la superficie alumno.

## Qué cambia

- `GET /classes/mine` devuelve las particulares activas del alumno
  **mergeadas en la misma respuesta** (rows compatibles con el card:
  `series: null`, `date: null` para las sin agendar). Una sola llamada.
- `GET /classes/mine?scope=past` mergea las terminales
  (DONE→"attended", CANCELLED→"cancelled").
- `GET /private-lessons/:id` nuevo — detalle de la particular del
  alumno (o staff/admin) para que `/clases/[id]` la resuelva.
- `GET /private-lessons/mine` queda solo para la rama instructor
  (`?as=instructor`); la vista alumno es `/classes/mine` — una sola
  fuente, sin rama duplicada (sin `as` válido responde 400).
- `ClassCardData` queda estricto; se agrega `LessonCardData` (series
  null, date/startTime nullables) y `/classes/mine` se tipa como la
  unión `MineCardData`. El card es el mismo componente para todas las
  reservas — título "Clase particular" por i18n cuando `series` es
  null.
- `/clases`: se elimina el segundo fetch y el card propio — las
  particulares fluyen por `renderClassCard` como cualquier reserva;
  las sin agendar agrupan arriba ("Por agendar").
- `/clases/[id]`: si el id no es Class resuelve PrivateLesson y pinta
  la ficha equivalente (academia, instructor o "por asignar", fecha o
  "por agendar", precio pagado, estado); cancelar vive al pie como
  zona destructiva con sheet de confirmación — mismo flujo que la
  reserva normal (`PATCH /private-lessons/:id {action:"cancel"}`).
- La consola staff/instructor (`/academia/particulares`) no cambia.

## Impacto

- API: `mine()`/`history()` ganan un `privateLesson.findMany`
  paralelo + mapper; nuevo GET `:id`; `/private-lessons/mine` pierde
  la rama alumno (DRY — una sola lectura de reservas del learner).
- Web: `clases/page.tsx` se simplifica (menos tipos/renderers),
  `class-card.tsx` tolera `series: null`, `clases/[id]/page.tsx` gana
  la rama lesson + un CTA de cancelación cliente pequeño.
- i18n: `classes.privateLesson` + keys del detalle reusando
  `academyExtras.lessons` donde aplica.
