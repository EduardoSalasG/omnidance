# Design; academia-gaps-cierre

## PATCH /enrollments/:id/levels: un nivel por tipo

El contrato no cambia: `levels: [{classTypeId, levelIds[]}]` con
reemplazo completo. Se agrega una validación temprana junto a la de
classTypeId duplicado: tras deduplicar, si alguna entrada trae más de
un `levelId` → `BadRequestException("cada tipo de clase admite un solo
nivel")`. `[]` sigue valiendo "sin nivel en ese tipo". Datos existentes
con multi-nivel no se tocan: colapsan en el próximo PATCH (el editor
ya solo manda uno) o por el seed.

El spec `enrollment-levels.controller.spec.ts` se actualiza: el caso
"reemplazo completo multinivel" pasa a ser el caso 400; se mantiene la
cobertura del reemplazo completo con un nivel por tipo.

## DELETE /academies/:id/class-levels (bulk reset)

Endpoint nuevo en `AcademiesController`, mismo guard que el resto del
mantenedor (`requireCapabilityWrite(..., "schedule")`):

1. `classLevel.findMany({ academyId: id })` → si no hay customs,
   `{ ok: true, deleted: 0 }` (idempotente: ya está en la global).
2. Uso: `classSeries.groupBy(levelId)` y `enrollmentLevel.groupBy
   (levelId)` sobre los ids custom. Si hay referencias →
   `ConflictException` con los nombres en el mensaje
   ("en uso: Pro, Elite") para que la UI muestre qué liberar primero.
   Todo o nada: no borra parcial (la línea quedaría rota con solo los
   niveles bloqueados).
3. `classLevel.deleteMany({ academyId: id })` → `{ ok: true,
   deleted: n }`.

Route ordering: `@Delete(":id/class-levels")` se declara antes o sin
conflicto con `@Delete(":id/class-levels/:levelId")` (Nest resuelve el
path literal vs parametrizado sin ambigüedad).

## UI /academia/niveles

- Card de línea custom gana una zona destructiva al pie (borde
  superior, patrón de consolas): `Button` variant destructiva/ghost
  "Volver a la línea global" → `ConfirmSheet` explica que se borran
  los N niveles propios y vuelve la línea global.
- Confirmar llama al bulk; 409 → `ActionNotice` error con el mensaje
  del server (nombres bloqueados); éxito → `load()` (la vista cambia
  sola a la card global) + notice "Volviste a la línea global".
- i18n: keys nuevas bajo `academy.levelsConfig` (`backToGlobal`,
  `backToGlobalConfirm`, `backToGlobalDone`).

## AcademyKpiCards: paridad de skeleton del slot extra

El `extra` ("Reservas hoy") depende del mismo fetch del dashboard:
aparece con la fila, pero durante la carga la fila muestra 6
skeletons genéricos y no reserva el slot. Cambios mínimos:

- `AcademyKpiCards` renderiza `{extra}` también dentro de la `<ul>`
  de skeleton (el caller decide qué pasa en carga).
- El caller pasa `extra` siempre: con data el `MiniKpi` real, sin data
  un `<li>` skeleton con la forma de la card (mismo `Card` +
  `Skeleton` del patrón).
- El conteo de skeletons pasa de fijo 6 a `keys?.length ?? 6` para que
  la forma anticipe la fila real.

Comentarios stale "multinivel" del editor y del spec se actualizan en
el mismo cambio.
