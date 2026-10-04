# role-console-depth — profundidad de consolas B2B (spec §13)

## Why

Las consolas de gestión existen pero están por debajo de lo que la spec
§13 promete por rol:

- **Productor**: `/productor` es una grilla de módulos sin datos — el spec
  pide dashboard con próximos eventos, ventas en curso y ocupación
  esperada. Tampoco hay vista "en vivo" (check-ins, contador Prime Time)
  aunque `GET /gamification/:eventId/prime-time` ya existe.
- **Academia (owner)**: el dashboard no muestra las clases del día ni la
  asistencia de hoy; el drawer no enlaza al CRM aunque la API ya soporta
  `actorType=ACADEMY` (ownerId check).
- **DJ**: el spec define "su evaluación agregada de música por evento" —
  `GET /events/:id/ratings/summary` es solo producer/admin; el DJ no puede
  ver su propio agregado.
- **Venue**: el spec pide "reservas de mesa, permanencia, horas pico" —
  el dashboard no las expone aunque `Checkin.inAt/outAt` y
  `TableReservation` ya tienen los datos.

## What Changes

- **API**:
  - `GET /dj/gigs/:eventId/rating` — agregado `music` del evento para el
    DJ asignado, con k-anonymity (`exposed:false` bajo umbral), mismo
    umbral que `ratings/summary`.
  - `GET /venues/:id/dashboard` — agrega `tables` (reservas de mesa de
    eventos del venue) y `flow` (check-ins por hora + permanencia media
    de los últimos 30 días).
  - `GET /academies/:id/dashboard` — agrega `todayClasses` (clases del día
    con cupo/reservas) y `attendanceToday`.
  - `GET /events/mine` — agrega `capacity` + `soldCount` por evento
    (ocupación esperada del dashboard productor).
- **Web**:
  - `/productor` — dashboard real: KPIs + próximos eventos con
    ocupación + grilla de módulos (conserva el tour).
  - `/productor/eventos/[id]` — strip "En vivo" cuando el evento está
    LIVE: check-ins + contador Prime Time (polling REST).
  - `/dj` — agregado de música por gig pasado (badge en la card).
  - `/venue` — sección Reservas de mesa + bloque Flujo (hora peak,
    permanencia media).
  - `/academia` — dashboard muestra "Clases de hoy" con link a asistencia.
  - BottomNav — drawer ACADEMY_OWNER suma /crm.
- **Seed**: EventRating de asistentes en las ediciones pasadas (alimenta
  ratings del productor, música del DJ y dims del venue), `outAt` en
  check-ins (permanencia), reservas de mesa CONFIRMED.
- **i18n**: keys nuevas en parts existentes (producer/dj/venue/academy).

## Capabilities

### Modified Capabilities
- `producer-console`: el hub muestra datos operativos reales.
- `dj-console`: el DJ ve su evaluación de música agregada.
- `venue-console`: flujo, permanencia y reservas de mesa.
- `academy-console`: clases del día + asistencia de hoy + CRM.
