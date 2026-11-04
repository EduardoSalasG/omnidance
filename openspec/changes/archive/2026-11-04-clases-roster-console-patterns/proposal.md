# Proposal: clases-roster-console-patterns

Alinea `/academia/clases/[id]` (roster de clase) con `console-patterns`
post-refactor de la ficha de serie: `ConsoleHeader` con back
contextual, header de entidad desnudo navegable a la ficha del horario
(solo gestión), zona roja canónica. `GET /classes/:id/roster` agrega
`seriesId` al payload (campo aditivo) para el deeplink.
