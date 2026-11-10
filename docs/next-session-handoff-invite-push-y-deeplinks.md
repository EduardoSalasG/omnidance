# Handoff: canal invite cerrado (push consume + toast deep-link)

Sesión 2026-11-10 (tarde/noche, continuación de
`qa-cierre-y-bugs-verify`). Se verificó en vivo el fix de la cookie
de lente de la sesión anterior y se cerró el gap pendiente: el push
`academy.invite` de cuentas existentes. Tres commits.

## Trabajo completado

### 1. Verify de invite confirmado en vivo

Token magic minteado con `jose` + `JWT_SECRET` (`dev-secret-change-me`;
ojo: extraerlo de `.env` por regex arrastra el `\r` de CRLF y rompe la
firma - usar el valor literal). `GET /api/auth/verify` → 302 +
`omnidance_session` + `omnidance_lens=academy` + redirect a
`/bienvenida?next=/academias/<id>`; side-effects en DB (Person,
AcademyInvite consumida, Referral) verificados.

### 2. `academy-invite-push-consume` (archivado)

- `POST /api/academies/invites/:inviteId/consume` (SessionGuard): 404
  si la invite no existe o `invite.email != person.email` (lookup de
  Person por id - `req.person` NO trae email), `{consumed:false}` si
  ya estaba. Idempotente.
- Consumo extraído de `AuthController` a
  `common/consume-academy-invites.ts` (función pura, prisma + args,
  retorna bool; log por parámetro). Mismo efecto en ambos caminos.
- `/notificaciones`: `hrefFor` gana `academy.invite` →
  `/academias/<academyId>`; el tap consume (best-effort) +
  `setViewMode("academy")` (equivalente a la cookie, sin cookie).

### 3. `notification-toast-deeplink` (archivado)

- `lib/notification-nav.ts` (web): `notificationHref` (el `hrefFor`
  movido, `data?: unknown` con narrowing) + `notificationTapEffects`
  - fuente única centro + toast. Capability nueva
  `notifications/deep-links`.
- `NotificationToast`: cuerpo `<Link>` → `<button>` que dismiss +
  tapEffects + `router.push(href ?? "/notificaciones")`. La X sigue
  solo descartando.

### 4. Docs comerciales y referencias

- `pitch-comercial-tiers.md`: objeciones Studio de migración/Excel
  reescritas (push → ficha con lente, "registrada" por cualquier
  camino).
- `estrategia-comercial`: experimento CAC marcado parcial (canal
  invite instrumentado vía Referral; falta fuente de altas orgánicas).
- `competitive-references.md`: tabla vs BoxMagic/Membrezia actualizada
  (precio ~150 clientes $79.700 STUDIO, trial 15d, ciclos −8/−15%,
  fondos BYO, fila "Alta de alumnos"); gaps cerrados marcados (BYO
  collections, import Excel, Wallet parcial).
- `architecture.md` y `flows.md` (diagrama validado 42/42) con el
  camino push; `qa-flows-inventory.md` sección Notificaciones + invite.

## Verificación corrida

- `academy-invites.controller.spec` 9/9 (4 nuevos: consume, idempotente,
  404 ajena, 404 inexistente), `auth.controller.spec` 25/25,
  `notificaciones/page.test` 2/2, `NotificationToast.test` 3/3.
- Typecheck api + web limpio; eslint de archivos tocados limpio.
- Smoke vivo (API reconstruida + reiniciada): consume propio →
  `{consumed:true}`, re-call → `{consumed:false}`, ajena → 404,
  sin sesión → 401; DB: consumedAt + Referral único + invite.registered.

## Notas de entorno

- El API dev corre `node dist/main.js` (sin watch): reiniciada con el
  build nuevo (matar PID viejo + `node dist/main.js >> api-smoke.log`).
- `vi.mock` + variables de módulo: meter el mock dentro de
  `vi.hoisted` (el patrón `apiFetch: apiFetchMock` directo rompe por
  TDZ; con wrapper arrow se arrastra `no-unused-vars`).
