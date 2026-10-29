# Handoff 2026-10-29 - Horarios: soft-delete + roster de profesores

## Qué se implementó (commit en dev)

- **Fix 500 al eliminar horario**: `Class.slot` es Restrict; con clases
  pasadas el hard delete rompía por FK. Ahora `DELETE /academies/:id/slots/:slotId`
  cancela clases futuras + reservas y hace **borrado lógico** (`ClassSlot.deletedAt`)
  cuando hay historial; hard delete solo si nunca tuvo clases.
- **Roster de serie (`ClassSeriesInstructor`)**: migración
  `20261029000000_slot_soft_delete_series_roster`. El multiselect del
  form de serie habilita profesores; `instructorId` queda como primario.
- **Plantel por horario (multi)**: `instructorIds[]` en create/update de
  serie, addSlots y nuevo `PATCH /academies/:id/slots/:slotId`. El API
  auto-une al roster (compat import/legacy); la UI solo ofrece habilitados.
- **Ficha de horario**: `/academia/series/[id]/horarios/[slotId]` - el tap
  en la fila del horario abre el detalle; ahí se edita día/hora, se asigna
  plantel (InstructorChecklist) y se elimina (zona de peligro).
- Materialize filtra `deletedAt: null`. i18n ×4.

## Para probar (usuario)

1. `/academia/series/[id]` -> tocar un horario -> ficha: editar día/hora,
   asignar varios profes, guardar; eliminar desde la zona de peligro.
2. Eliminar un horario con clases pasadas (el que antes daba 500).
3. Editar serie: multiselect "Profesores" habilita el roster; el select
   de horario nuevo solo muestra los habilitados.
4. Verificar que una clase con slot asignado muestre el profe correcto
   (ya no "todas heredan el de la serie" salvo que el slot lo defina).

## Pendiente honesto

- Fix de zona horaria previo (timeZone UTC en series/profesor) aplicado;
  validar visual.
- Specs del controller pueden tener drift por el nuevo shape (instructorIds);
  correr `pnpm --filter @omnidance/api test` antes del próximo release.
