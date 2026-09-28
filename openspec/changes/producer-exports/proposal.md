# producer-exports

## Why

La spec §11 promete "Exportes — CSV/PDF por evento y serie" para el
productor, pero la API no tiene ningún endpoint `text/csv`: la consola
muestra ventas (`/events/:id/live`, `PaymentsSection`), check-ins y listas
de invitados en pantalla, y no hay forma de llevarse los datos a planilla
para cuadratura con el venue, el contador o el staff. Es el gap operativo
más citado del rol — el productor cierra la noche y no puede exportar nada.

## What Changes

- **`GET /events/:id/export.csv?dataset=sales|checkins|guestlist`** —
  descarga CSV (BOM UTF-8 + `Content-Disposition: attachment`) del evento.
  Autorización owner del evento o `admin.access` (mismo
  `requireOwnerOrAdmin` de `/live`). `dataset` inválido → 400; evento
  inexistente → 404; sin sesión → 401.
- **Datasets** (una fila por registro, headers en español):
  - `sales`: una fila por `Ticket` del evento — fecha, comprador
    (`buyerId`), asistente (`ownerId`), precio lista, cargo de servicio,
    total, estado del ticket, canal (via `Payment.channel` del `paymentId`)
    e id de pago. Nunca expone `claimToken` (secreto de reclamo).
  - `checkins`: una fila por `Checkin` del evento — entrada, salida,
    método, nombre de la persona, anulado (sí/no) y nota del staff.
  - `guestlist`: una fila por `GuestListEntry` — lista (label), dueño de
    la lista, invitado, estado (PENDING/ARRIVED) y fecha de alta.
- **UI**: `/productor/eventos/[id]` — sección "Exportar" con tres links de
  descarga directa (`/api/events/:id/export.csv?dataset=…` — el proxy
  same-origin preserva la cookie de sesión).

Fuera de scope en v1: exporte por serie (agrega N eventos — pendiente de
UX real), PDF, y dataset de mesas (las reservas ya se listan en pantalla y
su volumen es bajo; se agrega si pide).

## Capabilities

### New Capabilities

- `events/producer-export`: exporte CSV operativo por evento — sales,
  checkins, guestlist — con autorización owner/admin, nombres resueltos
  por join a Person y escaping CSV correcto (comillas, comas, saltos).

## Impact

- `apps/api/src/events/infrastructure/events.controller.ts`: endpoint
  nuevo junto a `live` (mismo patrón de auth); helpers `csvCell`/`toCsv`.
- Tests: `events.controller.spec.ts` — auth (owner ok, otro productor
  403, admin ok), dataset inválido 404/400, contenido y escaping de CSV,
  ticket sin payment → canal vacío.
- Web: `productor/eventos/[id]/page.tsx` sección export + i18n
  (`parts/producer.json`).
- `docs/openapi.json` + postman regenerados; `docs/architecture.md` si la
  sección de eventos queda inexacta.
