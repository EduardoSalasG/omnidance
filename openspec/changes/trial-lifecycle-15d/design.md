# design: trial-lifecycle-15d

## Context

Ver proposal.md. Hechos del código que condicionan el diseño:

- `Academy.trialEndsAt` se setea solo en `POST /academies` con
  `academy_billing.trial_days` (default 30). `Academy.tier` null
  resuelve a STUDIO_FEATURES en `featuresForTier` y nadie consulta
  `trialEndsAt` para gatear: el trial vencido no tiene consecuencia.
- `Person.proTrialEndsAt` solo se escribió por backfill de migración;
  `producerEffectiveTier` ya corta solo (FREE + trial vencido → null).
- `applyEntitlement` proyecta tier al activar/renovar; nada limpia
  `Academy.tier` al cancelar (gap existente de churn, fuera de scope).
- Mailer transaccional: puerto `MAILER` (`send(to, subject, html)`)
  implementado por `resend-mailer`, ya inyectado en controllers.
- `PlatformPromo` ya soporta `percentOff`, `maxCycles`, whitelist
  `academies`/`producers` y ventana `validFrom`/`validUntil`; el
  `chargeSpec` la resuelve sola al suscribir.
- Job diario `subscriptions.reconcile` (ScheduledJob, default 09:00)
  agrupa barridos y lleva contadores a `JobRun.meta`.

## Goals / Non-Goals

**Goals:** trial 15d en ambos actores con ciclo de vida completo
(bienvenida, último día + promo, corte al vencer, panel admin, card
CX). Todo sin cambiar el motor de suscripciones existente.

**Non-Goals:** enforcement retroactivo de academias churned con tier
persistente; organigrama/roles de equipo reales; A/B testing del
descuento; trial de niveles distintos a STUDIO/PRO_STARTER.

## Decisions

**1. Corte por resolución de features, no por flag de bloqueo.** Se
mantiene `Academy.tier` como proyección de suscripción y se agrega la
noción de "trial vigente": `tier == null && trialEndsAt > now` →
STUDIO_FEATURES; `tier == null && trialEndsAt <= now` → []. Alternativa
descartada: reusar `billingBlockedAt` (su semántica es mora, el copy y
el desbloqueo por settle difieren). La regla vive en un helper de
`academy-tiers.ts` (`academyInTrial(academy)` +
`featuresForAcademy(academy)`) que consume `assertAcademyFeature`;
clientes que solo tienen `tier` mantienen `featuresForTier`. La vista
`GET /academies/mine` ya entrega `trialEndsAt`: el front deriva el
mismo criterio sin nuevo contrato.

**2. Delisting dancer con predicado explícito.** Helper
`academyTrialExpired({tier, trialEndsAt})` aplicado donde hoy se
excluyen academias bloqueadas: explore/directorio/clases (misma
condición que `billingBlockedAt`), y rechazo en booking y checkout
con el copy existente "la academia no está disponible". Reusa las
políticas anti-enumeración vigentes.

**3. Trial de productor en la aprobación de rol.** Se setea
`proTrialEndsAt` al aprobar `PersonRole(PRODUCER)` en los dos caminos
existentes (`approveQueueItem` y el grant directo), solo si no hay
sub Pro viva ni trial vigente. Alternativa descartada: setearlo en
`ProducerParams` upsert (ocurre después, deja ventana sin trial).

**4. Promo de conversión diaria, no por actor.** El barrido crea (o
reusa) la `PlatformPromo` del día `trial-conv-<YYYYMMDD>` con
`percentOff: 50`, `maxCycles: 1`, `validUntil` = fin del día en
America/Santiago, y conecta al actor a su whitelist. Una promo por
día evita que la ventana de un actor pise la de otro y deja la
campaña auditable en `/admin/platform-promos`.

**5. Correos con el puerto MAILER y dedup en columna.** Bienvenida y
último día via `MAILER.send`; dedup del último día en
`Academy.trialEndNotifiedAt` / `Person.proTrialEndNotifiedAt`
(columnas nuevas, patrón `reminderSentFor`). El barrido se cuelga del
handler `subscriptions.reconcile` existente (mismo job, métrica en
`JobRun.meta`), no un ScheduledJob nuevo.

**6. Panel admin: KPIs en `/home/stats` + lista dedicada.** Los tres
KPIs se agregan a la lente ADMIN de `/home/stats` (patrón `leadsNew`);
la lista sale de `GET /admin/trials` nuevo en
`user-intel.controller` (misma superficie que ya reporta
`suscripcion`). La card sigue el patrón "Leads por revisar".

