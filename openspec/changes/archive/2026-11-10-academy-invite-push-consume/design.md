# academy-invite-push-consume - diseño

## Context

Hoy el consumo de `AcademyInvite` solo existe como método privado
`consumeAcademyInvites` en `AuthController` (corre en
`GET /auth/verify` y `POST /auth/otp/verify` cuando el `next` del
token apunta a `/academias/:id`). La notificación `academy.invite`
lleva `data: { academyId, inviteId }`; en `/notificaciones` el tap
marca leída y solo navega si `hrefFor` resuelve un path - hoy
`academy.invite` devuelve `null`. El lente es client-side:
`setViewMode("academy")` en `lib/view-mode.ts` (localStorage +
evento), que el chrome persiste cuando lee la cookie one-shot
`omnidance_lens` emitida por verify.

## Goals / Non-Goals

**Goals:**

- El tap de `academy.invite` deja a la persona en la ficha pública
  de la academia con lente academy y la invitación consumida -
  mismo resultado observable que abrir el magic link logueada.
- Un solo camino de consumo: misma lógica para verify y para el
  endpoint nuevo.
- Idempotencia y no-leak: re-tap o consumo previo → OK; invite de
  otro email → 404.

**Non-Goals:**

- No cambiar el payload de la notificación ni el toast en tiempo
  real (sigue llevando a `/notificaciones`).
- No consumir invites por solo *ver* la ficha pública: la llegada
  intencional es el tap del aviso (igual que el click del mail).
- No tocar el flujo de enrollment: el consumo marca "registrada",
  la inscripción sigue siendo de la persona por su cuenta.

## Decisions

**Endpoint `POST /academies/invites/:inviteId/consume` en
`AcademyInvitesController`** (ya tiene `SessionGuard` y `req.person`).

- Se identifica por `inviteId` (el payload del push ya lo trae) y se
  valida `invite.email === req.person.email` → 404 si no calza (el
  endpoint no revela la existencia de invites ajenas). Si ya tiene
  `consumedAt`, responde `{ consumed: false }` sin escribir nada.
- Alternativa considerada: solo mandar `data.path=/academias/:id` en
  la notificación y resolver navegación sin endpoint. Descartado:
  cubre la navegación pero no el consumo ni la atribución Referral,
  que es la mitad del gap.

**Helper compartido `consumeAcademyInvites(prisma, args)`** en un
módulo de dominio accesible por ambos consumidores. No va en
`AcademyInvitesService` para inyectarlo en `AuthController`:
academies ya importa `AuthService` y el cruce de módulos sería
circular. Va como función pura junto a `emitActivity` en
`common/` (mismo patrón: toma `prisma`, retorna `boolean`).

**Web: side-effect en `markRead` de `/notificaciones`.** Al tocar
`academy.invite`: `apiFetch(POST consume)` fire-and-forget +
`setViewMode("academy")` + `router.push("/academias/<id>")`. El
lente se setea aunque el consume falle (la persona igual llega a
contexto academia y el toggle queda disponible; la próxima visita
al centro reintentará la lectura de estado real). `hrefFor` gana el
caso con `academyId` del `data`.

## Risks / Trade-offs

- La ficha `/academias/:id` es pública: si el consume falla, la
  persona igual navega y ve la academia - solo se pierde la
  atribución, no el destino.
- Toast realtime sigue yendo a `/notificaciones` (dos taps hasta la
  ficha): consistente con el resto de tipos; deep-link directo del
  toast queda como mejora futura transversal.
