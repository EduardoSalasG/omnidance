# Handoff: rediseño del modelo de inscripciones/planes + BYO collections

Sesión 2026-11-09 (segunda del día). El trabajo era implementar
`trial-class-quota` (handoff `next-session-handoff-trial-class-unlimited-bug.md`)
y el review de estados escaló a un rediseño aprobado por el owner.

## Estado

- **Dos changes OpenSpec creados y validados** (`openspec validate
  --changes` verde, 4/4):
  - `enrollment-plan-simplify` — proposal/design/tasks/deltas completos
    (class-credits MODIFIED + enrollment-model ADDED).
  - `academy-byo-collections` — proposal/design/tasks/delta payments.
- **`trial-class-quota` queda SUPERSEDIDO**: su generalización
  (`classCount != null` en cualquier tipo) está absorbida en
  `enrollment-plan-simplify`; el resto es moot porque el tipo TRIAL
  desaparece. Decidir si archivarlo vacío o dejarlo hasta que el nuevo
  change aterrice (no implementar por separado — generaría rework).
- **Nada de código implementado aún.**

## Decisiones del owner (vinculantes)

### Modelo de alumnos/planes (change 1)

- `EnrollmentStatus` → binario `ACTIVE|INACTIVE`. Mapeo:
  TRIAL/ONLINE→ACTIVE, PAUSED/FROZEN→INACTIVE. Se pierde el motivo de
  inactividad a propósito.
- `PlanType` saca solo `TRIAL` → "clase de prueba" = CLASS_PACK con
  classCount (normalmente 1), price 0 (staff) o >0 (vendible online).
- **Vigencia rodante**: endsAt = base + duración (MONTHLY +1mes,
  QUARTERLY +3, SEMIANNUAL +6, PERIOD +días, SINGLE +1d, CLASS_PACK
  null). El mes calendario se murió: castigaba mitad de mes y choca con
  el cobro por aniversario de Flow. Staff puede seguir marcando "pagado
  hasta" a mano.
- `classCount` = tope por **ciclo pagado** (ventana
  `max(startedAt, endsAt − duración)`), no desde el alta. Fix al bug de
  conteo histórico en renovaciones.
- Alta staff autocomputa endsAt (dto explícito gana).
- `price <= 0` no se vende online (cualquier tipo).
- CRM `TRIAL_EXPIRING` eliminado. ANNUAL solo plataforma.
- Hallazgo: el enrollment del bug era `ACTIVE` con plan TRIAL (staff-add),
  ni siquiera usaba el status TRIAL — evidencia de que el eje duplicado
  no se usaba. En dev: 885 ACTIVE vs 7 no-ACTIVE.

### Cobranza academias (change 2)

- **BYO gateway** (modelo Membrezia): academia trae sus credenciales
  Flow/MP (generalizar `ProducerGatewayAccount`), la plata va directo a
  su cuenta. Omni nunca recibe plata de academias → fuera exposición
  SII con informales + adiós payouts de academia.
- **Take 1% neto + IVA** flat, param `academy_fee.net_pct` (precio de
  adopción; nadie en el mercado cobra take — VirtualPos ~3-4,2% all-in
  es el costo de pasarela que pagan igual; con 1% el all-in queda
  ~4,2-5,4% ≈ a ≤1,2pp del DIY). Se sube por param después.
- **Facturado mes vencido**: take devengado por Payment congelado,
  viaja en la factura de PlatformSubscription (o doc propio).
- **Impago → bloqueo BYO**: `collectionsBlockedAt` deja el checkout de
  alumnos solo con claim manual; se libera al pagar.
- **Liquidación mensual exportable PDF/CSV** (reusa `buildTablePdf`).
- Precios SaaS + take con convención **neto + IVA** (B2B, como el fee
  de productor). Pendiente menor: si `*_monthly_clp` se reinterpreta
  como neto o solo el take va neto+IVA — documentar decisión.
- Deprecar GATEWAY_FEE_PASSTHROUGH/ACADEMY_COBROS_TAKE (solo histórico).

## Próximo slice (implementación change 1)

Seguir `openspec/changes/enrollment-plan-simplify/tasks.md`: specs
rojos → migración Prisma → código → front/i18n/seed → docs + archive.
Puntos sensibles ya mapeados en `design.md` (ventana de ciclo, listas
de status, reminders por tipo de plan, copy 409 "pack" en MONTHLY).

## Pendientes acumulados (sin cambio)

- Proyecciones actualizadas a escribir en `omni-dance.md` §10 +
  `docs/estrategia-comercial-2026-10-22.md` cuando aterrice change 2
  (números ya calculados en el design del change: +$0,03/0,12/0,23M
  por escenario a 1% neto).
- Validación prod: params seed + grant trial Producer Pro.
- Flake `dancer-eventos` mobile; drift i18n `academyPay.report.*`,
  `academy.levelsConfig.backToGlobalBody`.
- `.openspec-archive.lock` stale reaparece: `rm openspec/changes/
  archive/.openspec-archive.lock` y re-correr.
- Stack dev: web :3000, api :4000, docker db :5433 (ver handoff
  anterior para credenciales).

## Notas de proceso

- `git` no está en el PATH del shell Devin: `export PATH="/c/Program
  Files/Git/bin:$PATH"` al abrir sesión nueva.
- DB dev: `docker exec omnidance-db psql -U omnidance -d omnidance`.
