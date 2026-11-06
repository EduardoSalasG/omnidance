# Delta: payments/platform-charges

## ADDED Requirements

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
