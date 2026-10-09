# instructor-commission-subtype — la comisión vuelve como subtipo del acuerdo

## Why

En `academy-console-v4` se retiró `commissionPct` de toda vía activa
bajo la lectura de que el acuerdo económico lo reemplazaba. Revisado el
modelo con el producto, la conclusión es la inversa: la comisión **es**
un subtipo más del acuerdo económico — el owner pacta con el profesor
un monto fijo por clase, un mensual por N clases, **o** un porcentaje
que la academia retiene de cada clase particular vendida.

Mantenerlos como conceptos separados dejaba el modelo roto: una
academia que trabaja a comisión no podía expresarlo, y el snapshot
`PrivateLesson.commissionPct` (histórico) no tenía fuente vigente que
lo siguiera poblando — el histórico se agotaba y `pay-commission`/
`netClp` quedaban sin utilidad futura.

## What

- `payType` gana el valor `"COMMISSION"` (además de `PER_CLASS` y
  `MONTHLY`) en `PATCH /academies/:id/instructors/:personId` y en
  `POST /academies/:id/instructors`. Un solo subtipo activo:
  - `COMMISSION` → `commissionPct` entero 0–100 activo;
    `payAmount`/`payClasses` quedan en null.
  - `PER_CLASS`/`MONTHLY` → `commissionPct` queda en null.
  - Sin acuerdo → todos los campos económicos en null.
- La normalización vive en un helper compartido
  (`instructor-agreement.agreementWrite`) usado por PATCH (parcial, con
  la fila vigente como contexto) y POST (alta/upsert).
- `POST /academies/:id/private-lessons` y `PATCH .../action="assign"`
  vuelven a snapshotear `commissionPct` en la lección — **solo**
  cuando el acuerdo del instructor asignado es `COMMISSION`; con otro
  subtipo nace en 0.
- Liquidación y derivados sin cambio de semántica: `pay-commission`
  sigue operando sobre lecciones `commissionPct > 0` (históricas y
  nuevas COMMISSION), `mine?as=instructor` deriva `commissionClp`/
  `netClp` en esas filas y el filtro `commission` sigue implicando
  `> 0`.
- Listados/detalle de instructores (capacidad `team`) exponen
  `commissionPct` con valor solo cuando el acuerdo es `COMMISSION`
  (null en otro subtipo). `GET /academies/:id` manage sigue sin
  exponerlo; `GET /academies/:id/profile` no expone acuerdo ni
  comisión.
- UI: el editor del acuerdo (detalle profesor → editar) y el alta de
  profesor ganan la opción "Comisión %" con su input de porcentaje;
  listado y detalle de profesor muestran la tasa.
- Analítica: se restauran el filtro `commission` y las columnas
  `comision_pct`/`comision_pagada` de `private_lessons` — la comisión
  vuelve a ser un concepto vigente consultable.

## Impact

- Specs afectadas: `academies/instructor-commission`,
  `academies/private-lesson-product`, `academies/staff-roles`.
- Código: `instructor-agreement.ts` (nuevo), controllers de academies,
  academy-staff y private-lessons; query entity `academy`;
  `packages/shared` query-catalog; i18n `academyStaff`/`query`; UI de
  instructor (section, detalle, editar, staff-form).
- Datos: sin migración — `AcademyInstructor.commissionPct` ya existe y
  pasa de "solo histórico" a "tasa activa cuando payType=COMMISSION";
  `PrivateLesson.commissionPct` sigue siendo snapshot por lección.
- Compatibilidad: instructores legacy con `commissionPct` y `payType`
  null mantienen el valor como dato histórico (no se snapshottea ni se
  expone como acuerdo); lecciones históricas `>0` se liquidan igual.
