# Proposal — producer-pro-tiers

## Why

`PRODUCER_TIER_FEATURES` da todas las features a cualquier Pro y
`producerEffectiveTier` colapsa todo tier pago a `"PRO"` — quien paga
STARTER recibe lo mismo que BIG. La matriz aprobada diferencia valor
por tier y el staff pasa de booleano a cupo numérico.

## What Changes

- **Matriz por tier** (acumulativa, aprobada por el usuario):
  `PRO_STARTER` = analytics + exports + staff ≤1;
  `PRO_GROWTH` = +crm, staff ≤2; `PRO_BIG` = todo + staff ilimitado.
- **Naming**: la matriz SHALL usar los códigos del enum
  (`PRO_STARTER`/`PRO_GROWTH`/`PRO_BIG`), no `PRO`/`PRO_GROWTH`/`PRO_SCALE`.
- **Tier efectivo real**: `producerEffectiveTier` SHALL devolver el
  tierCode del Pro activo (suscripción vigente o trial), no "PRO".
- **Cupo de staff**: `POST /events/staff` SHALL rechazar con 403 la
  invitación cuando el productor ya alcanzó su cupo
  (`PRODUCER_TIER_STAFF_LIMIT`); FREE sin Pro sigue sin acceso.
- **Progresión al renovar**: la renovación SHALL evaluar la media de
  90d en la moneda de la suscripción; si supera el tope del tier, el
  flujo SHALL exigir el superior (`pendingTierCode` existe — reusarlo).
- **Vista Pro**: mostrar tier actual, features habilitadas y uso de
  cupo de staff.

## Capabilities

### Modified Capabilities
- `producer-pro`: features y staff diferenciados por tier; renovación
  condicionada al tope.
