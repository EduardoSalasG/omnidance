# event-attendance

## Purpose

Cómo el bailarín se relaciona con los eventos: "Mis eventos" como agenda de tickets comprados, eliminando RSVP (GOING/INTERESTED) y el orden por cercanía, que no aportaban señal real.

## ADDED Requirements

### Requirement: Vista Mis eventos

`/eventos?view=mios` SHALL mostrar el wallet de tickets del usuario autenticado: todos sus `Ticket` como `ownerId` (cualquier estado), ordenados por fecha de evento descendente, con las acciones disponibles (regalar, reclamar). La vista MUST indicar que el QR personal es la entrada. MUST estar disponible solo para usuarios autenticados.

#### Scenario: Bailarín con tickets ve su wallet

- WHEN un usuario autenticado con tickets abre `/eventos?view=mios`
- THEN ve sus tickets ordenados por fecha con badge de estado y acceso al QR

#### Scenario: Sin tickets

- WHEN un usuario sin tickets abre `?view=mios`
- THEN ve un estado vacío que lo invita a explorar la cartelera

#### Scenario: Anónimo no accede a Mis eventos

- WHEN un usuario sin sesión abre `/eventos?view=mios`
- THEN el middleware lo redirige a login (toda la app exige sesión)

### Requirement: Switcher de vistas de eventos

El header de `/eventos` MUST ofrecer el toggle de íconos lista/calendario y un ícono de ticket para Mis eventos. MUST NOT existir ícono de bookmark ni vista `saved`.

#### Scenario: Tres destinos de vista

- WHEN un usuario autenticado abre `/eventos`
- THEN el header muestra el toggle lista/calendario y el ícono de Mis eventos; no hay bookmark

## REMOVED Requirements

### Requirement: RSVP a eventos (GOING/INTERESTED)

**Reason**: la asistencia real se valida con `Ticket`/`Checkin`; RSVP declaraba intención sin valor operativo ni de métrica.
**Migration**: se eliminan los endpoints RSVP (`PUT/DELETE /api/events/:id/rsvp`, `GET /api/me/rsvp`); "guardados" se reemplaza por Mis eventos (tickets). La tabla `Rsvp` NO se dropea — queda repurposed como marcador "voy" de prácticas; los datos históricos de eventos se pierden — eran solo marcadores.

### Requirement: Vista Guardados

**Reason**: sin RSVP no hay qué guardar; la agenda la cubre Mis eventos.
**Migration**: `?view=saved` → `?view=mios`; `SaveEventButton` eliminado de cards y detalle.

### Requirement: Orden "Cerca de ti"

**Reason**: aportaba poco valor real de uso y añadía un filtro de complejidad (geolocalización opt-in) al hub.
**Migration**: se elimina `NearMeButton`, el param `?near=` y el sort haversine; `venue.lat/lng` permanecen en el modelo sin superficie en este módulo.
