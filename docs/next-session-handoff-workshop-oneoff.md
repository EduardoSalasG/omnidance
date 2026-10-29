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

- **Smoke manual hecho (2026-10-29)**: owner creó academia + datos +
  publicación + serie + horario + taller; dancer se inscribió al plan y
  agendó clase. Quedan por probar manualmente: reprogramar fecha de
  taller (cascada refund+rematerialize) y cancel por instancia en serie
  recurrente (feriado).
- `addSlots` en ficha de serie solo ofrece weekday (un taller puede
  recibir slot recurrente; modelo lo permite, UI no ofrece fecha ahí).
- Sin "descancelar" instancia ni traspaso de reservas al reprogramar
  (documentado fuera de scope en el change archivado).
- Mini-form agregar horario no soporta `date` (decisión consciente).

## TRABAJO EN CURSO (retomar aquí)

**Mover cancel por instancia del listado a la ficha de clase** (pedido
del usuario: "el botón debe estar dentro del detalle, no en el listado").

- QUITAR de `apps/web/src/app/[locale]/(app)/academia/series/[id]/page.tsx`:
  fn `cancelClass` (~l.318), botón X por fila (~l.600), `confirm.kind==="class"`
  del state y sus entradas en ConfirmSheet (~l.690-708), comentario l.110.
- AGREGAR a `apps/web/src/app/[locale]/(app)/academia/clases/[id]/page.tsx`
  (componente `RosterDetail`): zona roja Card `border-red-500/30` al pie +
  ConfirmSheet → `POST /academies/{academyId}/classes/{classId}/cancel`.
  AcademyId: revisar type `ClassRoster` en `components/academy/shared.ts`
  (roster.class probablemente trae academyId; si no, agregar al endpoint
  GET /classes/:id/roster). Labels: reuse `useTranslations("academySeries")`
  → `cancelClass`/`cancelClassDesc` (keys ya existen ×4). Mostrar solo si
  la clase no está cancelada y es futura; gatear por cap manage (revisar
  si ClassRoster expone canManage; si solo canMark=instructor, el POST
  igual falla por cap schedule → ocultar o dejar que 403 falle limpio).
- Verificar: `pnpm exec tsc --noEmit` web + `i18n-audit`/parity; commit.

**QA del usuario ya hecho**: cancel instancia borró la del 4/11 OK;
reprogramación de taller al 8 funcionó (cascada OK).

### Hallazgos para el move (ya investigado)

- `GET /classes/:id/roster` (classes.controller.ts ~l.1231): `class`
  ya devuelve `academyId` (l.1328). Falta: `cls.cancelled` en select y
  flag `canCancel` = try/catch de `requireCapabilityWrite(academyId,
  person, "schedule","classes")` (academy-access.service.ts l.206).
- Web `ClassRoster` (shared.ts l.407): agregar `academyId: string`,
  `cancelled: boolean`, `canCancel: boolean` en `class`/top.
- `RosterDetail` (academia/clases/[id]/page.tsx): zona roja cuando
  `roster.canCancel && !roster.class.cancelled`; tras cancel → `load()`
  del parent (pasar callback) o `location.reload()`. i18n:
  `useTranslations("academySeries")` → cancelClass/cancelClassDesc ya
  existen.
