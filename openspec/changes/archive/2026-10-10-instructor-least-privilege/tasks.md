# Tasks — instructor-least-privilege

- [x] 1 `alumnos/page.tsx`: lente INSTRUCTOR → sin KPIs, Insights,
  ImportCard ni CTA (`canAdminister`/`manages`/`caps.students` scoped a
  `activeRole !== "INSTRUCTOR"`)
- [x] 2 `alumnos/[personId]/page.tsx`: `canEdit` &= `!instructorLens`
  (sin editor de status/endsAt bajo la lente)
- [x] 3 `alumnos/nuevo/page.tsx`: misma degradación de `canAdminister`
  bajo lente INSTRUCTOR (deep link)
- [x] 4 API `students/insights`: `topPayersMonth` solo con cap
  `payments`; sin ella → `[]` y no consultar cobros
- [x] 5 `FilterBar`: `min-w-0` en grid items + date inputs (fix
  desde/hasta replicable en todas las consolas)
- [x] 6 `seed-dev.ts`: TRANSFER activo con datos de cuenta para todas
  las academias; TRANSFER `ProducerPaymentMethod` para todo rol
  PRODUCER aprobado
- [x] 7 Tests: insights sin `payments` → `topPayersMonth: []` (attendance
  roster-scoping ya cubierto en classes.controller.spec.ts)
- [x] 8 Verificación: tsc web+api, i18n audit, impeccable detect,
  openspec validate, seed idempotente
- [x] 9 Release: version + changelog + dev→main + tag + push
