# Handoff; taller único + cancel por instancia + fixes ficha horario

**Rama**: `dev` · **Commits**: `10f7a486` (fixes) + `c6484592` (feature)
**Change OpenSpec**: `workshop-one-off-class` archivado → spec canónica
`openspec/specs/academies/class-series` actualizada (+3 requirements).

## Qué quedó hecho

### Fixes (commit 10f7a486)
- Keys de roster mal anidadas: `instructor.*` → `academySeries.*` ×4
  locales (label mostraba key cruda).
- Ficha horario 404: usaba `params.id` (seriesId) como academyId; ahora
  `academy.id` del AcademyGate + key remount.
- `updateSlot` propagaba plantel solo al slot: ahora reescribe
  `ClassInstructor` + `Class.instructorId` de clases futuras vigentes.
- Cambio de `weekday`: cancela clases del día viejo (refund bookings) y
  rematerializa el día nuevo (antes quedaban huérfanas).
- Drift spec reparado: `class.count` en fake + expectativa soft-delete
  de `deleteSlot` + test hard delete sin clases.

### Feature taller + cancel instancia (commit c6484592)
- Migración `20261029150000_slot_oneoff_class_cancelled_at`:
  `ClassSlot.oneOffDate`, `Class.cancelledAt` (ya aplicada en dev).
- Slots con `date` (YYYY-MM-DD) materializan solo esa fecha; `weekday`
  queda derivado informativo. `date` > `weekday` en payload.
- Reprogramar fecha = misma cascada que cambio de weekday (cancel
  stale + refund + materialize + sync plantel). `date` inválida o
  pasada → 400 (create, addSlots y PATCH).
- `POST /academies/:id/classes/:classId/cancel`: baja individual
  (cancelled+cancelledAt), reservas refunded, idempotente, 404 ajena/
  pasada. `cancelledAt` distingue baja manual de cascada: materialize
  solo revive `cancelledAt IS NULL`.
- Web: selector Serie semanal|Taller en `series-form` (radio chips),
  fila taller con fecha + Badge, cancel por instancia en "Próximas"
  (ConfirmSheet), ficha horario con `input[type=date]` en taller.
- i18n ×4: keys nuevas bajo `academySeries` (kindLabel, kindRecurring,
  kindOneOff, slotsOneOff, dateLabel, workshopBadge, cancelClass,
  cancelClassDesc).

## Verificación (G3)

- `class-series.controller.spec.ts` 17/17 + `materialize.spec.ts` 7/7
- `tsc --noEmit` api y web: limpio
- `i18n-audit` ALL_KEYS_OK · `i18n-parity` missing 0
- Suite academies: 286/288 (2 fallos `calendarIcs` PRE-EXISTENTES:
  spec espera `SUMMARY:X; Academia`, código emite ` - `; drift del
  barrido de puntuación, pendiente decidir cuál es el formato correcto)

## Notas / pendientes

- **Smoke manual pendiente**: crear taller desde el form, reservar,
  reprogramar fecha, cancelar un feriado en serie recurrente. Stack
  corre en background (shell dev pnpm dev).
- `addSlots` en ficha de serie solo ofrece weekday (un taller puede
  recibir slot recurrente; modelo lo permite, UI no ofrece fecha ahí).
- Sin "descancelar" instancia ni traspaso de reservas al reprogramar
  (documentado fuera de scope en el change archivado).
- Mini-form agregar horario no soporta `date` (decisión consciente).
