# Design: notification-deeplink-coverage

Inventario completo de emisores (barrido notify/notifySafe en
apps/api/src): ~77 tipos distintos, único camino de emisión
`NotificationsService` → `prisma.notification.create`.

## Decisiones

1. **Mapa en front por familia de tipo** cuando el destino es
   función del tipo + ids presentes en `data` (los ids ya viajan).
   **`data.path` del emisor** cuando el mismo `type` va a audiencias
   distintas con consolas distintas (`payment_claim_*` →
   owner/productor/admin; `sale_deal.responded` → productor con
   eventId del alcance). El emisor conoce la rama; el front no.
2. **`category` como discriminador** cuando la audiencia se
   distingue sin tocar el API (`private_lesson.assigned` OPERATIONAL
   = instructor, TRANSACTIONAL = alumno; `crm.segment.*` OPERATIONAL
   = owner).
3. **`data.path ?? data.url` en el fallback de nav y
   `data.url ?? data.path` en el SW**: un solo campo resuelto por el
   emisor sirve a los dos canales; convergen sin duplicar emisión.
4. **`payment.paid` por presencia de campos** (`classId`/`lessonId`/
   `orderType`): el tipo no cambia, el payload ya discrimina. No se
   introduce `path` por rama acá porque el front distingue solo.
5. Destinos elegidos = consola/ficha operativa existente verificada
   contra el app dir; tipos sin superficie natural quedan en el
   centro (decisión explícita, no omisión).

## Mapa agregado (type → destino)

- `payment.paid`: classId→`/clases/:id` · lessonId→
  `/clases?scope=reservadas` · orderType→`/perfil/pagos` · resto→
  `/eventos?view=mios`
- `academy.private_lesson.sold|cancelled_paid` →
  `/academia/particulares`; `assigned`: OPERATIONAL→particulares,
  resto→reservadas; `private_lesson.commission_paid`→particulares
- `membership.subscription_started|canceled|migration|
  renewal_reminder|renewal_failed` → `/perfil/pagos`;
  `membership.transfer_renewal` → `/academias/:academyId` (fallback
  `/perfil/pagos`)
- `payment.series_pass`→`/clases`; `payment.membership`→
  `/perfil/pagos`; `payment.membership.received`→`/academia/cobros`
- `academy.subscription_started|changed|change_scheduled|canceled|
  transfer_renewal|billing_grace|billing_reminder|billing_settled|
  billing_blocked` → `/academia/configuracion/suscripcion`;
  `academy.legacy_subs_migrated` →
  `/academia/configuracion/metodos-de-pago`
- `producer.pro_settled|pro_started|pro_changed|
  pro_change_scheduled|pro_canceled|pro_transfer_renewal|
  pro_renewal_failed|pro_renewal_reminder|pro_upgrade_required` →
  `/productor/suscripcion`
- `academy.collections_statement` → `/academia/cobros/liquidaciones/
  :period` (fallback `/academia/cobros`); `collections_blocked` →
  `/academia/cobros`
- `academy.plan_expiring|plan_grace` → `/academias/:academyId`
- `academy.sale_deal.invited` → `/academia/preventas/:agreementId`
- `table.confirmed|cancelled` → `/eventos/:eventId`
- `crm.digest` → `/crm`; `crm.segment.enter|exit` OPERATIONAL →
  `/crm/segmentos/:segmentId`; `crm.winback|attendance_drop` con
  actorType ACADEMY → `/academias/:actorId`
- `user.registered` → `/admin/usuarios/:personId`;
  `payment.confirmed|amount_mismatch` →
  `/admin/facturacion/transacciones`
- `class.instructor_assigned` → `/academia/series/:seriesId`
- Case muerto eliminado: `academy.private_lesson.purchased` (el
  emisor real es `.sold`); `session.invite|declined` se conservan
  (costo cero, notificaciones históricas)

## Emisores con `path` por rama

- `academy-claims.service`: `payment_claim_new` (3 sitios, owner) →
  `/academia/cobros/claim/:claimId`; `payment_claim_approved|
  rejected` (alumno) → `/academias/:academyId`
- `producer-claims.service`: `payment_claim_new` → PLATFORM
  `/admin/facturacion/comprobantes/:claimId`, productor
  `/productor/comprobantes/claim/:claimId`;
  `payment_claim_approved|rejected` (comprador) → `/perfil/pagos`
- `academy-sales.service`: `sale_deal.responded` →
  `/productor/eventos/:eventId/academias/:agreementId` cuando el
  acuerdo es de evento (series-scope no tiene ficha: centro)

## Riesgos

- Un destino a una consola gated (`/academia/*`, `/admin/*`,
  `/productor/*`) sobre una persona sin el rol cae en el gate de la
  consola, no en crash - aceptable porque el tipo solo se emite a la
  audiencia correcta (verificado por emisor).
- `data.path` es path interno validado por `safeInternalPath` en el
  front; el SW lo usa crudo pero el emisor lo construye de constantes
  + ids (sin input de usuario).

## Verificación

- `notification-nav.test.ts` nuevo: cubre el mapa completo por
  familia, la discriminación `payment.paid`, la discriminación por
  `category` y el fallback path→url.
- Specs existentes de claims/sales con assert de `data.path`.
- Typecheck + eslint web/api; smoke del SW no aplica (estático).
