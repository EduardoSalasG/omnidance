# Tasks — academy-home-console

## 1. API (dashboard)

- [x] 1.1 `pendingClaims {count, amount, items≤5}` (PENDING, más
  antiguos primero; personName por join manual).
- [x] 1.2 `kpis.*Prev` month-to-date del mes anterior (billed, ticket,
  asistencia/clase; null sin base).
- [x] 1.3 `teamCount` = AcademyStaff + AcademyInstructor.
- [x] 1.4 Tests del módulo academies verdes (155); cobertura de los
  campos nuevos queda como brecha conocida (pendiente spec dedicado).

## 2. Web (inicio owner)

- [x] 2.1 `shared.ts`: tipo `AcademyDashboard` actualizado.
- [x] 2.2 `academy-kpi-strip.tsx`: delta vs mes anterior +
  `aria-label` compuesto + "sin datos" para null.
- [x] 2.3 `academy-dashboard.tsx`: layout 2-col desktop, clases de hoy
  enlazadas + empty state, sección cobros por revisar, split vencen
  hoy/semana, renombrar cumpleaños, caps+ver todos, checklist de
  activación, fix `items-center` en filas.
- [x] 2.4 `HomeHub.tsx`: `h1` en el saludo; fecha junto al nombre de la
  academia (header del dashboard).
- [x] 2.5 i18n keys nuevas en `academyExtras.json`; audit verde.

## 3. Integración

- [x] 3.1 API build + tests academies (155 verdes).
- [x] 3.2 Web tsc + i18n audit + `impeccable detect` (`[]`).
- [x] 3.3 `openspec validate` del change — válido. Campos aditivos en
  el response; docs API no requieren regen (schema no cambia firma de
  endpoint).
