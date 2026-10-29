# Propuesta: Agregar clase a mi calendario (class-calendar-ics)

## Why

El alumno dancer que reserva una clase no tiene forma de llevarla a su
calendario del móvil: hoy depende de recordar la hora o revisar la app.
Un "Agregar a mi calendario" post-reserva es el estándar de la industria
(ClassPass, Meetup, Eventbrite) y cierra el loop de la reserva.

## What Changes

- `GET /classes/:id/calendar.ics` (sesión) → archivo `.ics` RFC 5545
  descargable: `SUMMARY` (clase + academia), `DTSTART/DTEND` con `TZID`
  de la ciudad de la academia, `LOCATION` (sede/dirección), `DESCRIPTION`
  (academia, instructor, nivel/estilo, link a la ficha), `UID` estable,
  `VALARM` -60min. iOS/Android abren el "agregar a calendario" nativo al
  descargar un `.ics`; no hace falta share-sheet ni API extra.
- Front: en el estado `BOOKED` de `class-booking-cta` aparece el botón
  "Agregar a mi calendario" (link al endpoint, hit area 44px, i18n).
  Solo cuando el asiento es propio (`BOOKED`), nunca en `WAITLIST` ni
  compra pendiente de gateway.
- `GET /classes/:id` expone la sede de la clase si no la trae
  (location del .ics la necesita).

## Out of scope

- Suscripciones `webcal:` / RRULE de series (v1 = un solo evento por clase).
- Clases particulares (private lessons); mismo patrón, iteración.
- Calendario de eventos nightlife; la misma utilidad aplica después
  (endpoint paralelo, no en este change).

## Decisión: .ics server-side

El archivo lo emite el API (no un blob en el cliente): fuente única de
verdad (zona horaria de la ciudad de la academia, contenido i18n del
servidor), testeable en vitest, funciona sin JS en el cliente y el link
es compartible dentro de la sesión.
