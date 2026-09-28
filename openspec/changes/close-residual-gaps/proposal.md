# close-residual-gaps

## Why

El handoff 2026-09-25 dejó cuatro gaps residuales conocidos tras el checkout de
membresía: (1) un crash entre `subscription/create` de Flow y la persistencia
local deja una suscripción remota cobrando sin reflejo local (huérfana
permanente — `reconcileAll` solo escanea subs ya vinculadas); (2) el StubGateway
no implementa `SubscriptionProvider`, así que todo el flujo de suscripciones es
intestable en dev sin credenciales Flow; (3) `leads.e2e` flakea en la suite
paralela (9 tests 401) porque pesca cualquier `Person` ADMIN APPROVED — puede
tomar la fixture de otro spec que luego la borra; (4) los planes
trimestral/semestral de Mambo Madness son lineales (3×/6×) sin incentivo de
compromiso, a diferencia de los planes curados de MuéveteOnTour.

## What Changes

- **Suscripciones huérfanas**: persistir `flowSubscriptionId` en una escritura
  propia inmediatamente después de `subscription/create` (reduce la ventana al
  round-trip HTTP), y extender `reconcileAll` con un sweep que contrasta las
  `subscription/create` exitosas auditadas en `GatewayTransaction` contra las
  subs locales — remota activa sin cobertura local viva → cancel inmediata de
  compensación + evidencia.
- **Stub suscripciones**: `StubGateway` implementa `SubscriptionProvider` con
  estado en memoria (planes, customers, tarjeta, subs, invoices). El
  `registerUrl` apunta al callback real de `customer-return` con token stub —
  el flujo completo (needs_card → retorno → ACTIVE → settle del primer invoice)
  funciona en localhost sin salir a Flow. Los guards del service pasan de
  `gateway.name === "FLOW"` a check de capability (`SubscriptionProvider`);
  `Payment.gateway` deja de estar hardcodeado a `"FLOW"`.
- **Flake e2e**: `leads.e2e` crea su propia persona ADMIN (patrón `mkPerson`
  autocontenido del resto de specs) en vez de `findFirstOrThrow` sin `orderBy`
  sobre cualquier ADMIN — elimina la dependencia de fixtures ajenas que otros
  specs borran en su `afterAll`.
- **Precios planes largos**: Mambo Madness trimestral $180.000→$162.000 y
  semestral $360.000→$324.000 (~10% off vs. mensual ilimitado), copy del seed
  actualizado. Idempotente vía `ensure()` (reseed actualiza price/description).

## Capabilities

### New Capabilities

- `payments/subscription-integrity`: el sistema detecta y compensa
  suscripciones creadas en la pasarela sin vínculo local (crash window), y
  persiste el id remoto a la primera oportunidad.
- `payments/stub-subscriptions`: el gateway de desarrollo simula el motor de
  suscripciones completo (registro de tarjeta, alta, invoices, cancelación)
  para ejercer el flujo sin credenciales Flow.

### Modified Capabilities

_(sin specs preexistentes en `openspec/specs/` — los cambios de `leads.e2e` y
del seed son de infraestructura/datos, sin comportamiento de producto nuevo que
especificar; se cubren en tasks.md)_

## Impact

- `apps/api/src/payments/application/subscriptions.service.ts`: persistencia
  temprana de `flowSubscriptionId`, sweep de huérfanas en `reconcileAll`,
  guards por capability en vez de `name`.
- `apps/api/src/payments/infrastructure/stub.gateway.ts`: implementa
  `SubscriptionProvider` (estado en memoria, ids `stub_*`).
- `apps/api/src/payments/domain/ports.ts`: doc del puerto (ya no "solo Flow").
- `apps/api/test/leads.e2e.spec.ts`: fixture ADMIN propia; cero dependencia de
  personas ajenas.
- `apps/api/prisma/seed-dev.ts`: precios + copy de planes largos de Mambo
  Madness.
- Tests: specs unit/e2e nuevos para stub-subscriptions y el sweep de
  huérfanas; `pnpm test` completo para validar el flake.
- Docs: `docs/flows.md`/`docs/architecture.md` si el diagrama de suscripciones
  queda inexacto; openapi/postman solo si cambian contratos (no se espera).
