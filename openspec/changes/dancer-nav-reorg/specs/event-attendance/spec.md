# event-attendance

## Purpose

Cómo el bailarín se relaciona con los eventos: "Mis eventos" como agenda de tickets comprados, eliminando RSVP (GOING/INTERESTED) y el orden por cercanía, que no aportaban señal real.

## ADDED Requirements

### Requirement: Vista Mis eventos

`/eventos?view=mios` SHALL listar los eventos futuros donde el usuario tiene un `Ticket` con `status = ACTIVE` como `ownerId`, agrupados por día con el mismo formato de la vista lista. La vista MUST indicar que el QR personal es la entrada. MUST estar disponible solo para usuarios autenticados (anónimos ven siempre la lista pública).

#### Scenario: Bailarín con tickets ve su agenda

- WHEN un usuario autenticado con tickets ACTIVE en eventos futuros abre `/eventos?view=mios`
- THEN ve esos eventos agrupados por día, ordenados por fecha

#### Scenario: Sin tickets

- WHEN un usuario sin tickets activos abre `?view=mios`
- THEN ve un estado vacío que lo invita a explorar la cartelera

#### Scenario: Anónimo no accede a Mis eventos

- WHEN un usuario sin sesión abre `/eventos?view=mios`
- THEN ve la vista pública de lista (la vista es solo para autenticados)

### Requirement: Switcher de vistas de eventos

El header de `/eventos` MUST ofrecer el toggle de íconos lista/calendario y un ícono de ticket para Mis eventos. MUST NOT existir ícono de bookmark ni vista `saved`.

#### Scenario: Tres destinos de vista

- WHEN un usuario autenticado abre `/eventos`
- THEN el header muestra el toggle lista/calendario y el ícono de Mis eventos; no hay bookmark

## REMOVED Requirements

### Requirement: RSVP a eventos (GOING/INTERESTED)

**Reason**: la asistencia real se valida con `Ticket`/`Checkin`; RSVP declaraba intención sin valor operativo ni de métrica.
**Migration**: drop de la tabla `Rsvp` y sus endpoints (`PUT/DELETE /api/events/:id/rsvp`, `GET /api/me/rsvp`); "guardados" se reemplaza por Mis eventos (tickets). Datos históricos de Rsvp se pierden — eran solo marcadores.

### Requirement: Vista Guardados

**Reason**: sin RSVP no hay qué guardar; la agenda la cubre Mis eventos.
**Migration**: `?view=saved` → `?view=mios`; `SaveEventButton` eliminado de cards y detalle.

### Requirement: Orden "Cerca de ti"

**Reason**: aportaba poco valor real de uso y añadía un filtro de complejidad (geolocalización opt-in) al hub.
**Migration**: se elimina `NearMeButton`, el param `?near=` y el sort haversine; `venue.lat/lng` permanecen en el modelo sin superficie en este módulo.
