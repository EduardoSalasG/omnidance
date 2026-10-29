# Proposal; academy-create-page

## Why

`Academy.ownerId` permite N academias por owner y el selector de
`AcademyGate` ya las administra, pero la UI solo ofrece el form de
creación cuando la persona tiene **cero** academias; con una o más no
hay punto de entrada para crear la siguiente, aunque `POST /academies`
lo permite. Es el gap entre "el modelo soporta multi-academia" y "el
owner puede ejercerlo".

## What Changes

- **CTA "Nueva academia" en `AcademyGate`** (estado `ready`): visible
  para personas con rol ACADEMY_OWNER en estado APPROVED o SANDBOX
  (`academies.create`), junto al selector; aparece también con una
  sola academia (hoy sin selector ni CTA).
- **Página `/academia/nueva`**: crear = página dedicada (patrón
  consolas), `ConsoleHeader` a `/academia`, form con nombre →
  `POST /academies`; al crear persiste la selección
  (`omnidance:academy-id`) y vuelve al hub con la academia nueva
  activa. Deep-link sin rol → estado "sin acceso" con salida.
- El form del estado `empty` del gate se comparte con la página nueva
  (mismo componente); sin duplicar lógica.

## Capabilities

- **Modified Capabilities**: `academies/console-lists`; el flujo
  crear de la consola del owner gana entrada desde el listado.

## Impact

- `apps/web/src/components/academy/academy-gate.tsx`; CTA + form
  extraído a `create-academy-form.tsx`.
- `apps/web/src/components/academy/shared.ts`; `ACADEMY_STORAGE_KEY`
  exportada (hoy vive en el gate).
- Página nueva `apps/web/.../(app)/academia/nueva/page.tsx`.
- i18n: `academy.newAcademy` (+ `createDesc` si aplica) en
  `messages/es-CL.json`.
- `docs/qa-flows-inventory.md`; flujo crear academia.
