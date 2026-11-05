# Delta: payments/platform-charges

## ADDED Requirements

### Requirement: Reintento automático de cobros impagos

El sistema SHALL reintentar por job programado los `Payment` PENDING
con `orderType: "PLATFORM_CHARGE"` que no hayan agotado reintentos.
Cada reintento SHALL ejecutarse sobre el mismo `Payment` (sin crear
duplicados): evento `COLLECT_ATTEMPT` en el ledger antes de invocar
`provider.collect()` con el `refId` original como `commerceOrder` →
mismo ciclo de outcome que el cobro inicial:

- `COLLECTED`: settle a PAID con la verdad monetaria `gateway*`.
- `FAILED`: settle a FAILED.
- `PENDING`: el Payment sigue PENDING y vuelve a ser elegible en el
  próximo run.

El número de intentos SHALL contarse por eventos `COLLECT_ATTEMPT` en
el ledger; al alcanzar el tope (param
`platform_charges.retry.max_attempts`, default 5) el cargo deja de
ser elegible sin cambiar su estado - el actor aún puede pagar por
`paymentUrl` y la confirmación por webhook/polling SHALL seguir
liquidándolo por la rama habitual.

Un error transitorio del proveedor (red/HTTP) SHALL abortar el
barrido del run sin liberar ni duplicar claims - el Payment mantiene
su `COLLECT_ATTEMPT` registrado y se reintenta en el próximo run.

El handler del job SHALL reportar a `JobRun.meta` los contadores del
barrido (elegibles, colectados, fallidos, pendientes, agotados).

#### Scenario: PENDING recuperado al día siguiente

- **GIVEN** un `PLATFORM_CHARGE` PENDING (actor sin tarjeta al cobro
  inicial) cuyo actor registró la tarjeta después
- **WHEN** corre el job `platform-charges.collect`
- **THEN** emite `COLLECT_ATTEMPT`, el cargo sale PAID y el ledger
  registra la confirmación y settle habituales

#### Scenario: Actor sigue sin medio de pago

- **GIVEN** un `PLATFORM_CHARGE` PENDING con un `COLLECT_ATTEMPT`
  previo
- **WHEN** el provider devuelve PENDING en el reintento
- **THEN** el Payment queda PENDING con dos `COLLECT_ATTEMPT` y sigue
  elegible hasta el tope

#### Scenario: Tope de reintentos

- **GIVEN** un `PLATFORM_CHARGE` PENDING con `COLLECT_ATTEMPT` igual
  al param `platform_charges.retry.max_attempts`
- **WHEN** corre el job
- **THEN** no se invoca `collect()` para ese cargo; el Payment sigue
  PENDING y su `paymentUrl` sigue pagable por link

#### Scenario: Error transitorio del proveedor

- **WHEN** `collect()` lanza un error de red/HTTP a mitad del barrido
- **THEN** el job aborta sin seguir iterando, sin liberar el claim y
  sin marcar el Payment; el intento queda registrado