- `req.person` no trae `email` (solo id/roles/roleStates/isDemo) -
  endpoints que lo necesitan hacen lookup de Person.
- Mermaid: `;` en texto de mensaje rompe el parse (usar `·`);
  comillas en mensajes de sequenceDiagram también molestan.
- Lock stale `.openspec-archive.lock` sigue apareciendo: borrarlo si
  archive dice "already being created".

## Pendientes

- multipais-foundation tasks 10/11/13 (sin abrir).
- Decisiones owner: modelo del import (enrollment INACTIVE vs invite
  bulk); divergencias TierPrice dev vs spec; ficha
  `/admin/campanas/[id]` para run/test/cancel.
- CAC orgánico: fuente de adquisición para altas sin invite sigue sin
  instrumentar (estrategia §7 item 5 actualizado).
- Data QA en dev DB: personas `qa-live-verify-*@omnidance.dev`,
  invites consumidas de prueba (inofensivas).

## Próximo slice aprobado por el owner (5 ítems, diseño listo)

Pedido y aprobado en esta sesión; no alcanzó por margen de contexto.

### A. Push de dispositivo cierra el canal (change `invite-device-push-bridge`)

El SW (`apps/web/public/sw.js`) abre `data.url ?? "/notificaciones"`;
la push `academy.invite` lleva `{academyId, inviteId}` sin `url` →
caen al centro. Diseño acordado: ruta bridge en vez de `url` directa
a la ficha (url=/academias/:id saltaría el consume).

- API: `sendInvite` push `data` += `url: /i/<inviteId>` (el SW ya la
  consume tal cual). Opción: también sirve para `crm.campaign` u otros
  que quieran deep link propio.
- API: `POST /academies/invites/:inviteId/consume` devuelve además
  `academyId` → `{consumed, academyId}` (el bridge lo necesita; la
  página no ve el `data` de la notificación).
- Web: página cliente `apps/web/src/app/[locale]/(app)/i/[inviteId]/page.tsx`
  mínima: POST consume best-effort → `setViewMode("academy")` →
  `router.replace(/academias/<academyId>)`; si 404/401 →
  `replace("/notificaciones")`. PageLoading mientras resuelve.
- Spec delta: `academies/student-invites` (MODIFIED, cubre los tres
  caminos: mail, centro/toast, push de dispositivo).

### B. Marcar leída en el tap del toast (parte del mismo change o uno
   aparte según alcance)

Una línea: `apiFetch(POST /notifications/:id/read)` en el onClick del
cuerpo del toast antes de navegar + aserción en el spec del toast.
Spec `notifications/deep-links` MODIFIED.

### C. Auditoría de deep links restantes (change propio
   `notification-deeplink-coverage`)

`notificationHref` cubre ~14 tipos; el API emite ~40. Tipos detectados
sin destino que merecen mapa (revisar emisor por emisor):
`academy.sale_deal.invited` → /academia/preventas (o la ficha del
acuerdo), `academy.private_lesson.sold` → consola de particulares,
`academy.billing_*` → /academia/suscripcion, `academy.courseSurvey` →
encuesta del curso, `class.reminder`/`class.instructor_assigned` →
/clases o roster, `membership.*`, `academy.collections_*` → cobros.
Las `OPERATIONAL`/`account.*` quedan en el centro por diseño.
Decidir destino por tipo mirando `data` del emisor (qué ids lleva).

### D. Atribución de canal en el consume

Sin schema: `emitActivity` ya acepta `data` →
`consumeAcademyInvites(prisma, args, logger, channel?)` emite
`invite.registered` con `data: {channel: "magic_link"|"push"|"device"}`;
verify pasa `magic_link`, el consume endpoint `push`/`device`.
Retrocompat: eventos viejos sin channel = mail (era el único camino).
Alimenta la métrica invite→registrada por canal (estrategia §7.5).

### E. Spec e2e del camino push

Playwright: crear invite para persona QA existente, sesión, abrir
/notificaciones → tap → assert navegación a /academias/:id +
viewMode academy (data-mode o localStorage). Contra build de
producción (receta del handoff anterior, no `next dev`).
