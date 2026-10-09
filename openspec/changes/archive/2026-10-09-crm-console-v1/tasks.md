# Tasks: crm-console-v1

## 1. API

- [x] 1.1 `GET /crm/people/:personId` - ficha (score/segment/tags +
      resumen de actividad + recientes) scoped por assertActorAccess
- [x] 1.2 `GET /crm/campaigns/:id` - detalle de campaña scoped
- [x] 1.3 `sort` (score_desc|score_asc|name_asc) en `GET /crm/people`
- [x] 1.4 Cobertura de tests del detalle de contacto y campaña

## 2. Web

- [x] 2.1 `/crm/personas/[personId]` - ficha de contacto con edición de
      tags, resumen y actividad reciente
- [x] 2.2 `people-table` - cards clickeables, tags solo lectura, select
      de orden
- [x] 2.3 `/crm/campanas/nueva` - crear como página dedicada
- [x] 2.4 `/crm/campanas/[id]` - ficha de campaña con envío + diálogo
- [x] 2.5 `campaign-list` - cards clickeables, envío fuera del listado
- [x] 2.6 `/crm/triggers/nuevo` y `/crm/triggers/[id]` - crear/editar
      como páginas dedicadas
- [x] 2.7 `h1` único (overrides de appbar para subpáginas), `＋`/`▶` →
      iconos, sin `window.confirm`

## 3. Verificación

- [x] 3.1 `openspec validate crm-console-v1 --strict`
- [x] 3.2 `npx tsc --noEmit` web + api
- [x] 3.3 i18n audit `ALL_KEYS_OK`
- [x] 3.4 `impeccable detect` sobre el diff
- [x] 3.5 Regenerar docs API
