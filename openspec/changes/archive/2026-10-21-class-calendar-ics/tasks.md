# Tareas; class-calendar-ics

- [x] 1. Change + artifacts (este archivo).
- [x] 2. Backend: `GET /classes/:id/calendar.ics` en `classes.controller.ts`;
       sesión requerida (mismo guard del detalle); resuelve clase + slot +
       serie + academia + venue + ciudad (timezone); 404 si la clase no
       existe; emite `.ics` RFC 5545 con:
       - `UID: class-<id>@omnidance` (estable entre descargas)
       - `DTSTART;TZID=<City.timezone|America/Santiago>:YYYYMMDDTHHMMSS` y
         `DTEND` igual (local wall-clock de date+startTime/endTime; sin
         conversión UTC, la zona la aporta el TZID)
       - `SUMMARY: <series.name ?? academy.name>; <academy.name>`
       - `LOCATION: <venue.name, venue.address>` (o academia si no hay sede)
       - `DESCRIPTION`: academia, instructor efectivo, nivel/estilo,
         link `WEB_URL/clases/<id>`
       - `VALARM TRIGGER -PT60M` (recordatorio 1h antes, estándar industria)
       - escaping RFC 5545 (`,` `;` `\n` en texto)
       - Headers: `Content-Type: text/calendar; charset=utf-8`,
         `Content-Disposition: attachment; filename="clase-<id>.ics"`
- [x] 3. `GET /classes/:id`: exponer `venue{name,address}` (o lo necesario
       para LOCATION) si el select actual no lo trae + `City.timezone`
       vía la sede/academia; verificar primero qué trae hoy.
- [x] 4. Front: botón "Agregar a mi calendario" en `class-booking-cta.tsx`
       en el bloque `{booking === "BOOKED"}` (encima del cancelar, tono
       neutral no destructivo): `<a href>` directo al endpoint con
       `download`, `min-h-11`, icono calendario, i18n `classes.addToCalendar`.
       Post-reserva (booking pasa a BOOKED tras book()) aparece sin reload.
       Nunca en WAITLIST ni `awaiting` de gateway.
- [x] 5. Tests: vitest del service/handler (content .ics: campos, TZID,
       escaping, VALARM, 404) + typecheck api+web + i18n-audit.
- [x] 6. Orquestador: docs (qa-inventory + openapi/postman regen +
       architecture si aplica), marcar tasks, validate, archive, commit.
