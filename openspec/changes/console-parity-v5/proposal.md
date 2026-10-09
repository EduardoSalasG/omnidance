# Console parity v5 — auditoría owner + paridad productor

## Why

La consola del dueño de academia quedó con un patrón de interacción
consistente (crear = página dedicada, card completo → detalle, edición
en la ficha, destructivo centrado en rojo, FilterBar + Pager, skeletons,
errores con retry). La auditoría de las 33 páginas del owner encontró
desviaciones residuales, y la consola del productor nunca adoptó ese
patrón: crea inline, cards no navegables y acciones mezcladas en el
listado.

## What Changes

- Auditoría owner (fixes): back link en ficha de alumno, baja de
  colaborador y de serie en zona destructiva roja centrada, alta de
  medio de pago como página dedicada `/configuracion/pagos/nuevo`,
  toggle activar/desactivar en ficha de plan, alumnos del plan enlazan
  a su ficha, `<Spinner>` desnudo → `SkeletonList`, `role="alert"` en
  errores, `h1` duplicado eliminado (el chrome ya lo provee), fallbacks
  "sin acceso" en configuración, comentarios stale de comisión.
- Paridad productor: mismos patrones en eventos, listas de invitados,
  códigos de descuento y cobros: crear → página dedicada, cards →
  detalle, editar/acciones destructivas en la ficha, Pager, FilterBar,
  skeletons y estados de error con retry.

## Impact

- Web: páginas `academia/*` y `eventos`/productor; componentes academy
  y producer.
- i18n: nuevas keys `academy.planDeactivate/planReactivate`,
  `settings.forbidden`, `publicProfile.forbidden` + keys de consola
  productor.
- Sin cambios de API ni schema (los endpoints paginados ya existen).