**7. Corte de churn: limpieza de entitlement, no flag nuevo.** Cuando
la remota queda CANCELED de verdad (post-período, sin swap ni
reprice), `reconcileSubscription` limpia la proyección
(`Academy.tier`/`billingCycle` → null, `Person.proTier` → FREE) solo
si no hay otra sub viva del actor. Con eso la misma regla de
features (null + trial vencido → vacío) cubre trial-expirado y
churned. Se emite `academy.access_ended`/`producer.pro_access_ended`
como Notification (aviso al actor + timestamp para la línea de vida).
Las subs ya CANCELED al deploy no vuelven a transicionar: se cubre
con un backfill one-shot en la misma migración/corrida que limpia
entitlements donde no queda sub viva. Alternativa descartada: fijar
`billingGraceUntil` para reusar el bloqueo por mora (copy de mora
incorrecto para churn y postura más dura que lo pedido).

**8. Línea de vida persistida: `ActivityEvent` append-only.** Tabla
nueva `(personId?, academyId?, type, refType?, refId?, data Json?,
createdAt)` con índices por actor y tipo. Las transiciones que este
change toca emiten vía un helper `emitActivity` (mismo patrón que
`emitPaymentEvent`, tx-safe): trial.started/ending/ended,
access.ended, sub.started/renewed/canceled/plan_changed,
role.approved, person.registered, billing.blocked,
enrollment.started, payment.paid. Frontera con `PaymentEvent`: el
ledger sigue siendo la auditoría de pagos (hash-chain);
`ActivityEvent` es el ciclo de vida del actor — se emiten ambos sin
que uno dependa del otro. La historia pre-deploy se siembra con un
script de backfill que corre la misma derivación descartada como
única fuente (timestamps + ledger) e inserta con dedup por
(refType,refId,type). `GET /admin/users/:id/timeline` lee la tabla:
una query, sin agregación. Alternativa descartada: derivar en
lectura (los eventos sin timestamp persistido no son recuperables a
futuro).

**9. Ajuste de trial como palanca admin.** `PATCH
/admin/academies/:id/trial {trialEndsAt}` y `PATCH
/admin/users/:id/pro-trial {proTrialEndsAt}` en
`user-intel.controller` (donde ya vive la ficha de suscripción).
Sin guardarraíles de rango: extender reabre y acortar corta, ambos
auditados en `AuditLog` + `ActivityEvent trial.adjusted`. La misma
resolución en caliente de features hace el resto; no hay sweep
adicional.

**10. Contacto CX y welcome por params.** `cx.contact.name|email|phone`
y `cx.notify_email` como `PlatformParam` (seed con datos de Eduardo);
sin tabla de equipo. La card en `/perfil` los lee vía params públicos
existentes o un campo en el payload de perfil; decisión menor en
implementación siguiendo el patrón vigente de params públicos.

## Risks / Trade-offs

- [Academias con trial vencido hoy se cortan al desplegar] → es el
  comportamiento pedido (BREAKING documentado); comunicar antes del
  deploy y revisar el seed/demo para que las academias demo no queden
  cortadas en QA.
- [Trial vencido conserva cobranza por endpoints no gated] → aceptado:
  billing/suscripción quedan abiertos porque son la salida; la UI no
  los enlaza fuera de Suscripción.
- [Correo 09:00 vs "vence hoy"] → el barrido avisa en la ventana de
  24h previa al vencimiento; academias creadas justo después del
  barrido reciben el correo del día siguiente (cubre la ventana).
- [Whitelist promo por día genera filas] → una promo diaria chica es
  auditable y preferible a mutar vigencias compartidas.

## Migration Plan

1. `pnpm db:migrate` con `ActivityEvent` y las dos columnas de dedup.
2. Seed: `academy_billing.trial_days` → 15, `producer_pro.trial_days`
   → 15, `cx.contact.*`, `cx.notify_email`.
3. Deploy API + web. Academias con trial vencido pasan al corte en el
   primer request (resolución en caliente, sin barrido de datos).
4. Backfill de churn: corrida one-shot (script o primera pasada del
   reconcile) que limpia `Academy.tier`/`Person.proTier` donde el
   actor no tiene suscripción viva; actores afectados quedan en la
   postura sin-acceso de inmediato.
5. Backfill de `ActivityEvent`: script one-shot que siembra la
   historia derivada con dedup por (refType,refId,type); idempotente
   y re-corrido si falla a mitad.
6. Rollback: revertir código; las columnas, params y la tabla quedan
   inertes. El backfill de entitlements es de una vía (los tiers
   limpiados no se reconstruyen): ejecutar solo con la lista de
   afectados revisada antes.
