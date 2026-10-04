# crm-personids-scoping

## Why

`CampaignSegment.personIds` se acepta literal — un actor puede meter el
`personId` de cualquier persona conocida y notificarla, aunque no
pertenezca a su universo CRM (flag del review de
academy-audience-groups: pre-existente, expuesto por el picker nuevo).

## What Changes

- `resolveSegment` intersecta `personIds` con el **universo del actor**:
  `RelationshipScore` ∪ `ActorTag` del actor; para `ACADEMY` además
  `Enrollment` ∪ `ClassBooking` de la academia. Un id fuera del universo
  se descarta silenciosamente (no 400 — el criterio simplemente no
  alcanza a nadie ajeno).
- El resto de criterios ya están scopados por actor por construcción.

## Impact

- Affected specs: `crm/campaign-audience` (requirement nuevo sobre el
  criterio personIds).
- Affected code: `crm.service.ts` `resolveSegment` + spec.
