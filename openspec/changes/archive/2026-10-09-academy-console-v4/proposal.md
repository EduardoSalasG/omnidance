# academy-console-v4 — refinamiento de consola + retiro de comisión

## Why

Segunda iteración sobre la consola del owner tras academy-console-v3:
detalles de UX pedidos (cards navegables completos, listas vs cards,
acciones en el nivel correcto) y saneamiento de la deuda detectada en
la auditoría posterior al v3 — sobre todo `commissionPct`, que quedó
semi-muerto: el acuerdo económico (`payType`/`payAmount`/`payClasses`)
lo reemplazó pero el campo seguía editable en Configuración y el API
lo seguía aceptando y snapshotteando en cada clase particular.

## What

### Consola owner (UX)

- **Cobros**: filtros debajo de "Pagos por validar"; historial de
  cobros como lista (no cards); detalle del cobro con referencia de
  transacción/datos de pago completos; el historial incluye pagos
  manuales (claims) y de pasarela.
- **Alumnos**: card completo clickeable; el cambio de estado y
  "pagado hasta" solo se editan en el detalle del alumno; el detalle
  muestra la lista de pagos (plan, inicio, fin).
- **Particulares**: se quita "marcar realizada" — la asistencia la
  marca el instructor desde su clase.
- **Planes**: lista separada en secciones Recurrentes vs Pago único;
  chip activo/desactivado en el card.
- **Equipo**: en detalle de profesor, "Quitar" → "Eliminar" centrado
  en rojo (mismo patrón que "eliminar amigo").
- **Configuración**: "General" se renombra "Clases"; el título de la
  sección pasa a "Valores por defecto"; métodos de pago editables —
  card clickeable → página de detalle/edición (ej. datos de cuenta
  de transferencia); se retira el editor de `commissionPct`.
- **Analítica**: "Consultas rápidas" (guardadas/sistema) arriba de
  los filtros, en bloque expandible cerrado por defecto.

### Deuda

- **`commissionPct` retirado end-to-end**: sale del DTO, del snapshot
  a `PrivateLesson`, del filtro `commission`, de `netClp`/
  `commissionClp` en `mine?as=instructor` y de toda la UI. Las
  columnas quedan en schema como deprecated (sin consumidores).
- **Paginación extendida**: admin user-intel (el `take:500`),
  `/discount-codes`, `/guest-lists`, `GET /academies/:id/videos`.
- **Teardown e2e**: helper compartido `cleanupPeople` con retry ante
  notificaciones async (el flake FK del v3, hoy parcheado en 2 de ~25
  suites).
- **Docs**: `omni-dance.md` se sincroniza con la consola actual.
