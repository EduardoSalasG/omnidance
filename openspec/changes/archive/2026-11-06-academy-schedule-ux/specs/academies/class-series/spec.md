# Delta: academies/class-series

## ADDED Requirements

### Requirement: Filtro de estilo acotado a la academia

La consola SHALL ofrecer en el filtro `styleId` del listado
`/academia/series` solo los estilos presentes en las series no
borradas de la academia (nunca el catálogo global): un estilo sin
series produciría vacíos garantizados. `GET /academies/:id/series/styles`
SHALL responder `[{id, name}]` deduplicados y ordenados por nombre,
con la misma capacidad que el listado (`schedule`/`classes`).

#### Scenario: academia con un solo estilo

- **GIVEN** una academia cuyas series usan solo "Bachata sensual"
- **WHEN** el owner abre el filtro de estilos
- **THEN** el select muestra solo "Bachata sensual" (más la opción
  "todos"), no los demás estilos del catálogo

#### Scenario: endpoint devuelve dedup

- **GIVEN** tres series: dos "Salsa cubana (casino)", una "Mambo on2",
  y una borrada con "Fusión"
- **WHEN** se consulta `GET /academies/:id/series/styles`
- **THEN** responde `[{Mambo on2}, {Salsa cubana (casino)}]` sin
  "Fusión" (la borrada no cuenta) ni duplicados

### Requirement: Header del roster no navega a edición

El header de entidad de `/academia/clases/[id]` SHALL ser texto plano:
la edición del horario se entra solo desde la ficha de la serie
(`/academia/series/[id]` → `/horarios/[slotId]`), nunca desde el
roster.

#### Scenario: owner abre un roster gestionable

- **GIVEN** una clase futura con `canCancel`
- **WHEN** el owner abre `/academia/clases/[id]`
- **THEN** el bloque serie + fecha/hora no es clickeable ni muestra
  affordance de navegación

### Requirement: Catálogo de estilos sin "Cubano" ni "Rueda de casino"

El catálogo sembrado (`STYLE_CATALOG`) SHALL excluir los estilos
"Cubano" y "Rueda de casino". La depuración idempotente del seed
SHALL eliminar las filas existentes en DBs ya pobladas: las
referencias estructurales (`classSeries.styleId`,
`scheduleBlock.styleId`, `danceSession.styleId`, `style.parentId`)
quedan desvinculadas a `null` y las referencias personales
(`PersonStyleRole`) se eliminan - una serie llamada "Rueda de Casino"
conserva su nombre y solo pierde el tag de estilo.

#### Scenario: reseed en DB con series que usan los estilos

- **GIVEN** una DB con una serie "Rueda de Casino" etiquetada "Rueda
  de casino" y bailarines con PersonStyleRole "Cubano"
- **WHEN** corre `pnpm db:seed`
- **THEN** la serie queda `styleId=null` (nombre intacto), los roles
  "Cubano" se eliminan y ninguna opción nueva ofrece esos estilos

### Requirement: Formulario de horarios legible

En `series/nueva`, cada fila de horario SHALL mantener Día (o Fecha en
taller) + Inicio + Término (+ eliminar) juntos en una fila; cuando no
caben, el día sube a su línea y los dos tiempos comparten la de abajo.
Los legends "Tipos de clase" y "Horarios semanales" SHALL tener
espacio visible antes de sus opciones.

#### Scenario: mobile 360px

- **GIVEN** el form de nueva serie en 360px
- **WHEN** se renderiza un horario
- **THEN** el select de día ocupa una línea y "Inicio"/"Término" (+
  la X) comparten la línea siguiente, sin wrap entre ellos

## MODIFIED Requirements

(none)
