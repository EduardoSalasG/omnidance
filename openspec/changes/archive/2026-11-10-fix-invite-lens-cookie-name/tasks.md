# Tasks: fix-invite-lens-cookie-name

## Código

- [x] 1.1 `auth.controller.ts`: `setArrivalLensCookie` usa
  `omnidance_lens` (`:` es ilegal en cookie@0.7.x → throw dentro del
  try → 401 con sesión ya emitida).
- [x] 1.2 `BottomNav.tsx`: lectura y expiración al nuevo nombre.
- [x] 1.3 `auth.controller.spec.ts`: aserciones al nuevo nombre.

## Cierre

- [x] 2.1 `docs/qa-flows-inventory.md`: sección invites documenta
  `omnidance_lens`.
- [x] 2.2 Verificación: spec controller verde, typecheck api+web,
  `openspec validate --changes` OK, QA vivo: verify de invite → 302
  + `viewMode=academy` persistido.
