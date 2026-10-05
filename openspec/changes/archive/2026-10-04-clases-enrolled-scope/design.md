# design — clases-enrolled-scope

## Context

Ver proposal.md — Why. Piezas existentes que se reutilizan:

- `GET /academies/enrolled` ya devuelve inscripciones con status (`academies.controller.ts`).
- `browse` ya filtra por `weekday/styleId/levelId/academyId/days` y computa `myBooking` por clase.
- Calendario ya tiene el toggle `scope=todas|mias` y las cards wallet (`renderMyCard`, con link QR) — el trabajo es generalizar el patrón, no inventarlo.
- `POST /classes/:id/book` no consulta Enrollment hoy.

## Goals / Non-Goals

- **Goals**: acotar list/calendar a academias del alumno; gate de reserva por inscripción vigente; vista explore con todas las academias; plegar "Mis clases" al filtro Reservadas conservando el link QR.
- **Non-goals**: auto-inscripción del alumno (la academia inscribe; fuera de alcance); checkout/pago de clase suelta (drop-in); cambios en historial; página pública de detalle de academia (no existe — "Requiere inscripción" no linkea a ninguna parte).

## Decisions

### 1. `scope=enrolled` como param de browse (no endpoint nuevo)

`browse` ya concentra la materialización de clases futuras (cupos, waitlist, myBooking). Agregar `scope=enrolled|all` (default `all`) filtra por `slot.academyId ∈ enrollments vigentes del autenticado` — una query previa a `enrollment.findMany({personId, status: {in: BOOKABLE}})`, y si viene vacía se retorna `[]` sin tocar `class.findMany`.

- Alternativa: filtrar client-side con `/academies/enrolled` + `academyId` por academia. Rechazada: N queries, horizonte por academia, y `enrolled` flag igual hay que derivarlo.
- `BOOKABLE = [ACTIVE, TRIAL, ONLINE]` como constante local del controller (mismo archivo, junto al browse/book que la consumen).

### 2. `enrolled: boolean` por item de browse/detail

El servidor ya conoce `me` y los `academyId`; un Set de academyIds vigentes resuelve el flag sin query por fila. La UI decide el CTA con un solo fetch. Alternativa (cliente consulta `/academies/enrolled` aparte) obliga a coordinar dos loads y duplica la regla de qué status "cuenta" — la regla vive una sola vez en el servidor.

### 3. Gate de reserva en `book`, dentro de la misma transacción

Antes de `findUnique` de la reserva existente: `tx.enrollment.findFirst({personId: me, academyId: cls.slot.academyId, status: {in: BOOKABLE}})` → `ForbiddenException("necesitas inscripción vigente en la academia")`. Dentro de la tx evita TOCTOU si la academia desinscribe a mitad de request. Hay que ampliar el `select` de `cls.slot` con `academyId` (hoy solo trae `academy.defaultQuorum`).

- Alternativa: gate solo en UI. Rechazada — la regla queda sin dientes (spec: "obviamente si no está inscrito, no va a poder reservar").

### 4. `mine` se pliega a `scope=reservadas`, no se borra el dataset

`/classes/mine` sigue existiendo (cards wallet + QR). En la página:
- `view` pasa a `list | calendar | history | explore`; `view=mine` legado mapea a `list + scope=reservadas` (deep links vivos).
- `scope=reservadas` usa `loadMine()` en list y calendar (calendar ya lo hace con `mias`); las cards son `renderMyCard` — conserva QR, badge y cancelación en dos taps.
- El ícono marcador del header se reemplaza por brújula → `view=explore`. `explore` reusa el render de lista con `browse` sin scope; CTA por `cls.enrolled` (reservar normal vs. estado muted "Requiere inscripción"). El toggle Todas|Reservadas no aplica en explore (reservadas ya es accesible desde list/calendar).
- Renombre de param: `scope=mias` → `scope=reservadas`; `mias` legado se acepta como alias en el parse (un ternario), igual que `view=mine`.

### 5. Prioridad = acotar, no reordenar

Dentro de `todas` el orden sigue siendo cronológico por día/hora; las reservadas ya llevan badge neon + cancelar. El filtro Reservadas cubre "ver solo las mías" sin duplicar cards pineadas (decisión del usuario).

## Risks / Trade-offs

- **[Booking gate rompe reservas de alumnos demo sin enrollment]** → verificar seed: dancer demo tiene Enrollment ACTIVE en Muvet; smoke post-cambio debe confirmar book 200/403 según caso. Además `class-booking-cta.tsx` y cualquier otro consumidor de `book` hereda el 403 — el detail expone `enrolled` para que el CTA lo anticipe.
- **[Alumno nuevo no puede reservar nada hasta que la academia lo inscriba]** → es la regla de producto pedida; el empty state dirige a explorar y el copy "Requiere inscripción" explica el camino.
- **[Series/cards en explore sin CTA de contacto]** → no hay página pública de academia; se registra como candidato en el handoff, no en este cambio.
- **[PAUSED/FROZEN dejan de ver sus academias en list/calendar]** → decisión aprobada; el historial y /academias siguen mostrando la inscripción con su estado.

## Migration Plan

Cambio compatible hacia atrás en contrato (`scope` y `enrolled` son aditivos; `book` endurece pero es la regla pedida). Sin migración de datos. Rollback = revert del commit.

## Open Questions

- Ninguna bloqueante. Candidato posterior: CTA "contactar academia" en cards de explore cuando exista página pública o deep link de contacto.
