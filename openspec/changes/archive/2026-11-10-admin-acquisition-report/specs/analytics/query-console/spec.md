## ADDED Requirements

### Requirement: Entidad `acquisition` del lente ADMIN

El catálogo del lente ADMIN SHALL incluir la entidad `acquisition`
(reporte de altas por canal de adquisición). Cada fila del resultado
corresponde a UN canal con su conteo de altas y porcentaje del total;
el resultado se ordena por altas descendente y el canal como
desempate. Las columnas SHALL ser `canal`, `altas`, `pct`. La entidad
SHALL declarar los filtros `from`/`to` (rango sobre `Person.createdAt`,
misma semántica de fechas que el resto de entidades) y `kind`
(enum multi por prefijo de canal).

El canal de un alta SHALL resolverse así: si la persona tiene una fila
`Referral` como referida, el canal es la fuente de esa referral en
minúsculas (`invite`, `gift_ticket`, `link`); si no, es
`Person.acquisitionSource` tal como quedó persistida
(`utm:<source>`, `ref:<host>`, `landing:<path>`, `direct`); si tampoco
existe, `sin_dato`. Cuando una persona tenga más de una fila Referral
SHALL usarse la más antigua.

El filtro `kind` SHALL aceptar los valores `utm`, `ref`, `landing`,
`direct`, `invite`, `gift_ticket`, `link`, `none` (selección múltiple
CSV igual que otros filtros enum multi); un valor fuera de la
whitelist SHALL responder 400. `utm` agrupa todo canal
`utm:*`; `ref` todo `ref:*`; `landing` todo `landing:*`; `direct` el
canal `direct`; `invite|gift_ticket|link` los canales de referral;
`none` agrupa `sin_dato`.

La entidad es agregada: las filas SHALL no llevar `personId` de
sujeto (sin drill a ficha de persona). `total` SHALL ser la cantidad
de canales en el resultado (tras filtros), y el `summary` SHALL
informar las altas totales del período y la cantidad de canales.

#### Scenario: reporte por canal del período

- **GIVEN** en el rango elegido hubo altas: 3 con
  `acquisitionSource=utm:instagram`, 2 `direct`, 1 referida por
  INVITE y 1 sin dato
- **WHEN** ADMIN ejecuta `entity=acquisition` con `from`/`to`
- **THEN** las filas son `utm:instagram` (3), `direct` (2), `invite`
  (1), `sin_dato` (1), en ese orden, cada una con su pct del total
  (7) y `total` = 4 canales

#### Scenario: referral gana a acquisitionSource nulo

- **GIVEN** una persona creada por token de invite (acquisitionSource
  null) que además tiene fila Referral INVITE
- **WHEN** se ejecuta la entidad
- **THEN** el alta cuenta en el canal `invite`, no en `sin_dato`

#### Scenario: filtro kind por prefijo

- **WHEN** se ejecuta con `kind=utm,ref`
- **THEN** solo aparecen filas de canales `utm:*` y `ref:*`

#### Scenario: kind inválido

- **WHEN** se ejecuta con `kind=foo` → 400
