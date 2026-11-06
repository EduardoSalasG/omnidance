# payments/platform-charges Specification

## Purpose
TBD - created by archiving change platform-charge-collect. Update Purpose after archive.

## Requirements

### Requirement: Cobro suelto plataforma→actor

El sistema SHALL permitir cobrar un monto arbitrario a una persona
con customer en la pasarela de suscripciones, mediante
`provider.collect()` sobre su medio de pago registrado. El flujo
SHALL ser: crear `Payment` PENDING (`orderType: "PLATFORM_CHARGE"`,
refId `platchg_<uuid>` único) como claim antes del cargo → invocar
`collect()` → reflejar el outcome:

- `COLLECTED`: settle a PAID con la verdad monetaria `gateway*`, igual
  que cualquier orden confirmada.
- `FAILED`: settle a FAILED (el cargo a la tarjeta fue rechazado).
- `PENDING`: el Payment queda PENDING con su `paymentUrl` disponible
  para que el actor pague por link/email; una confirmación posterior
  por webhook o polling SHALL liquidarlo por la misma rama de settle.
- Error transitorio del proveedor (red/HTTP): SHALL liberar el claim
  (borrar Payment + eventos) para permitir reintento, mismo patrón
  que `collectOverdueInvoices`.

Un `PLATFORM_CHARGE` SHALL ser ingreso directo de plataforma (como
`PLATFORM_SUB`): `fee: 0`, `net: amount`, no devenga a ningún actor y
no entra en los conjuntos de orderTypes devengables de la consola de
finanzas.

#### Scenario: Cobro con tarjeta registrada

- **GIVEN** un actor con customer Flow y tarjeta vigente
- **WHEN** se ejecuta un cobro suelto por $50.000
- **THEN** el Payment queda PAID con los campos `gateway*` poblados y
  el ledger registra ORDER_CREATED + STATUS_CONFIRMED + SETTLED

#### Scenario: Actor sin medio de pago

- **GIVEN** un actor sin tarjeta registrada
- **WHEN** se ejecuta el cobro
- **THEN** el outcome es PENDING, el Payment queda PENDING y el
  caller recibe `paymentUrl` para compartirle el link

#### Scenario: Tarjeta rechazada

- **WHEN** `collect()` devuelve FAILED
- **THEN** el Payment queda FAILED con el evento de ledger
  correspondiente y el pagador recibe la notificación `payment.failed`

### Requirement: Endpoint admin de cobro directo

`POST /admin/platform-charges` SHALL existir bajo `admin.access`
(SessionGuard + RolesGuard + `RequirePermissions`), con body
`{personId, amount, subject}` validado (monto entero positivo,
concepto no vacío). La respuesta SHALL incluir `paymentId`,
`outcome` y `paymentUrl` cuando el proveedor degrada a cobro por
link. La llamada SHALL rechazarse para personas inexistentes (404) y
montos inválidos (400).

#### Scenario: Admin cobra desde la consola

- **GIVEN** un admin en la ficha de `/admin/usuarios/[personId]`
- **WHEN** ejecuta "Cobro directo" con monto y concepto válidos
- **THEN** la API ejecuta el collect y la UI muestra el resultado:
  éxito PAID, aviso con el link si PENDING, o error si FAILED

#### Scenario: Sin permiso

- **WHEN** un actor sin `admin.access` llama al endpoint
- **THEN** responde 403 sin crear Payment ni tocar la pasarela

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
