# Tasks - post-signup-profile-setup

## API

- [x] `PATCH /me` (people.controller `updateMe`): check de teléfono
  único → `ConflictException("phone_exists")` antes del update.
- [x] Spec: `PATCH /me` con phone de otra persona → 409 `phone_exists`;
  mismo phone propio → 200.

## Web

- [x] Extraer `GenderGroup` de `/perfil/datos` a
  `components/profile/GenderGroup.tsx` y actualizar el import.
- [x] Nueva página `/bienvenida` ((app)): guard de `onboarding`
  (visto → redirect), formulario nombre/phone/instagram/gender/estilos,
  submit (PATCH /me + PUT /me/style-roles condicional) + "ahora no",
  ambos marcan `profile-setup` y consumen `?next=`.
- [x] `login-form.tsx`: register redirige a `/bienvenida?next=…`.
- [x] Card "Completa tu perfil" en `/perfil` con dismiss persistente
  (`profile-reminder`).
- [x] i18n: nuevo part `welcome.json` + keys de la card en
  `profile.json`; registrar el part en el merge de messages.

## Verificación

- [x] `pnpm --filter @omnidance/api test` (spec nuevo incluido) -
  1429 tests verdes, 63 archivos.
- [x] `pnpm --filter @omnidance/web` typecheck (`tsc --noEmit`) +
  `pnpm --filter @omnidance/api build`.
- [x] i18n audit: `node apps/web/scripts/i18n-audit.cjs` → ALL_KEYS_OK.
- [x] `openspec validate post-signup-profile-setup`.
