# Proposal: crm-trigger-actor-scope

## Why

Las keys de trigger `TRIAL_EXPIRING` (solo tiene sentido con
enrollments de academia) y `REGULAR_NO_PRESALE` (preventa de eventos
del productor) evalúan en 0 en silencio si el actor las crea con el
tipo equivocado. El form las ofrece a todos sin avisar.

## What Changes

- `createTrigger` valida el `actorType` del key: `TRIAL_EXPIRING` →
  solo ACADEMY, `REGULAR_NO_PRESALE` → solo PRODUCER; el resto
  (WINBACK, ATTENDANCE_DROP, SEGMENT_ENTER, SEGMENT_EXIT) aplica a
  ambos. Violación → BAD_REQUEST.
- El select de keys en `/crm/triggers/nuevo` filtra por `actorType`
  del actor elegido; las keys restringidas muestran su etiqueta
  "(solo academia)" / "(solo productor)" en descripciones.
