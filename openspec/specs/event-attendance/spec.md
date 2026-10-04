# event-attendance Specification

## Purpose
Cómo el bailarín se relaciona con los eventos: "Mis eventos" como agenda de tickets comprados, eliminando RSVP (GOING/INTERESTED) y el orden por cercanía, que no aportaban señal real.

## Requirements

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
