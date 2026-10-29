# Tasks; workshop-one-off-class

## Datos

- [x] 1. `ClassSlot.oneOffDate DateTime?` + `Class.cancelledAt
  DateTime?` en schema + `pnpm db:migrate` (sin backfill; null =
  comportamiento actual).

## API

- [x] 2. DTOs: `date?: string` en slot create (`POST /series`),
  `AddSeriesSlotDto`, `UpdateSlotDto`. Validación: formato YYYY-MM-DD,
  no pasada en create/addSlots (400).
- [x] 3. `materializeSlot`: `slot.oneOffDate` → `wanted = [oneOffDate] ∩
  ventana` (ignora weekday). `runDaily`/`SlotLike` propagan el campo.
  `toRevive` excluye `cancelledAt != null` (baja individual no revive).
- [x] 4. Create/addSlots: persistir `oneOffDate` + `weekday` derivado
  cuando llega `date`.
- [x] 5. `updateSlot`: `scheduleChanged = weekdayChanged || oneOffDate
  cambió` → misma cascada (cancel stale + refund + materialize nuevo +
  sync plantel). GET slot/series incluyen `oneOffDate`.
- [x] 6. `POST /academies/:id/classes/:classId/cancel`: instancia
  individual - cancelled+cancelledAt, cascada de reservas, idempotente,
  404 ajena / 400 ya pasada.
- [x] 7. Specs: taller materializa 1 clase; fecha pasada no materializa;
  reprogramar cancela+reembolsa+materializa; plantel propaga; cancel
  instancia solo esa clase + job no revive; instancia pasada 4xx.

## Web

- [x] 8. `series-form`: selector "Serie semanal | Taller / clase única";
  modo taller = date+time único, sin addSlot. Submit con `date`.
- [x] 9. Ficha de serie: fila de slot único muestra fecha + badge
  Taller; acción cancelar por instancia en próximas (ConfirmSheet).
- [x] 10. Ficha de horario: `input[type=date]` cuando `oneOffDate`.
- [x] 11. Types `Slot`/`Series`/`Class` en `shared.ts` + i18n ×4.

## Cierre

- [x] 12. `pnpm --filter @omnidance/api test` + `tsc` web/api limpio.
- [x] 13. `docs/qa-flows-inventory.md` (flujo taller + cancel
  instancia) + spec canónica al archivar. Smoke manual: crear taller,
  reservar, reprogramar fecha, cancelar un feriado de serie recurrente.
