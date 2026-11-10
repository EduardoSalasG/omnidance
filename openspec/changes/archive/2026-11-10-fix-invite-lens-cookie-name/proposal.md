# Proposal: cookie de lente con nombre legal (`omnidance_lens`)

## Resumen

Bug encontrado en QA manual (2026-11-10): `setArrivalLensCookie`
llama `res.cookie("omnidance:lens", "academy", …)` y el nombre con
`:` es ilegal en `cookie@0.7.x` (`TypeError: argument name is
invalid`). El throw cae dentro del try de `GET /auth/verify` (y del
mismo camino en `POST /auth/otp/verify`), después de emitir la
sesión → el invitado recibe **401 "Link inválido o expirado" con la
cookie de sesión ya seteada**: la cuenta se crea y el invite se
consume, pero el flujo muere en pantalla de error. Es decir, no solo
el flip de lente estaba roto: el consumo completo de invitación
devolvía 401 siempre que hubiera invite pendiente.

Los specs no lo vieron porque mockean `res.cookie` - nunca pasa por
el serializer real.

## Fix

Renombrar la cookie a `omnidance_lens` (mismo patrón que
`omnidance_session`; `:` no es token-char válido en RFC 6265):

- `auth.controller.ts`: `setArrivalLensCookie` → `omnidance_lens`.
- `BottomNav.tsx`: lectura (`document.cookie.includes`) y expiración
  al nuevo nombre.
- `auth.controller.spec.ts`: aserciones al nuevo nombre.
- Spec `academies/student-invites`: el texto del requisito nombra la
  cookie - delta MODIFIED.
- `docs/qa-flows-inventory.md`: la sección de invites documenta el
  nombre nuevo.

## Fuera de alcance

- El gap conocido del push `academy.invite` en cuenta existente (sin
  paso por verify, sin flip) sigue vigente - no lo toca este change.
