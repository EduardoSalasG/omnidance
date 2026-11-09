# Handoff: implementación enrollment-plan-simplify (en curso)

Sesión 2026-11-09 (tercera del día). Continuación del handoff
`next-session-handoff-enrollment-plan-simplify.md`: se está implementando
el change `enrollment-plan-simplify` (el segundo change,
`academy-byo-collections`, sigue pendiente).

## Estado al momento del handoff

**Hecho por el orquestador:**

- `schema.prisma`: `EnrollmentStatus` → `ACTIVE | INACTIVE`;
  `PlanType` sin TRIAL; columna `Enrollment.pausedAt` eliminada.
- Migración `20261126000000_enrollment_plan_simplify` creada y APLICADA
  a la DB dev (`localhost:5433`): mapeo en el USING del swap de enum
  (TRIAL/ONLINE→ACTIVE, PAUSED/FROZEN→INACTIVE; plan TRIAL→CLASS_PACK
  con `classCount = COALESCE(classCount,1)`). Post-migración: 890
  ACTIVE + 2 INACTIVE; 20 CLASS_PACK classCount=1 (ex-TRIAL).
- `prisma generate` corrido (hubo que matar el `node dist/main` viejo
  que escuchaba en :4000 y bloqueaba el dll - el API dev quedó
  APAGADA, levantar de nuevo al verificar).
- `packages/shared`: `ENROLLMENT_STATUSES=["ACTIVE","INACTIVE"]`,
  `PLAN_TYPES=["MONTHLY","CLASS_PACK","PERIOD"]`; rebuild hecho.
- `seed-dev.ts`: uniones de tipo/status nuevas; 5 planes "Clase de
  prueba" → `CLASS_PACK` `classCount:1`; enroll calls → estados
  binarios; copy "fin de mes calendario" → "por N meses"; pausedAt
  fuera. `enrich-academy-seed.cjs` y `qa-real-personas.cjs` no
  requirieron cambios (solo ACTIVE).
- Spec deltas nuevos en el change (faltaban respecto de la proposal):
  `academies/{renewal,payment-claims,console-lists,bulk-import,
  owner-insights,public-profile}`, `academy-learner`,
  `academy-billing`, `crm/{campaign-audience,contact-console}`,
  `mail-campaigns`, `payments/trial-plan-purchase` (REMOVED completa).
  `openspec validate enrollment-plan-simplify` VERDE.
- Docs actualizados: `docs/qa-flows-inventory.md` (filtros binarios,
  vigencia rodante, sin TRIAL_EXPIRING, price≤0), `omni-dance.md` §9/11/12/13/14,
  `docs/architecture.md` (módulo academies + billing + cron),
  `docs/flows.md` (membership settle + reminders).

**Implementador web (subagente) - COMPLETADO VERDE:**

- 38 archivos en `apps/web`: unions `ACTIVE|INACTIVE`, badges
  (ACTIVE neon / INACTIVE muted), `suggestedEndsAt` rodante con clamp,
  `freeTrial`→`notSellable = price<=0`, TRIAL_EXPIRING fuera de CRM,
  i18n en parts + monolitos ×4 locales (mapas de status →
  ACTIVE/INACTIVE, TRIAL_EXPIRING eliminado).
- `typecheck`/`test`/`lint` verdes por el propio agente.

**Implementador API (subagente) - CORRIENDO** al escribir esto:
scope `apps/api/src` + `apps/api/test` (vigencia rodante, cuota por
ciclo pagado, listas de status, transitions, dashboard, settlement,
checkout price≤0, reminders por tipo, claims, CRM TRIAL_EXPIRING,
specs). Ya modificó ~25 archivos.

## Falta (siguiente sesión o continuación)

1. Integrar el reporte del implementador API; revisar el diff.
2. `pnpm db:seed` (idempotente; verificar que no rompe con enums nuevos).
3. `pnpm --filter @omnidance/api typecheck` + `pnpm --filter
   @omnidance/api test` (suite completa verde citando output).
4. `pnpm --filter @omnidance/web build` si hace falta (typecheck ya ok).
5. Repro manual task 2.2 si hay stack: pack 1 clase agota → 409;
   monthly classCount resetea al renovar.
6. `node apps/api/scripts/export-api-docs.cjs` (API viva :4000) →
   regenerar `docs/openapi.json` + postman.
7. Archive openspec: `openspec archive enrollment-plan-simplify` (con
   specs, tiene deltas) y decidir `trial-class-quota` (SUPERSEDIDO -
   archivar vacío o borrar el change; el bug que motivaba ya queda
   cubierto por CLASS_PACK classCount=1).
8. Marcar tasks.md, commit (identidad del repo EduardoSalasG; sin
   co-autoría ni firma de agente) y handoff final.
9. Pendiente de producto: ¿exponer `classCount` en el plan-form para
   tipos ≠ CLASS_PACK? El modelo ya lo soporta vía API/seed (hay un
   MONTHLY classCount=4 en dev) pero el form solo lo muestra en
   CLASS_PACK - decisión del owner.

## Notas

- `studentsByStatus` del dashboard API pasa a `{active, inactive}` (el
  type web ya está actualizado; no hay consumidor render en web).
- Claims findFirst: filtro de status eliminado (binary = todos).
- Reminders: solo ACTIVE + plan por tiempo (filtro por `plan.type`).
- API dev :4000 estaba corriendo `node dist/main` (build viejo) - se
  detuvo para `prisma generate`; reiniciar stack para verificación.
