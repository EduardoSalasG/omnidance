# Handoff: enrollment-plan-simplify IMPLEMENTADO Y ARCHIVADO

Sesión 2026-11-09 (tercera del día). El change
`enrollment-plan-simplify` quedó implementado, verificado y archivado
(commit `e067e1ed` en `dev`, 97 archivos).

## Resultado

- **Modelo nuevo**: `EnrollmentStatus` = ACTIVE|INACTIVE;
  `PlanType` sin TRIAL ("clase de prueba" = CLASS_PACK classCount=1,
  price 0 staff / >0 vendible); `pausedAt` eliminado; vigencia rodante
  `endsAt = base + duración` (renovar extiende desde el endsAt pagado);
  `classCount` = tope por ciclo pagado en cualquier tipo (ventana
  `planCycleStart`); `price <= 0` no vendible online; alta staff
  autocomputa `endsAt`; reminders solo planes por tiempo; CRM sin
  `TRIAL_EXPIRING`; `studentsByStatus {active, inactive}`.
- **Migración** `20261126000000_enrollment_plan_simplify` aplicada a
  dev (mapeo dentro del USING del swap de enum). Post: 890 ACTIVE +
  2 INACTIVE; 20 CLASS_PACK classCount=1 ex-TRIAL.
- **OpenSpec**: `enrollment-plan-simplify` archivado con deltas
  aplicados (15 specs actualizadas; `payments/trial-plan-purchase`
  retirada vía `retire_capabilities: true`; `academies/enrollment-model`
  creada). `trial-class-quota` archivado con `--skip-specs`
  (SUPERSEDIDO por este change).

## Verificación (evidencia)

- API: `typecheck` limpio; `pnpm test` = **135 archivos / 2527 tests
  verdes** (incluye e2e contra DB migrada); `nest build` verde.
- Web: `typecheck`/`test` (40 tests) /`lint` verdes (74 warnings
  preexistentes).
- `pnpm db:seed` idempotente OK.
- `docs/openapi.json` + postman regenerados (376 paths, API viva).
- Docs actualizados: `omni-dance.md`, `docs/architecture.md`,
  `docs/flows.md`, `docs/qa-flows-inventory.md`.

## Gaps y pendientes

- **Producto**: ¿exponer `classCount` en plan-form para tipos ≠
  CLASS_PACK? El modelo lo soporta (hay un MONTHLY classCount=4 en
  dev) pero el form solo lo muestra en CLASS_PACK. Decisión del owner.
- Repro manual pendiente (task 2.2): pack de 1 clase agota → 409;
  monthly classCount resetea al renovar (cubierto por tests nuevos,
  falta smoke en UI).
- `academy-byo-collections` sigue pendiente (0/14 tasks): BYO gateway,
  take 1% neto+IVA, bloqueo por impago, liquidación exportable.
- Acumulados sin cambio: flake `dancer-eventos` mobile; drift i18n
  `academyPay.report.*`, `academy.levelsConfig.backToGlobalBody`.
- El stack dev: dejé `node dist/main` (build nuevo) corriendo en
  :4000 para el export de docs; el `next dev` de :3000 no estaba
  arriba.
- i18n: `academy.stats` quedó con {active,inactive} (catálogo hoy
  muerto). `academy.status` perdió `CANCELLED` en monolitos (rows
  legacy degradan a string cruda, fallback diseñado).
