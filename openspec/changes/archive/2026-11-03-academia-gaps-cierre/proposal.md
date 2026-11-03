# academia-gaps-cierre

## Why

Cierre de los gaps declarados en el handoff 2026-11-03 (inicio de
academia): la regla "un nivel por tipo de clase" quedó aplicada en el
editor y el seed pero la API aún acepta `levelIds[]` multi por tipo; la
academia con línea de niveles propia no tiene vuelta atrás salvo borrar
customs una a una; y la fila de KPIs del home Extendido no reserva el
slot de "Reservas hoy" durante la carga. Además queda pendiente correr
el E2E Playwright del home nuevo.

## What Changes

- **API**: `PATCH /enrollments/:id/levels` rechaza con 400 cualquier
  entrada con más de un `levelId` por `classTypeId` (un nivel por tipo,
  alineado con el editor y el seed).
- **API**: `DELETE /academies/:id/class-levels` (bulk) resetea la
  academia a la línea global borrando todos sus niveles custom en una
  operación atómica; 409 con los nombres en uso si alguno está
  referenciado por series o alumnos.
- **Web**: botón "Volver a la línea global" en `/academia/niveles`
  (zona destructiva, con confirmación) que llama al bulk y reporta los
  niveles bloqueados por uso.
- **Web**: el slot `extra` de `AcademyKpiCards` ("Reservas hoy") tiene
  paridad de skeleton durante la carga del dashboard (spec
  `loading-states`: forma del layout, sin pop-in).
- **QA**: corrida del E2E Playwright del home de academia y
  actualización del inventario de flujos QA.

## Capabilities

### New Capabilities

- `academies/class-levels`: línea de niveles de la academia (herencia
  global vs línea custom, mantenedor y reset a la línea global).

### Modified Capabilities

- `academies/enrollment-levels`: la regla pasa de multinivel a un
  nivel por tipo de clase; `PATCH /enrollments/:id/levels` lo exige.

## Impact

- API: `AcademiesController` (nuevo DELETE bulk),
  `EnrollmentsController.setLevels` (validación) + specs Vitest.
- Web: `/academia/niveles` (botón + ConfirmSheet + keys i18n
  `levelsConfig.*`), `AcademyKpiCards`/`academy-dashboard` (skeleton
  del slot extra), comentarios stale "multinivel" del editor.
- Docs: `openapi.json` + colección Postman regenerados (endpoint
  nuevo); `docs/qa-flows-inventory.md` si el flujo cambia.
- Sin cambios de schema ni de contratos existentes: `levelIds` sigue
  siendo array (0 o 1 elemento), el DELETE bulk es un path nuevo.
