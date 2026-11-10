# Tasks: invite-academy-lens

## API

- [x] 1.1 `consumeAcademyInvites` retorna `boolean` (≥1 invite
  consumido). `GET /auth/verify` y `POST /auth/otp/verify` setean
  `res.cookie("omnidance:lens", "academy", { maxAge ~5min, sameSite
  lax, httpOnly: false })` solo cuando hubo consumo.
- [x] 1.2 Spec del controller: verify con invite pendiente setea la
  cookie; sin invite no la setea.

## Web

- [x] 2.1 Efecto en `BottomNav` (o componente dedicado montado por el
  chrome): con `meChecked && me`, si `document.cookie` contiene
  `omnidance:lens=academy` → `setViewMode("academy")` + expirar la
  cookie (`Max-Age=0`). Una sola vez por llegada.

## Cierre

- [x] 3.1 `docs/qa-flows-inventory.md` § invitación de registro:
  documentar el flip de lente por cookie `omnidance:lens`.
- [x] 3.2 `omni-dance.md`: línea del consumo de invite menciona la
  activación de la lente academy.
- [x] 3.3 Verificación: typecheck + spec del controller verdes;
  `openspec validate --changes` OK.
