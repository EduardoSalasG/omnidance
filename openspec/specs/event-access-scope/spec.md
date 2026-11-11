# event-access-scope Specification

## Purpose
TBD - created by archiving change security-event-scope. Update Purpose after archive.

## Requirements

### Requirement: Scoping de actor por evento

Toda operación de gestión sobre un evento SHALL verificar, además del
permiso de capacidad, que el actor esté vinculado al evento: superuser/
`admin.access`, el productor dueño (`event.producerId`) o staff asignado
al evento. Un permiso global por sí solo SHALL NOT ser suficiente para
leer ni mutar recursos de un evento ajeno.

#### Scenario: Staff ajeno registra check-in

- WHEN un actor con `checkins.write` no asignado al evento X llama
  `POST /checkins` (o `/sync` o `/manual`) para X
- THEN la API responde 403 y no crea el check-in

#### Scenario: Staff ajeno lee manifiesto

- WHEN un actor con `checkins.write` no asignado llama
  `GET /events/:id/checkins` o `/door-manifest` del evento X
- THEN la API responde 403 (sin filtrar nóminas ajenas)

#### Scenario: Staff asignado opera normal

- WHEN staff asignado al evento X repite las operaciones anteriores
- THEN funcionan igual que antes del cambio (productor dueño y
  superuser/admin también)

### Requirement: Guest lists y passes de lista scoped

Las operaciones de guest list (`POST/GET /events/:eventId/guest-lists`,
`GET /guest-lists/:id`, `POST /guest-lists/:id/entries`,
`POST /guest-lists/:listId/entries/:entryId/pass`) SHALL exigir el scoping
de actor del evento dueño de la lista.

#### Scenario: Emisión de pass en evento ajeno

- WHEN un actor con `social.manage` no vinculado al evento intenta emitir
  un `EntryPass` LIST en ese evento
- THEN la API responde 403 y no emite el pase

### Requirement: Lectura de passes scoped

`GET /events/:id/passes` SHALL exigir el scoping de actor del evento.

#### Scenario: Teléfonos de evento ajeno

- WHEN un actor no vinculado llama `GET /events/:id/passes`
- THEN la API responde 403 y no expone datos de asistentes

### Requirement: Discount codes scoped a su evento/serie

- `POST /discount-codes` con `eventId`/`seriesId` SHALL verificar que el
  creador sea dueño del recurso scoped (o admin); sin scope, exige
  `discounts.manage` como hoy.
- `GET /discount-codes`, `GET /discount-codes/:id` y
  `/redemptions` SHALL devolver solo códigos del actor (o todos si admin).

#### Scenario: Código de cortesía en evento ajeno

- WHEN un productor crea un código con `eventId` de otro productor
- THEN la API responde 403 y no persiste el código

#### Scenario: Listado sin códigos ajenos

- WHEN un actor lista `GET /discount-codes`
- THEN no aparecen códigos creados por otros actores (admin ve todos)
