# Tasks — academy-owner-console-v2

## 1. API — series ilimitadas

- [x] 1.1 `AcademyMaterializeService`: `rollingDates()` (hoy UTC → fin
  del mes siguiente), `materializeSlot(tx, slot, dates)` extraído del
  controller, `runDaily()` sobre slots de series activas.
- [x] 1.2 Spec RED del materializador + create/update sin month (ventana
  rodante, idempotencia, month persistido = mes actual).
- [x] 1.3 `ClassSeriesController`: `month` opcional; create/addSlots/
  reactivación usan la ventana rodante; DTOs sin `capacity`/`typeIds`
  por slot (quedan solo `weekday`, `startTime`, `endTime`,
  `instructorId`).
- [x] 1.4 `AcademiesScheduler`: registra `academies.class_materialization`
  (default `30 3 * * *`); provider en `academies.module.ts`.

## 2. API — dashboard KPIs

- [x] 2.1 Helper de dominio puro `computeActiveStudentsKpis` (personas
  únicas, ventana previa, split de género) + spec RED.
- [x] 2.2 `dashboard()`: `activeStudentsMonth` por personas únicas;
  `activeStudentsMonthPrev`, `pctMenMonth`, `pctWomenMonth`,
  `pctMenMonthPrev`, `pctWomenMonthPrev`.

## 3. Web

- [x] 3.1 `shared.ts`: campos nuevos de `AcademyDashboard.kpis`.
- [x] 3.2 `academy-kpi-strip.tsx`: prop `keys`, delta absoluto
  `+N`/`−N`/`=` (CLP en monedas, pts en porcentajes), cards pctMen/
  pctWomen.
- [x] 3.3 `alumnos/page.tsx`: `keys={["activeStudents","pctWomen","pctMen"]}`.
- [x] 3.4 `BottomNav.tsx`: quitar `/academia/clases` del drawer
  ACADEMY_OWNER; label override `/academia/series/nueva` → "Nueva serie
  de clases" (sin volverla raíz — conserva el ‹ back).
- [x] 3.5 `clases/page.tsx`: redirect `/inicio` cuando la lente activa
  es ACADEMY_OWNER.
- [x] 3.6 `series-form.tsx`: sin month, SlotDraft sin capacity/typeIds,
  payload sin esos campos, sin botón Cancelar.
- [x] 3.7 `series/page.tsx`: mini-form sin cupos/modalidad, card sin
  etiqueta de mes.
- [x] 3.8 i18n: `academySeries.newTitle`, `kpis.pctMen/pctWomen/pts` +
  hints; retirar keys huérfanas (`month`, `monthHint`, `capacity`,
  `capacityOptional`, `slotTypes`, `slotTypesHint`); texto de
  `addSlotHint` a ventana rodante.

## 4. Integración

- [x] 4.1 API build + tests academies verdes; web `tsc` limpio; i18n
  audit; `impeccable detect` sobre el diff; `openspec validate`.
- [x] 4.2 Regenerar `docs/openapi.json` + postman (DTOs cambiaron).
- [x] 4.3 Archivar el change.
