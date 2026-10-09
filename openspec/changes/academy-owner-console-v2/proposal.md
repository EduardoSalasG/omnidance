# Proposal — academy-owner-console-v2

## Why

Segunda pasada sobre la consola del dueño de academia tras
`academy-home-console`:

- La card "Alumnos activos" no tiene comparativa y los deltas se
  muestran en porcentaje — el owner pidió notación absoluta
  (`+1`, `-3`, `=`) y comparativa también para asistencia, facturado y
  ticket.
- `/academia/alumnos` muestra los 6 KPIs del dashboard; el módulo solo
  necesita 3: alumnos activos, % hombres y % mujeres, cada uno con su
  comparativa mensual.
- `/academia/clases` es la consola del instructor pero sigue listada en
  el drawer del owner, que al entrar solo ve "esta vista es para
  instructores".
- El form de series pide "mes de vigencia": las series deberían ser
  ilimitadas hasta desactivarse, no mensuales. Hoy sin `month` no hay
  materialización más allá del mes — el cambio requiere materialización
  rodante + job diario, no solo quitar el input.
- Cupos (`capacity`) y modalidad (`typeIds`) se piden por horario
  semanal cuando son atributos de la serie completa (`quorum` /
  `typeIds` a nivel serie ya existen).
- El form tiene botón Cancelar redundante (el chrome ya da regreso) y
  el título contextual muestra "Series de clases" en vez de "Nueva
  serie de clases".

## What Changes

- **API** `GET /academies/:id/dashboard`:
  - `kpis.activeStudentsMonth` pasa a contar personas únicas con
    enrollment vigente (antes enrollments — misma métrica, sin doble
    contar a quien tiene 2 planes).
  - Nuevos: `activeStudentsMonthPrev` (personas con enrollment cuya
    vigencia intersecta el tramo MTD del mes anterior — el estado actual
    se usa como aproximación, no hay histórico), `pctMenMonth`,
    `pctWomenMonth` (% entero sobre alumnos activos; null sin base) y
    `pctMenMonthPrev` / `pctWomenMonthPrev`.
- **API** series (`class-series.controller`):
  - `CreateSeriesDto.month` pasa a opcional; se persiste el mes actual
    como etiqueta de origen (la columna queda — sin migración) pero la
    vigencia ya no depende de él.
  - Ventana de materialización rodante `hoy UTC → fin del mes
    siguiente` aplicada en create, addSlots y reactivación.
  - Nuevo `AcademyMaterializeService` (extrae `materializeSlot` del
    controller, idempotente) + job diario `academies.class_materialization`
    en el registry (default 03:30) que materializa la ventana para todos
    los slots de series activas — la serie queda efectivamente ilimitada
    hasta `active=false`.
  - `SeriesSlotDto`/`AddSeriesSlotDto` pierden `capacity` y `typeIds`
    (cupos/modalidad son de la serie: `quorum`/`typeIds` de serie →
    defaultQuorum de la academia). `instructorId` por slot se conserva.
- **Web**:
  - KPI strip: deltas absolutos `+N`/`−N`/`=` con "vs mes anterior"
    (`+$N` para monedas, `+N pts` para porcentajes); prop `keys` para
    filtrar cards por página.
  - `/academia/alumnos`: solo activeStudents + pctMen + pctWomen.
  - `/academia/clases` fuera del drawer del owner; entrar con lente
    ACADEMY_OWNER redirige a `/inicio`.
  - Form de serie: sin mes, sin cupos/modalidad por horario, sin botón
    Cancelar; título contextual "Nueva serie de clases".
  - Lista de series: sin etiqueta de mes en la card y mini-form de
    horario sin cupos/modalidad.

## Impact

- Affected specs: `academies/owner-insights` (comparativa + género +
  KPIs del módulo), `academies/class-series` (capability nueva:
  vigencia ilimitada + atributos a nivel serie + formulario),
  `academies/staff-roles` (la consola de instructor no es del owner).
- Affected code: `academies.controller.ts` (dashboard),
  `class-series.controller.ts`, nuevo `class-series-materializer` +
  `academies.scheduler.ts` + `academies.module.ts`; web:
  `academy-kpi-strip.tsx`, `series-form.tsx`, `series/page.tsx`,
  `series/nueva/page.tsx`, `alumnos/page.tsx`, `clases/page.tsx`,
  `BottomNav.tsx`, `shared.ts`, catálogos i18n.
- Sin migraciones: `ClassSeries.month` queda como columna (etiqueta de
  origen / orden del listado); `ClassSlot.capacity`/`ClassSlotType`
  quedan para datos legacy, ya no se escriben.
- Compatibilidad: `month` sigue aceptado en POST (clientes viejos);
  quitar campos del DTO hace que `capacity`/`typeIds` por slot sean
  ignorados por el ValidationPipe whitelist.
