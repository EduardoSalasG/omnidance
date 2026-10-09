# Tasks — instructor-commission-subtype

## 1. Backend

- [x] 1.1 `instructor-agreement.ts`: `PAY_TYPES` + `agreementWrite(dto,
     current)` (normalización de subtipos, validación 0-100, limpieza
     de campos incompatibles) + `commissionSnapshot(instructor)`.
- [x] 1.2 `UpdateInstructorDto` + `updateInstructor` en
     academies.controller: whitelist con COMMISSION, `commissionPct`
     aceptado, normalización vía `agreementWrite`.
- [x] 1.3 `AddInstructorDto` + `addInstructor`/`listInstructors`/
     detalle en academy-staff.controller: acuerdo completo en alta
     (upsert create/update), `commissionPct` expuesto solo bajo
     COMMISSION.
- [x] 1.4 private-lessons.controller: `commissionSnapshot` en create
     (POST manual) y en `action="assign"`; liquidación/filtros/netClp
     sin cambio de semántica.
- [x] 1.5 Schema comments actualizados (sin migración: misma columna,
     nuevo significado según `payType`).

## 2. Analítica / query

- [x] 2.1 query entity `academy`: filtro `commission` y columnas
     `comision_pct`/`comision_pagada` restauradas (concepto vigente).
- [x] 2.2 `packages/shared` query-catalog + i18n `query.json`
     restaurados.

## 3. Frontend

- [x] 3.1 Alta de profesor (`staff-form`): opción "Comisión %" en el
     radio del acuerdo + input de porcentaje; payload según subtipo.
- [x] 3.2 Editor del acuerdo (`equipo/profesor/[id]/editar`): union
     `PayType` con COMMISSION, radio de 4 opciones, input % con
     validación 0-100, payload que limpia campos incompatibles.
- [x] 3.3 Detalle de profesor (`[id]/page`): tipo + rama de display
     `payCommissionOf`.
- [x] 3.4 Listado (`instructor-section`): tipo + display de la tasa.
- [x] 3.5 i18n `academyStaff`: `payCommission`, `payCommissionOf`,
     `fieldCommissionPct`.

## 4. Specs

- [x] 4.1 Specs de controller: create/assign snapshot COMMISSION y
     no-COMMISSION; PATCH por subtipo + limpieza; rechazo fuera de
     0-100; listado con commissionPct null en subtipo fijo.
- [x] 4.2 Delta openspec de instructor-commission (MODIFIED x2 +
     REMOVED/ADDED), private-lesson-product (assign) y staff-roles
     (mantenedor + acuerdo).

## 5. Verificación

- [x] 5.1 `openspec validate` del change (verde, sin warnings).
- [x] 5.2 tsc API + web limpios; specs afectados verdes
     (private-lessons 29, academy-staff 8); i18n audit ALL_KEYS_OK.
- [x] 5.3 `impeccable detect` sobre el diff web: `[]`.
