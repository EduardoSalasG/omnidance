# Diseño — audiencias por grupo para ACADEMY

## Resolución de segmento (extend `resolveSegment`)

Los criterios siguen siendo OR entre sí. Nuevos, solo `ACADEMY`:

| Criterio | Resolución |
|---|---|
| `allStudents: true` | `Enrollment where {academyId: actorId}` → personId |
| `enrollmentStatus: [...]` | `Enrollment where {academyId, status: {in}}` → personId |
| `planId` | `Enrollment where {academyId, planId}` → personId |
| `seriesId` | `ClassBooking where {class: {slot: {seriesId, academyId}}, status: {not: "CANCELLED"}}` → personId |

Validación en `parseSegment`: si el actor no es ACADEMY y viene alguno de
estos campos → `BAD_REQUEST`. `seriesId`/`planId` deben pertenecer a la
academia (findFirst con academyId=actorId; si no → BAD_REQUEST).

## Preview

`POST /crm/campaigns/preview` `{actorType, actorId, segment}` →
`{count: number}`. Reusa `parseSegment` + `resolveSegment` — sin crear
campaña ni enviar. Mismo `assertActorAccess` que el resto.

## UI CampaignForm

- Debajo del fieldset de audiencia existente: si `actor.actorType ===
  "ACADEMY"` → grupo "Alumnos" con: chip "Todos los alumnos", chips de
  estado (ACTIVE/TRIAL/PAUSED/ONLINE/FROZEN), select Plan (carga
  `GET /academies/:actorId/plans`), select Serie (carga el listado de
  series de la academia — revisar endpoint existente
  `GET /academies/:id/series` o equivalente en la consola).
- Picker de personas: lista scrollable de `GET /crm/people` (ya se
  fetchea para tags) con checkboxes → `personIds`.
- Preview en vivo: onChange de cualquier criterio → `POST preview`
  debounced ~300ms → muestra "N personas alcanzadas" (o "audiencia vacía").
- Criterios vacíos → hint amber existente (`noCriterion`), sin llamar
  preview.

## Fuera de scope

- Cooldown/dedup de campañas manuales (cada send es DRAFT→SENT único e
  intencional).
- Segmentos conductuales nuevos — se reusan los 4 computados.
- Programación futura (scheduled send).
