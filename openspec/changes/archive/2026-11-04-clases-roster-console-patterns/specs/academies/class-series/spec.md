## ADDED Requirements

### Requirement: Chrome de consola en el roster de clase

La ficha `/academia/clases/[id]` SHALL mostrar `ConsoleHeader` con
back: quien tiene cap de gestión (canCancel) vuelve a la ficha del
horario (`/academia/series/:seriesId/horarios/:slotId`); el instructor
vuelve a `/academia/clases`.

#### Scenario: Back por perfil

- **WHEN** owner/staff con gestión abre el roster
- **THEN** el back navega a la ficha del horario de la clase
- **WHEN** el instructor abre el roster
- **THEN** el back navega a su listado de clases

### Requirement: Header de entidad navegable en el roster

El header del roster (nombre de la serie, fecha/hora, estilo/nivel,
plantel) SHALL ser texto desnudo (sin Card) y SHALL navegar a la
ficha del horario cuando el caller tiene cap de gestión; para el
instructor sin gestión queda plano.

#### Scenario: Gestión navega al horario

- **GIVEN** un caller con `canCancel`
- **WHEN** toca el header del roster
- **THEN** llega a `/academia/series/:seriesId/horarios/:slotId`

### Requirement: Roster expone seriesId

`GET /classes/:id/roster` SHALL incluir `class.seriesId` (FK del slot)
además del `seriesName` ya existente.

#### Scenario: Deeplink sin lookup extra

- **WHEN** el front construye el header del roster
- **THEN** puede enlazar a la ficha del horario con `seriesId` +
  `classSlotId` sin requests adicionales
