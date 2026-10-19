# Tasks — academy-create-page

## 1. Form compartido

- [x] `components/academy/create-academy-form.tsx`: extraer el form de
      crear del gate (nombre + submit + error `role="alert"`) con
      callback `onCreated(academy)`; el gate `empty` lo usa con
      `onCreated → boot()`.
- [x] `shared.ts`: exportar `ACADEMY_STORAGE_KEY`
      ("omnidance:academy-id"); el gate lo importa de ahí.

## 2. CTA en AcademyGate (estado ready)

- [x] Fila selector+CTA: `<select>` cuando hay >1 academia; CTA
      `Button href="/academia/nueva"` "Nueva academia" cuando `me`
      tiene ACADEMY_OWNER APPROVED o SANDBOX (también con 1 academia).

## 3. Página /academia/nueva

- [x] `ConsoleHeader` back `/academia`; gate por `useMe`: loading →
      PageLoading; sin rol owner (APPROVED/SANDBOX) → estado "sin
      acceso" + CTA salida; con rol → Card + `CreateAcademyForm` con
      `onCreated` → `localStorage[STORAGE_KEY]=id` →
      `router.push("/academia")`.

## 4. i18n + docs

- [x] `academy.newAcademy` en `messages/es-CL.json` (+ estado forbidden
      si hace falta una key nueva).
- [x] `docs/qa-flows-inventory.md`: flujo crear academia desde consola.
- [x] typecheck web, eslint archivos tocados, i18n-audit.
