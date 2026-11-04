# Proposal: surveys-limit

## Why

`GET /academies/:id/surveys` ignora el parámetro `limit`: el front
(`survey-results.tsx`) ya envía `?limit=60` esperando el mismo
contrato del endpoint hermano `/instructors/:personId/surveys`, pero el
controller devuelve todos los grupos siempre. Sin cap, una academia con
historial largo trae la colección completa en cada vista de la ficha.

## What Changes

- `GET /academies/:id/surveys` acepta `?limit=` con el mismo contrato
  que `/instructors/:personId/surveys`: entero, default 12, max 60,
  inválido cae al default; el cap se aplica sobre los **grupos**
  (mes × serie) ya agregados, no sobre las respuestas crudas.
- `@ApiQuery({ name: "limit" })` + comentario de docstring en el
  controller.
- Test del cap en el spec del controller.
- `docs/openapi.json` + postman regenerados (cambia el schema del
  endpoint).

## Capabilities

- **Modified Capabilities**: `academies/course-surveys` - el listado
  agregado de encuestas gana el parámetro `limit` sobre los grupos.

## Impact

- API: `apps/api/src/academies/infrastructure/academies.controller.ts`
  (`courseSurveys`) + su spec.
- Front: sin cambios (ya envía `limit=60`).
- Docs: `docs/openapi.json`, `docs/postman/omni-dance.postman_collection.json`.
