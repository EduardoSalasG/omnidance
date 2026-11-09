# Handoff: suite api roja en CI - mocks de specs al día con platform-trials

Sesión 2026-11-09 (noche, continuación). El workflow **QA de dev está
rojo** desde el force-push: la suite completa nunca se corrió tras el
change `trial-lifecycle-15d` (la sesión anterior solo corrió specs
puntuales). **No son bugs de producto**: los fakes de prisma de los
specs quedaron atrás de dos cambios del change.

## Diagnóstico (suite local `npx vitest run` en apps/api)

84 tests fallaban en 13 archivos. Dos causas raíz:

**Causa A - `tx.activityEvent` ausente en el fake de prisma**
(`TypeError: activityEvent.findFirst/create is not a function` o
`Cannot read properties of undefined (reading 'create')`).
`emitActivityOnce`/`emitActivity` corren dentro de la tx de negocio
(emisiones sub.started/renewed/canceled, enrollment.started,
payment.paid, person.registered). Fix por spec:

```ts
activityEvent: {
  findFirst: vi.fn(async ({ where }: { where: Row }) =>
    activities.find((a) => matchWhere(a, where)) ?? null),
  create: vi.fn(async ({ data }: { data: Row }) => {
    const stored = JSON.parse(JSON.stringify(data)) as Row;
    activities.push(stored);
    return stored;
  }),
},
```

**Causa B - academias fixture con `tier: null` + `trialEndsAt` null**
ahora resuelven features vacías (`academyTrialExpired` corta igual que
mora): el gate devuelve 403 `tier.required`/`academy.unavailable`
donde el spec esperaba otro error o un 201/BOOKED. Fix: dar al fixture
`tier: "STUDIO"` (academia pagada) o `trialEndsAt: <futuro>` (en
trial) según la intención del test.

## Ya corregido y pusheado

- `37729961` test(payments): mocks de specs al dia con ActivityEvent y
  gate de trial vencido.
  - `platform-subscriptions.service.spec.ts`: `findFirst` dedup
    agregado al mock activityEvent existente. 101/101 verde.
  - `subscriptions.service.spec.ts`: mock activityEvent completo +
    export `activities`. 75/75 verde.
  - `checkout.service.spec.ts`: mock activityEvent + `tier: "STUDIO"`
    en los dos `mkPlan`. 132/132 verde.

## Pendiente por archivo (conteo local)

- `payment-settlement.service.spec.ts` (24): falta activityEvent en
  fake (paymentEvent: ~línea 98 es el ancla para insertarlo).
- `classes.controller.spec.ts` (22): fixtures de academia sin tier →
  AcademyUnavailableError donde se esperaba Forbidden/BOOKED. Dar
  `tier:"STUDIO"` o `trialEndsAt` futuro al academy del spec.
- `private-lessons.controller.spec.ts` (22): mismo patrón B (403
  tier.required donde se esperaba 404/409/400).
- `academy-import.e2e.spec.ts` (2): 403 vs 201 - la academia e2e
  necesita `trialEndsAt` futuro o tier en el fixture de siembra.
- `academy-import.service.spec.ts` (3): falta activityEvent (error
  'create' en importStudents por emit enrollment.started).
- `platform-charges.service.spec.ts` (3): falta activityEvent (ancla
  paymentEvent: ~línea 132).
- `academy-sales.service.spec.ts` (3): causa B - ForbiddenException en
  vez de errores de dominio; academy del spec necesita tier.
- `survey-analytics.e2e.spec.ts` (2): `Cannot read properties of
  undefined (reading 'notification')` - revisar qué mock falta (posible
  tx sin notification o emitActivity sobre cliente sin modelo).
- `producer.controller.spec.ts` (1), `leads.controller.spec.ts` (1),
  `academy-staff.controller.spec.ts` (1): falta activityEvent.
- `academy-tier-gate.spec.ts` (1): caso `tier:null` (línea ~129) debe
  llevar `trialEndsAt` futuro para seguir resolviendo STUDIO.
- `subscriptions.scheduler.spec.ts` (1): mock de `trialLifecycle` sin
  `sweepTrialEnded` - agregar `sweepTrialEnded: vi.fn(async () => ({}))`
  con la forma de retorno que el handler agrega a `meta` (ver
  `trial-lifecycle.service.ts` y el assert del spec).

## Estado al cierre (2026-11-09 noche)

- Deploy prod run 42670685409: **SUCCESS** (7m33s) - el push a `main`
  del force-push desplegó sin problemas.
- Commits de fix ya en dev: `37729961` (3 specs) + `6ae37e1c`
  (settlement + scheduler). Verificados local: platform-subscriptions
  101/101, subscriptions 75/75, checkout 132/132, payment-settlement
  31/31, subscriptions.scheduler 3/3.
- Quedan ~60 tests fallando en ~11 specs (lista abajo por archivo);
  mismas dos causas, mismos fixes mecánicos.

## Resolución (2026-11-09 tarde, sesión siguiente)

- **Los "workflow file issue" eran errores internos de GitHub**, no del
  YAML: la annotation del run dice `Internal server error. Correlation
  ID: ...` y los runs nunca agendaron jobs (0 check-runs). Post
  incidente de Actions del 8-nov. Tras rerun, `commit-guard` y `QA`
  agendaron y pasaron.
- **`e2d9c2c4` test(api): suite verde** - los 11 specs restantes:
  activityEvent en platform-charges/academy-import/producer/leads/
  academy-staff; `tier:"STUDIO"` o `trialEndsAt` vigente en classes/
  private-lessons/academy-sales/academy-tier-gate/import e2e;
  leads demo devuelve `roles` del include (emit role.approved);
  survey-analytics e2e importa `ParamsModule` (nueva dep de
  PeopleController). Suite local 2531/2531, typecheck limpio.
- QA run 42674351021 en dev: **SUCCESS** tras rerun. commit-guard
  42674351263: **SUCCESS**.
- **Divergencia dev/main detectada**: `main` = `1a03506b`
  (release 1.15.6), 31 commits atrás de dev y 13 commits propios -
  no es "contenido idéntico" como decía el handoff anterior; el trial
  lifecycle todavía NO está en prod. Próxima promoción dev→main lleva
  todo junto; el deploy corre `pnpm --filter @omnidance/api test`
  antes de build (red de seguridad: con la suite roja habría fallado
  ahí, no en prod).

## Otros pendientes de producto

- `academy-invites` (change OpenSpec completo sin empezar) y
  `multipais-foundation` - eran el siguiente slice del backlog.
- Propuesta de gates pre-push/promoción pendiente de decisión del
  usuario (análisis en conversación): pre-push hook con suite de API,
  `pnpm verify`, protección de `main`.
