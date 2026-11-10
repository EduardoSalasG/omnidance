# Proposal: simplificación del modelo de inscripciones y planes de academia

## Resumen

El modelo actual arrastra una taxonomía "tipo BoxMagic" que no se usa:
5 estados de inscripción (`ACTIVE/PAUSED/TRIAL/FROZEN/ONLINE`, de los
cuales solo ACTIVE mueve el 99% de los datos) y 7 tipos de plan donde
`TRIAL` duplica un eje que ya resuelve `classCount`. Además la vigencia
por **mes calendario** castiga al alumno que se inscribe a mitad de mes
y es incompatible con el cobro recurrente por aniversario de la
pasarela. Decisiones del owner (sesión 2026-11-09):

- **Estado del alumno es binario**: `ACTIVE | INACTIVE`. El resto se
  elimina o convierte: `TRIAL`/`ONLINE` → `ACTIVE` (hoy son bookables y
  cuentan como vigentes); `PAUSED`/`FROZEN` → `INACTIVE` (hoy no bookan
  ni cuentan). El "por qué" de la inactividad se pierde a propósito.
- **`PlanType` pierde solo `TRIAL`**: "clase de prueba" sigue como
  producto = `CLASS_PACK` con `classCount` (normalmente 1) y `price`
  opcional (0 = asigna staff, >0 = se vende online como hoy).
- **Vigencia rodante** (opción A aprobada): `endsAt = base + duración`
  — MONTHLY +1 mes, QUARTERLY +3, SEMIANNUAL +6, PERIOD +`periodDays`,
  SINGLE +1 día, CLASS_PACK `null`. Resuelve el castigo de mitad de mes
  por construcción y alinea vigencia con el cobro por aniversario del
  gateway. El staff que quiera mes calendario lo marca a mano en pagos
  manuales ("pagado hasta" sigue siendo editable).
- **`classCount` = tope por ciclo pagado**, aplicable a cualquier tipo
  (un MONTHLY con `classCount=8` es "8 clases al mes"): el conteo cuenta
  solo reservas del ciclo vigente `[max(startedAt, endsAt − duración),
  ...]`, no desde el alta histórica — fix al bug de acumulación en
  renovaciones.
- **Alta staff autocomputa `endsAt`** rodante según el plan; el owner
  solo lo edita si quiere otra fecha. Cero fechas obligatorias.
- **`price ≤ 0` no se vende online** (generaliza la regla TRIAL).
- **CRM `TRIAL_EXPIRING` eliminado** (decisión del owner).
- ANNUAL se mantiene solo para tiers de plataforma (no `PlanType`).

## Cambios

- Migración Prisma: `EnrollmentStatus` → `ACTIVE | INACTIVE`
  (TRIAL/ONLINE→ACTIVE, PAUSED/FROZEN→INACTIVE); `PlanType` saca
  `TRIAL` (planes TRIAL → `CLASS_PACK` con `classCount=1`);
  `Enrollment.pausedAt` se evalúa (probable drop).
- `resolveQuota`/`myQuota`/`myCredits`: bookable = `ACTIVE`; cuota por
  conteo = `plan.classCount != null` en cualquier tipo; ventana por
  ciclo pagado.
- `membershipEndsAt`: vigencia rodante por duración del tipo.
- Settlement: se elimina el caso especial TRIAL (fila aparte);
  checkout: `price ≤ 0` → no vendible; suscripciones manual/card sin
  cambios de motor (el endsAt lo deriva la misma función).
- Todas las listas `["ACTIVE","TRIAL","ONLINE"]` → `["ACTIVE"]`;
  la matriz `ENROLLMENT_TRANSITIONS` queda toggle ACTIVE↔INACTIVE.
- Dashboard alumnos por status → activo/inactivo; badges/filtros de
  consola; recordatorios de renovación solo en planes por tiempo
  (un pack no "renueva").
- Seed: planes "Clase de prueba" → `CLASS_PACK classCount:1`.
- i18n: etiquetas de status/tipo ajustadas.

## Scope

- In: enum/migración, cuota, vigencia, checkout/settlement, consolas y
  superficies que leen status/tipo, CRM trigger, seed, docs.
- Out: fee/take de cobranza a academias (change
  `academy-byo-collections`), ANNUAL en PlanType, backfill de motivo de
  inactividad (rechazado por el owner).

## Specs afectadas

- `academies/class-credits` — `classCount` cualquier tipo + ventana por
  ciclo; bookable solo ACTIVE.
- `academies/renewal` — gracia/recordatorios sobre el nuevo conjunto de
  estados; TRIAL deja de existir como estado.
- `checkout` — TRIAL ya no existe como tipo; `price ≤ 0` no vendible.
- `payments` — vigencia rodante en `membershipEndsAt`/settlement.
- `academies/students` (estados, filtros, badges, dashboard) — si la
  spec vive bajo otro path, ajustar en implementación.
- `crm/*` (triggers) — eliminación de `TRIAL_EXPIRING`.
