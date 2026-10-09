# Handoff 2026-10-09g — Paridad consolas + CRM consola v1

## Completado y commiteado en `dev` (sin push)

| Commit | Contenido |
|---|---|
| `9579a62` | **CRM consola v1** (`crm-console-v1` archivado): `GET /crm/people/:personId` (score/segment/tags + resumen de actividad + recientes con nombre de evento/serie/plan, 404 fuera del universo), `GET /crm/campaigns/:id`, `sort` (score_desc/score_asc/name_asc) en `GET /crm/people`. Web: ficha `/crm/personas/[personId]` (tags se editan ahí), `/crm/campanas/nueva` + `/crm/campanas/[id]` (envío con diálogo focus-trapped), `/crm/triggers/nuevo` + `/crm/triggers/[id]`; cards de personas/campañas clickeables; `LABEL_OVERRIDES` del appbar para /crm/campanas|triggers; `PlusIcon` nuevo; `＋`/`▶`/`window.confirm` eliminados del CRM. |
| `618f022` | **Paridad consola productor** (`console-parity-v5` parcial): fichas `/productor/codigos|listas|pagos|comprobantes/claim/[id]`, cards clickeables, ConsoleHeader, zona destructiva, `GET /me/payouts` paginado `{items,total,page,pageSize}` + `GET /me/payouts/:id`, `GET /discount-codes/:id`, `GET /guest-lists/:id`, `GET /producer/claims/:claimId`. |
| `05fff7f` | Auditoría consola owner (fixes de flujo/a11y). |
| `e8320ac` | OpenAPI: `@ApiProperty` en todos los DTO-bound query params + `@ApiQuery` en ~90 escalares opcionales (gap cerrado, docs regeneradas). |

## Skill nuevo

`.devin/skills/console-patterns/SKILL.md` — el patrón unificado de
consolas (crear=CTA→page, card clickeable→ficha, acciones en ficha,
destructivo en zona roja, FilterBar+Pager, estados/a11y). Referenciado
desde `AGENTS.md` §Interfaz. Usarlo en toda consola nueva o refactor.

## Verificación

- `openspec validate` limpio (changes archivados con deltas aplicados).
- tsc API + web limpio.
- `gap-crm.e2e.spec.ts` 35/35 (incluye ficha contacto, sort, detalle campaña, ownership); specs previos de la sesión verdes.
- i18n audit `ALL_KEYS_OK`; `impeccable detect` `[]`.
- Docs API regeneradas: 276 paths.

## Pendiente / próximos slices

1. **`console-parity-v5` sigue abierto** — falta archivarlo: las tasks
   restantes eran de verificación, ya ejecutadas. Revisar
   `openspec/changes/console-parity-v1... v5` y archivar si todo cubierto.
2. **QA funcional del CRM**: probar ficha de contacto con actores reales
   (PRODUCER con Pro; ACADEMY con enrollments/attendances).
3. `dev → main`: release gate pendiente (acumulan varios features).
4. Deuda conocida documentada en handoffs anteriores (paginación admin
   acotada por diseño; `commissionPct` = subtipo del acuerdo económico).

## Notas

- El API dev corre en `:4000` (nest --watch); `docs/openapi.json` se
  regenera con `node apps/api/scripts/export-api-docs.cjs`.
- `TriggerForm`/`CampaignForm` se reusaron en las páginas dedicadas sin
  cambios de firma.
- `GET /crm/triggers/:id` no existe: la ficha de edición resuelve el
  trigger desde el listado del actor (universo acotado a 4 keys).
