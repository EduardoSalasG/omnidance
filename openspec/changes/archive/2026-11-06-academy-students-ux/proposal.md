# Proposal: academy-students-ux

## Why

La revisión UX de la consola Academy Owner
(`docs/academy-console-ux-review-2026-11-05.md`, slice "Alumnos")
levantó fricciones concretas en el módulo de alumnos:

- `/academia/alumnos/nuevo` pide el `personId` como texto crudo: el
  owner debe conocer el id interno de la persona para inscribirla, un
  flujo inutilizable en práctica.
- El alta no sugiere "pagado hasta": el staff calcula la vigencia a
  mano aunque el plan ya declara su duración (`type` + `periodDays`).
- La ficha no muestra email/teléfono del alumno ni el método de pago
  de cada membresía, y en mobile "pagado hasta" compite por ancho.
- El editor de inscripción (estado + pagado hasta) queda editable en
  permanencia: un toque accidental puede mutar la vigencia.
- El listado usa `PAGE_SIZE=24` fijo: la regla transversal nueva es
  20 en desktop y 10 en mobile.
- El segundo chip del card (nombre del plan coloreado por estado de
  pago) no se entiende: color solo no comunica "venció el 12 oct".

## What Changes

- **API**: nuevo `GET /academies/:id/students/candidates?q=` (cap
  `students`): búsqueda de personas por nombre o email (≥2 chars, top
  10) para el buscador del alta. Persona inexistente → el form muestra
  el estado "sin coincidencias" honesto; el alta asistida de persona
  queda diferida (ver reporte del change).
- **API**: `GET /academies/:id/students/:personId` suma `email` y
  `phone` de la persona y `method` por enrollment del historial
  (último método declarado: claim asociado o pago de pasarela).
- **Alta** (`enrollment-form.tsx`): buscador con debounce 300ms que
  fija el `personId` al elegir (muestra nombre, nunca el id); al
  elegir plan se sugiere `endsAt` según su duración (misma regla de
  `membershipEndsAt` del dominio: mensual→fin de mes, trimestral→fin
  del 3er mes, semestral→fin del 6º, PERIOD/TRIAL→+periodDays,
  SINGLE→día siguiente, CLASS_PACK→sin fecha), editable como override.
- **Ficha** (`/academia/alumnos/[personId]`): email y teléfono en la
  ficha de datos; método de pago en cada fila de pagos; en mobile
  "pagado hasta" baja a su propia fila; el editor queda bloqueado por
  defecto detrás de un botón "Editar" y vuelve a bloqueado tras
  guardar o cancelar.
- **Listado** (`students-section.tsx`): pageSize responsivo 20
  desktop / 10 mobile (hook compartido `useConsolePageSize` de
  `lib/console-page-size`); chip del
  plan conserva su color por estado de pago pero la vigencia se
  comunica con texto explícito ("Venció el {date}", "Pagado hasta el
  {date}") con ícono en vez de fecha suelta.

## Capabilities

- **Modified Capabilities**: `academies/console-lists` (alta de
  alumnos por búsqueda de persona, listado con pageSize responsivo,
  ficha con contacto/método y edición protegida, chips legibles).

## Impact

- API: `academies.controller.ts` (nuevo endpoint + select de persona
  ampliado + método por enrollment en `studentDetail`).
- Web: `lib/use-media-query.ts` (nuevo),
  `components/academy/enrollment-form.tsx`,
  `components/academy/students-section.tsx`,
  `components/academy/shared.ts` (tipos + helper de vigencia sugerida),
  `app/[locale]/(app)/academia/alumnos/[personId]/page.tsx`.
- i18n: claves nuevas en `src/i18n/parts/academyExtras.json`
  (es-CL + en/fr/pt-PT).
- Docs: `docs/qa-flows-inventory.md` §Alumnos; `docs/openapi.json` +
  Postman regenerados con el export contra API viva.
- Sin migración de schema.
