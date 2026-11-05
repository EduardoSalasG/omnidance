# Design: academy-tier-gate-staff

## Problema

`AcademyTierGate` usa `useActorEntitlements("ACADEMY", academy.id)`.
Ese hook lee `/me/entitlements`, que devuelve `academies` filtradas por
`ownerId = personId`. Para staff/instructor la lista viene vacía →
`has(feature)` = false → `TierPaywall` permanente aunque el tier de la
academia cubra la feature y el API los autorice.

## Decisión

El gate pasa a derivar la feature de `academy.tier` vía
`academyTierHas` (`apps/web/src/lib/academy-features.ts`, espejo front
de `academy-tiers.ts` del API). Es la fuente correcta para las tres
lentes porque `/academies/mine` incluye `tier` en las academias donde
la persona es owner, staff o instructor.

Alternativas descartadas:
- Extender `/me/entitlements` a academias donde la persona es
  staff/instructor: más correcto semánticamente pero cambia contrato y
  reabre la spec unified-actor-entitlements; no necesario para el fix.
- Mantener entitlements como fuente primaria y `academy.tier` como
  fallback: dos fuentes para lo mismo; `academyTierHas` ya cubre todos
  los casos (null/desconocido → STUDIO, igual que el API).

## Comportamiento resultante

| Lente | academy.tier=STUDIO | academy.tier=COBROS |
|---|---|---|
| owner | contenido | paywall |
| staff/instructor | contenido | paywall* |

\* staff/instructor de COBROS ve paywall en vez de contenido; el API
igual devolvería 403, así que no hay fuga funcional — solo cambia el
estado visual de "error de red/403" a paywall, coherente con el resto
de superficies.

## Tests

- Component test de `AcademyTierGate`: staff (sin academies en
  entitlements) con `academy.tier=STUDIO` → renderiza children;
  `academy.tier=COBROS` → renderiza `TierPaywall`.
