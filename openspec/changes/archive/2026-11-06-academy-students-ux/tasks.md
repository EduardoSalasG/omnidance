# Tasks: academy-students-ux

## API

- [x] `GET /academies/:id/students/candidates?q=` en
      `academies.controller.ts` (declarado antes de
      `:id/students/:personId`): cap `students`, `q` ≥2 chars →
      `{id,name,email}` top 10 por nombre/email contains insensitive,
      excluye `deletedAt`.
- [x] `GET /academies/:id/students/:personId`: `person` suma
      `email`/`phone`; cada ítem de `enrollments` suma `method`
      (último claim ligado → `methodLabel`; si no, último pago PAID
      MEMBERSHIP de person+plan → `methodLabel`/`gatewayMedia`; null
      sin registro).

## Web

- [x] Hook de viewport compartido: `lib/console-page-size.ts`
      (`useConsolePageSize`, useSyncExternalStore + matchMedia lg).
- [x] `students-section.tsx`: pageSize responsivo 20/10 con reset a
      página 1 al cruzar el breakpoint.
- [x] `students-section.tsx`: chips legibles, frase explícita con
      ícono ("Venció el {date}" / "Pagado hasta el {date}" / "Sin
      fecha de término") junto al chip del plan coloreado.
- [x] `enrollment-form.tsx`: buscador de persona con debounce 300ms
      contra `students/candidates` (dropdown nombre+email, selección
      fija id y muestra identidad + "Cambiar", vacío honesto, error
      distinguible); sugerencia de `endsAt` por duración del plan con
      override manual protegido.
- [x] `alumnos/[personId]/page.tsx`: email + teléfono en la ficha;
      `method` en filas de pagos; fechas en fila propia en mobile;
      editor bloqueado por defecto con "Editar" → Guardar/Cancelar.
- [x] `shared.ts`: tipos `StudentProfile` (`person.email`/`phone`,
      `enrollments[].method`, `PersonCandidate`) + helper de vigencia
      sugerida por plan.

## i18n y docs

- [x] Claves nuevas en `src/i18n/parts/academyExtras.json`
      (es-CL + en/fr/pt-PT): buscador, "Editar", método de pago,
      frases de vigencia.
- [x] `docs/qa-flows-inventory.md` §Alumnos actualizado.
- [x] `node apps/api/scripts/export-api-docs.cjs` contra API viva →
      `docs/openapi.json` + Postman regenerados.
- [x] `npx tsc --noEmit` en web y api; vitest de lo tocado;
      `i18n-audit` OK; `openspec validate --changes` verde.
