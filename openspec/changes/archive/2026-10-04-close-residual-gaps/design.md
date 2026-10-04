# Design — close-residual-gaps

## Context

`SubscriptionsService.createFlowSubscription` ya compensa el update-fail
(`transition.count === 0` → cancel inmediata), pero si el **proceso muere**
entre el `subscription/create` exitoso y el `updateMany` que persiste
`flowSubscriptionId`, el id remoto solo sobrevive en `GatewayTransaction`
(`responseBody.subscriptionId` del OUTBOUND auditado) y la fila local queda
`ACTIVATING` sin vínculo → huérfana cobrando para siempre.

El gate de capability hoy es `gateway.name === "FLOW"` en `flow()`,
`getForOwner`, `reconcileAll` y `reconcileSubscription` escribe
`Payment.gateway = "FLOW"` a fuego — el stub no puede entrar al flujo.

`leads.e2e` hace `findFirstOrThrow(roles ADMIN APPROVED)` sin `orderBy`: bajo
`vitest` paralelo puede tomar `RCD Admin`/`GE Admin`/`CRM Admin`/`GP Admin`
(fixtures de otros specs, borradas en sus `afterAll`) → `findById` null en
SessionGuard → 401 en los ~9 tests autenticados como admin.

Seed: `plan()` usa `ensure()` que hace update de `price/type/description` en
reseed — un cambio de precio es una línea idempotente.

## Goals / Non-Goals

**Goals:**
- Cerrar la ventana de huérfana: persistencia temprana del id + barrido
  correctivo con evidencia en `GatewayTransaction`.
- Stub ejerce el flujo completo de suscripciones en localhost (needs_card →
  return → ACTIVE → settle → cancel).
- `leads.e2e` autocontenido (sin personas ajenas).
- Precio compromiso ~10% en planes largos de Mambo Madness.

**Non-Goals:**
- No se cambia el modelo de datos (ninguna migración — el sweep usa tablas
  existentes).
- No se habilita producción Flow (sigue el gate sandbox-only de
  `resolveGateway`).
- No se agrega aislamiento por schema/DB a los e2e (el fix es eliminar la
  dependencia compartida, no serializar la suite).
- El stub no persiste estado entre reinicios ni simula webhooks/mora/retries.

## Decisions

### 1. Orphan sweep sobre auditoría, no sobre la API de Flow

Flow no expone "list subscriptions by customer" usable para descubrir
huérfanas sin conocer el id. La fuente de verdad disponible es nuestra propia
auditoría: todo `subscription/create` pasa por `call()` → `GatewayTransaction`
con `responseBody.subscriptionId`. El sweep escanea esas filas
(`endpoint="subscription/create"`, `direction="OUTBOUND"`, `ok=true`,
acotado por `createdAt` reciente) y compara contra
`MembershipSubscription.flowSubscriptionId`:

- sin fila local que lo referencie → `subscription/get`; si remota no está
  cancelada → `cancelSubscription(immediate)` + warn.
- fila local existe en `ACTIVATING` más vieja que `PENDING_CARD_TTL_MS` →
  mismo tratamiento + `CANCELED` local (condicional por status).
- fila local `CANCELED` con `flowSubscriptionId` (nuevo caso posible por la
  persistencia temprana) → `subscription/get` y cancel inmediata si la remota
  sigue activa.
- `ACTIVE`/`CANCEL_PENDING` → skip (las cubre `reconcileSubscription`).

El sweep corre dentro de `reconcileAll` (mismo cron T7 + webhook trigger), no
un job nuevo. Es idempotente: una huérfana ya cancelada en Flow responde
status 4 → skip.

Alternativa considerada: confiar solo en la persistencia temprana. Rechazada —
reduce la ventana pero no la cierra (crash durante el round-trip HTTP sigue
perdiendo el id); el sweep cubre exactamente ese residuo.

### 2. Persistencia temprana = escritura incondicional del id

Justo tras `createSubscription`: `update` (no updateMany condicional) del
`flowSubscriptionId` sobre la fila — aunque la fila ya no esté `ACTIVATING`,
persistir el id es lo que permite al sweep rastrearla. La transición de estado
se mantiene condicional como hoy (`updateMany` por status) y el `count===0`
sigue gatillando la compensación inmediata existente.

### 3. Stub subscriptions por capability check

`flow()` se renombra conceptualmente a "provider": lanza si el gateway no
implementa `SubscriptionProvider` (check por presencia de métodos, no por
`name`). Los gates `name === "FLOW"` de `reconcileAll`/`getForOwner` pasan al
mismo check. `Payment.gateway` usa `this.gateway.name`.

Estado en memoria del stub (Map por id): planes, customers
(`creditCardType?`), register tokens (`token → customerId`), subscriptions
(`status`, `next_invoice_date`, `invoices[]`, `cancel_at_period_end`).
`registerCustomerCard` devuelve `${returnUrl}?token=<stub-token>` — el browser
cae directo al callback real del API sin salir de localhost. `createSubscription`
genera invoice inicial ya pagada (`status:1`, `payment.status:2`,
`paymentData` con `media:"STUB"`) para que `reconcileSubscription` liquide el
primer período como hace Flow. `getSubscription` de id desconocido devuelve
`status:4` (converge a `CANCELED` tras restart — ver spec).

Alternativa considerada: stub con estado en DB (tabla fake). Rechazada —
meter tablas de simulación en el schema real es overhead; el stub es dev-only
y la convergencia a CANCELED tras restart es aceptable (documentada).

### 4. leads.e2e autocontenido

Mismo patrón `mkPerson(name, "ADMIN")` del resto de specs: crear el admin en
`beforeAll`, pushear a `personIds` (cleanup ya existente), y usar su id en el
test de notificación (determinista: la notif llega a todos los ADMIN, el
propio siempre existe). `dancerSession` ya es propio. El lookup
`admin@omnidance.dev` del test accountExists se mantiene (read-only, nadie
borra personas del seed).

### 5. Pricing ~10% compromiso

Trimestral 180.000→162.000 (−10%), Semestral 360.000→324.000 (−10% sobre
6×60.000). Copy: "Ahorras $18.000 vs. el mensual" / "Ahorras $36.000 vs. el
mensual — el mejor valor por mes". `ensure()` propaga el cambio en reseed; los
planes sin espejo Flow en seed no requieren sync.

## Risks / Trade-offs

- Sweep depende de que la auditoría escriba antes de que el proceso muera → la
  escritura del `GatewayTransaction` ocurre en el `finally` de `call()`, antes
  de retornar al service — cubre el crash. Si la auditoría misma falla (es
  best-effort), la huérfana queda invisible: limitación aceptada, queda
  loggeada.
- Stub con estado en memoria: tras restart las subs stub quedan "perdidas" →
  `getSubscription` reporta cancelada y la local converge a CANCELED en el
  próximo reconcile. Documentado, no errores.
- `Payment.gateway = "STUB"` en renovaciones stub: filas dev honestas; ninguna
  consulta filtra por `"FLOW"` hoy (verificar en implementación).
- Discount del seed pisa `price` de planes existentes en reseed — intencional
  (idempotencia), pero si el usuario editó esos planes por la consola el reseed
  los restaura: comportamiento preexistente de `ensure()`, no nuevo.

## Open Questions

- ¿Vale la pena un endpoint/admin-surface para gatillar el orphan sweep a
  demanda? Por ahora va dentro de `reconcileAll` (cron + webhook); se puede
  exponer después si el smoke sandbox lo necesita.
