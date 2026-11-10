# Tasks: admin-user-payment-methods

## API

- [x] 1.1 `GET /admin/users/:personId/payment-methods` en
  `UserIntelController` (mismos guards admin que los endpoints
  vecinos): 404 si la persona no existe; por cada
  `Academy.ownerId = personId` devuelve `gatewayAccounts` (provider,
  keyMask, status, lastError, verifiedAt, webhookUrl vía
  `webhookUrlFor` exportado de `gateway-accounts.service`) y
  `manualMethods` (id, type, label, details, active).
  `credentialsEnc` jamás se selecciona.

## Web

- [x] 2.1 Fetch paralelo al detail en
  `admin/usuarios/[personId]/page.tsx` (un fallo no tumba la ficha,
  mismo criterio que timeline).
- [x] 2.2 Sección "Métodos de pago": h2 uppercase, `SkeletonList`
  mientras carga (solo si el actor tiene rol ACADEMY_OWNER), una
  `Card` por academia con "Pasarela" (provider + keyMask + badge de
  status + verifiedAt + webhookUrl + lastError) y "Métodos manuales"
  (label + tipo + activo + resumen público de details). Vacío por
  academia cubierto; la sección se oculta si no posee academias.
- [x] 2.3 Keys i18n `admin.users.payMethods.*` en es-CL + en/fr/pt-PT
  con paridad (`node scripts/i18n-parity.cjs` verde).

## Cierre

- [x] 3.1 `docs/qa-flows-inventory.md` §admin actualizado.
- [x] 3.2 Verde: build/typecheck de `@omnidance/api` + typecheck de
  `@omnidance/web` + `openspec validate`.
