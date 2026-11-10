# Handoff: canal invite cerrado + cobertura de deep links

Sesión 2026-11-10 (noche, continuación de `invite-push-y-deeplinks`).
Se ejecutó el slice completo de 5 ítems aprobado por el owner en la
sesión anterior. Dos changes archivados, dos commits.

## Trabajo completado

### 1. `invite-device-push-bridge` (archivado, commit `2b9a4605`)

- **Push de dispositivo cierra el canal** (A): `sendInvite` push
  `academy.invite` ahora lleva `data.url = /i/<inviteId>` además de
  `academyId`/`inviteId`. Ruta bridge nueva
  `(app)/i/[inviteId]` (page server que resuelve params →
  `invite-bridge.tsx` client): POST consume `{channel:"device"}`
  best-effort → `setViewMode("academy")` → `replace` a
  `/academias/<academyId>` (del response, no del data de la
  notificación); 404/401 → `/notificaciones`. PageLoading mientras.
- **Consume devuelve academyId**: `POST /academies/invites/:id/consume`
  → `{consumed, academyId}` (también en el early-return idempotente).
  Body `{channel?: "push"|"device"}` (IsIn, default `push`).
- **Mark-read del toast** (B): el tap del cuerpo hace `POST
  /notifications/:id/read` fire-and-forget antes de navegar.
- **Atribución de canal** (D): `consumeAcademyInvites` gana `channel`
  en args → `invite.registered` lleva `data.channel`
  (`magic_link` verify / `push` tap in-app / `device` bridge). Sin
  schema; eventos viejos sin channel = mail.
- **E2E** (E): `e2e/flows/academia-invites.spec.ts` - owner invita al
  dancer por API, tap en el centro → assert URL ficha +
  `localStorage omnidance:view-mode = academy`. Verificado en vivo
  (8/8 con setup de auth).

### 2. `notification-deeplink-coverage` (archivado, commit `72d8f93a`)

Auditoría completa de emisores (~77 tipos, único camino
`NotificationsService` → `prisma.notification.create`):

- **`payment.paid` era polimórfico y mandaba mal**: discrimina por
  `data` - `classId`→`/clases/:id`, `lessonId`→reservadas,
  `orderType`→`/perfil/pagos`, resto→`/eventos?view=mios`.
- **`academy.private_lesson.cancelled_paid`/`sold`/`commission_paid`
  → `/academia/particulares`** (antes iban a la vista del ALUMNO);
  `assigned` discrimina por `category` (OPERATIONAL instructor →
  particulares, TRANSACTIONAL alumno → reservadas).
- **Familias mapeadas**: `membership.*` → `/perfil/pagos`
  (transfer_renewal → ficha academia); `academy.subscription_*` +
  `billing_*` → `/academia/configuracion/suscripcion`;
  `producer.pro_*` → `/productor/suscripcion`;
  `academy.collections_*` → cobros/liquidaciones;
  `legacy_subs_migrated` → métodos-de-pago; `plan_expiring|grace` →
  ficha academia; `sale_deal.invited` → `/academia/preventas/:id`;
  `table.*` → evento; `crm.digest` → `/crm`, `crm.segment.*`
  OPERATIONAL → ficha segmento, `crm.winback|attendance_drop`
  ACADEMY → ficha academia; `user.registered` →
  `/admin/usuarios/:id`; `payment.confirmed|amount_mismatch` →
  transacciones; `class.instructor_assigned` → serie.
- **Convención unificada path/url**: fallback del nav lee
  `data.path ?? data.url`; el SW hace el espejo
  `data.url ?? data.path`. Un solo campo resuelto por el emisor
  sirve a tap in-app y click de push - los 8 emisores con `path`
  ya ganan deep link en dispositivo, y `class.reminder`/
  `ticket.day_of` ganan tap in-app sin tocar el API.
- **`path` por rama en emisores multi-audiencia**:
  `payment_claim_new` (owner → `/academia/cobros/claim/:id`,
  productor → `/productor/comprobantes/claim/:id`, PLATFORM →
  `/admin/facturacion/comprobantes/:id`);
  `payment_claim_approved|rejected` (alumno → `/academias/:id`,
  comprador → `/perfil/pagos`); `sale_deal.responded` →
  `/productor/eventos/:eventId/academias/:agreementId` (solo scope
  evento; series-scope no tiene ficha → centro).
- `NavNotification` gana `category?: string`. Case muerto
  `academy.private_lesson.purchased` eliminado (emisor real `.sold`);
  `session.invite|declined` conservados (notificaciones históricas).
- Quedan en centro por diseño: `lead.new`, `crm.campaign`,
  `crm.segment.*` MARKETING, `crm.regular_no_presale`,
  `academy.sale_deal.responded` sin eventId.

## Verificación corrida

- API: academy-invites.controller 10/10, service 8/8,
  auth.controller 26/26, claims/sales 70/70 (specs existentes
  pasan con `path` aditivo).
- Web: notification-nav 34/34 (nuevo), NotificationToast 5/5,
  bridge page 3/3, notificaciones page 2/2.
- Typecheck api + web limpio; eslint web de archivos tocados limpio
  (api no tiene lint script).
- Mermaid de flows.md validado 42/42.
- E2E en vivo: academia-invites.spec 1/1 (chromium) sobre stack dev.
- `openspec validate` verde; ambos changes archivados con deltas.

## Notas de entorno

- Bash de esta sesión no tenía `git` en PATH: usar
  `shell_flavor: powershell` para git.
- React `use(params)` suspende en tests aunque la Promise esté
  resuelta - para páginas dinámicas testeables: page server async
  que hace `await params` → client component con props planas
  (patrón aplicado en `i/[inviteId]`).
- `.openspec-archive.lock` stale reapareció 2 veces: borrar y
  reintentar archive (ya documentado).
- El stack dev seguía vivo (:4000 `node dist/main.js`, :3000) - el
  e2e corrió sin levantar nada.
- Subagente explore eficaz para el inventario de tipos (114
  callsites, tabla completa con data por emisor).

## Pendientes (sin cambio desde el handoff anterior)

- multipais-foundation tasks 10/11/13 (sin abrir).
- Decisiones owner: modelo del import (enrollment INACTIVE vs
  invite bulk); divergencias TierPrice dev vs spec; ficha
  `/admin/campanas/[id]` para run/test/cancel.
- CAC orgánico: fuente de adquisición para altas sin invite sigue
  sin instrumentar (el `data.channel` del invite ya alimenta la
  mitad invite de la métrica - estrategia §7 item 5).

## Próximo slice sugerido

- `academy.sale_deal.responded` con scope series podría ganar ficha
  propia o `path` a una vista de acuerdos del productor (hoy cae al
  centro - no hay `/productor/series/...`).
- `claimUrl`/`collectUrl`/`paymentUrl` en data son URLs de API o
  externas - si se quiere CTA directo a la página de pago habría
  que emitir `path` además (decisión de producto, no bug).
- Smoke en dispositivo real del click del push con `data.path` (el
  fallback del SW no se puede cubrir en e2e - requiere push real).
