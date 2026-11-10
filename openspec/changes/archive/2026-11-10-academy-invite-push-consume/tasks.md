# Tasks: academy-invite-push-consume

## 1. Helper compartido de consumo

- [x] 1.1 Extraer `consumeAcademyInvites` de `AuthController` a
  `apps/api/src/common/consume-academy-invites.ts` (función pura que
  toma `prisma` + `{ email, personId, academyId }`, retorna
  `Promise<boolean>`, log best-effort igual que hoy).
- [x] 1.2 `AuthController` usa el helper (verify + otp/verify) -
  comportamiento idéntico, specs existentes en verde.

## 2. Endpoint de consumo por sesión

- [x] 2.1 `POST /academies/invites/:inviteId/consume` en
  `AcademyInvitesController`: 404 si la invite no existe o el email
  no calza con `req.person.email`; `{ consumed: false }` si ya
  estaba consumida; si no, corre el helper y devuelve
  `{ consumed: true }`.
- [x] 2.2 Spec del controller: consume happy path (invite consumida
  + Referral + evento), idempotente, 404 por email ajeno, 401 sin
  sesión.

## 3. Deep link + lente en `/notificaciones`

- [x] 3.1 `hrefFor`: `academy.invite` → `/academias/<academyId>` con
  `academyId` de `n.data`.
- [x] 3.2 En `markRead`: para `academy.invite`, `apiFetch` consume
  fire-and-forget + `setViewMode("academy")` antes del
  `router.push`.

## 4. Verificación

- [x] 4.1 `vitest run` de los specs tocados +
  `pnpm --filter @omnidance/api typecheck` +
  `pnpm --filter @omnidance/web typecheck`.
- [x] 4.2 Smoke vivo: crear invite para cuenta existente, POST
  consume con sesión → 200 `{consumed:true}`, re-call →
  `{consumed:false}`, invite de otro email → 404.
