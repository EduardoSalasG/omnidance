# Proposal: crm-console-v1

## Why

El CRM transversal (`/crm`) quedó funcional pero por debajo del estándar
de industria y del patrón de consola que ya rige academia/productor:

- Las personas no tienen ficha: el card es un callejón sin salida y la
  edición de tags vive inline en el listado.
- Las campañas se crean con un form inline en el listado y el envío es
  una mutación en el propio card con `window.confirm`.
- Los triggers se crean/editan inline.
- `/crm/campanas` y `/crm/triggers` declaran un `h1` propio que duplica
  el del chrome.
- Iconos unicode (`＋`, `▶`) en lugar de componentes de icono.
- Sin ordenación en el listado de personas.

## What

- `GET /crm/people/:personId` - ficha de contacto del actor: score,
  segmento, tags, resumen de actividad (asistencias, gasto, referidos,
  primera/última actividad) y actividad reciente (checkins/pagos del
  productor; enrollments/asistencias de la academia).
- `GET /crm/campaigns/:id` - detalle de campaña con el mismo scope de
  actor.
- `sort` en `GET /crm/people` (score_desc default, score_asc, name_asc).
- Web: ficha de contacto `/crm/personas/[personId]` (tags se editan ahí),
  `/crm/campanas/nueva`, `/crm/campanas/[id]` (envío con diálogo
  focus-trapped), `/crm/triggers/nuevo` y `/crm/triggers/[id]` (crear y
  editar como páginas dedicadas); cards clickeables; `h1` único; iconos
  reales; select de orden en el listado.
