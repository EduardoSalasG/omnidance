# Delta: academies/class-series

## ADDED Requirements

### Requirement: Nivel de serie dentro de la línea efectiva

Al crear (`POST`) o editar (`PATCH`) una serie, `levelId` SHALL
pertenecer a la línea efectiva de la academia (custom si existe,
global si no). La API SHALL responder 400 si el nivel es de otra
academia o pertenece a la línea global cuando la academia tiene
línea propia.

#### Scenario: Nivel global en academia con línea custom

- **GIVEN** Mambo Madness con línea custom
- **WHEN** el owner edita una serie enviando el `levelId` del "Básico"
  global
- **THEN** la API responde 400 y la serie queda sin cambios

#### Scenario: Nivel de otra academia rechazado

- **GIVEN** una academia cualquiera
- **WHEN** el body trae un `levelId` custom de otra academia
- **THEN** la API responde 400

## MODIFIED Requirements

### Requirement: Borrado lógico de series

`DELETE /academies/:id/series/:seriesId` SHALL realizar un borrado
lógico: persiste `deletedAt` y `active=false`, cancela las clases
futuras y devuelve las reservas BOOKED/WAITLIST (comportamiento de
cancelación existente). Una serie eliminada MUST NOT aparecer en
`GET /academies/:id/series` ni en los endpoints de detalle de consola
(`GET .../series/:seriesId`, `GET .../series/:seriesId/classes`
responden 404), y ni ella ni sus clases u horarios SHALL aparecer en
las superficies de clases (`/classes/browse`, `/classes/mine`,
`/classes/teaching`, próximas clases de `GET /academies/:id`,
`GET /academies/:id/slots` ni los agregados de insights). La fila
SHALL seguir existiendo para analítica y auditoría; `PATCH
{active:true}` la restaura (`deletedAt=null`) y rematerializa la
ventana rodante.

#### Scenario: eliminar clase

- **GIVEN** una serie activa con clases futuras
- **WHEN** el owner ejecuta DELETE
- **THEN** la serie queda `active=false` + `deletedAt` set, desaparece
  del listado de Clases y sus reservas futuras se cancelan con refund

#### Scenario: restaurar desde API

- **GIVEN** una serie con `deletedAt` set
- **WHEN** se ejecuta PATCH `{active:true}`
- **THEN** `deletedAt` vuelve a null, la serie reaparece en el listado
  y se rematerializa la ventana rodante

#### Scenario: serie eliminada fuera de las superficies de clases

- **GIVEN** una serie con `deletedAt` set cuyas clases siguen
  materializadas (borrado directo en datos, sin pasar por el DELETE)
- **WHEN** un bailarín explora `/classes/browse` o el owner abre
  "Niveles y cupos"
- **THEN** ni la serie ni sus clases ni sus horarios aparecen
