# Design: legacy-subs-byo-migration

## D1. Mecánica: cancel + re-suscripción, nunca portabilidad

Una suscripción de tarjeta no se puede mover entre cuentas/proveedores:
la autorización vive en la cuenta Flow de plataforma y el alta en la
pasarela de la academia exige consentimiento nuevo del tarjetahabiente
(registerUrl Flow / init_point MP). Por eso la migración replica la
semántica de `cancel(personId, id)` existente
(`subscriptions.service.ts` ~L1804): cancel remoto `at_period_end` +
`CANCEL_PENDING` local. El alumno conserva el acceso hasta el fin del
período pagado y luego se re-suscribe por la vía vigente (BYO si la
academia configuró pasarela, TRANSFER si no).

Decisión alternativa descartada: convertir legacy a TRANSFER sin
avisar. Cambia el medio de pago del alumno sin consentimiento y rompe
la automatización que es el punto del feature.

## D2. Selector del barrido

```ts
prisma.membershipSubscription.findMany({
  where: {
    status: { in: ["ACTIVE", "FAILED_CARD"] },
    paymentMethod: "CARD",
    gatewayAccountId: null,
    flowSubscriptionId: { not: null },
    ...(academyId ? { academyId } : {}),
  },
});
```

FAILED_CARD entra al barrido: tiene remota viva en nuestra cuenta y su
fin de período también lo respeta `at_period_end`. PENDING_CARD /
ACTIVATING quedan fuera: PENDING_CARD no llegó a Flow (cancel local de
cajón si se quiere, pero no es parte del barrido legacy) y ACTIVATING
es transitoria de segundos.

## D3. Provider: siempre plataforma para legacy

`gatewayAccountId` null ⇒ `providerFor(sub)` resuelve el provider por
moneda (`payments.subscription_gateway` → FLOW en CLP), que es donde
vive la remota. Se reusa `providerFor` tal cual: no hay lookup
especial. Una sub legacy con currency no-CLP resuelve por moneda igual
que el resto del sistema.

## D4. Endpoint admin, no job ni UI

`POST /admin/subscriptions/migrate-legacy` guard Admin (mismo patrón
de guards que los endpoints admin vecinos), body
`{ academyId?, dryRun? }` con `dryRun` default true: el default seguro
obliga a pedir la ejecución explícita. No hay botón de consola ni cron:
es una operación one-shot por academia/global que corre el ops con
Postman/curl; la respuesta detallada por ítem es el reporte.

## D5. Idempotencia y errores

- Selector excluye CANCEL_PENDING/CANCELED ⇒ re-correr solo reintenta
  las que fallaron.
- Cancel remoto falla ⇒ log + ítem en `failed`, la local no se toca,
  el lote sigue.
- `emitPaymentEvent` con actor `system` y payload
  `{ reason: "legacy_byo_migration", subscriptionId, flowSubscriptionId, planId }`
  sobre el último payment `mem_<planId>_*` (misma heurística de
  `cancel`), si existe.
- Contadores: `scanned` (candidatas), `migrated` (canceladas OK),
  `failed` (con error por ítem).

## D6. Notificaciones

- Alumno: `membership.subscription_migration`, TRANSACTIONAL, una por
  sub, con `nextInvoiceAt`/fin de período y CTA (data.academyId,
  data.planId para deep link al plan).
- Owner de academia: `academy.legacy_subs_migrated`, una por academia
  por corrida, con `count`; el copy ramifica si
  `ActorGatewayAccount ACTIVE` existe o no (el query se hace una vez
  por academia, no por sub).
- Sin templates de mail nuevos: misma plomería `notifySafe` que el
  resto de notificaciones de suscripciones.

## D7. Seed dev espejo del mundo post-BYO

`seed-dev.ts` (solo `SEED_ENV=dev`) después de crear academias:

```ts
const token = process.env.MP_SMOKE_ACCESS_TOKEN;
if (token) {
  const mask = maskSecret(token);
  const active = await prisma.actorGatewayAccount.findFirst({
    where: { academyId: tumbao.id, provider: "MERCADOPAGO", status: "ACTIVE" },
  });
  if (!active) {
    await prisma.actorGatewayAccount.create({ ...credentialsEnc: encryptSecret(JSON.stringify({ accessToken: token })), keyMask: mask });
  } else if (active.keyMask !== mask) {
    // cred rotada: apagar la vieja y crear con el token vigente
    update DISABLED + create
  }
}
```

- Importa `encryptSecret`/`maskSecret` de `../src/common/secrets`
  (tsx lo resuelve; seed corre dentro de apps/api).
- Sin token en env ⇒ no siembra nada (silencioso, dev offline sigue
  funcionando con STUB/manual).
- keyMask distinto ⇒ la cuenta vieja queda DISABLED (misma semántica
  que `upsert` del service: una ACTIVE por actor).
- Academia elegida: Academia Tumbao (la que ya usa
  `smoke-mp-subscription.cjs`); Muvet conserva su STUB para dev sin
  red.

## D8. Fuera de scope

- Migración proactiva al configurar BYO (hook en
  `upsertAccount`): deliberadamente manual; el owner prefiere decidir
  cuándo cortar cada academia.
- Subs `PlatformSubscription` (SaaS academia + Producer Pro + pase):
  siguen en Flow de plataforma, son "cosas de la plataforma".
- UI de re-suscripción: el flujo ya existe (plan → checkout); solo se
  agrega el tipo de notificación.
