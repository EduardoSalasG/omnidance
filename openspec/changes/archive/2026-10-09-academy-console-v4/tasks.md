# Tasks — academy-console-v4

## 1. Cobros
- [x] 1.1 Filtros debajo de "Pagos por validar" (FilterBar movida bajo
     ClaimsQueue, arriba del historial).
- [x] 1.2 Historial de cobros como lista (rows compactas, sin cards).
- [x] 1.3 Detalle de cobro: `paymentId` + `refId` (n° transacción) en
     claim detail y `gatewayRef`/canal/fecha-orden en payment detail;
     el historial mezcla claims MANUAL + pagos de pasarela.

## 2. Alumnos
- [x] 2.1 Card completo clickeable (`<Link>` envuelve toda la card);
     sin selects ni edición inline de estado/pagado-hasta.
- [x] 2.2 Detalle: edición de estado + "pagado hasta" (PATCH
     enrollments/:id, `enrollmentId` + `canEdit` en studentDetail);
     lista de pagos/enrollments con plan, inicio y fin.

## 3. Particulares
- [x] 3.1 "Marcar realizada" fuera del owner: UI no la muestra y
     backend rechaza `done` desde owner con 403 (instructor asignado
     o admin.access como escape). Test de regresión.

## 4. Planes
- [x] 4.1 Secciones "Recurrentes" / "Pago único".
- [x] 4.2 Chip activo/desactivado en cada card de plan.

## 5. Equipo
- [x] 5.1 Profesor: "Quitar"→"Eliminar" centrado en rojo (mismo
     patrón visual que eliminar-amigo).

## 6. Configuración
- [x] 6.1 Nav "General"→"Clases"; título de la sección→"Valores por
     defecto".
- [x] 6.2 Métodos de pago: card clickeable →
     `/academia/configuracion/pagos/[methodId]` con edición (label,
     datos de transferencia, link, instrucciones cash, orden,
     activo, eliminar).
- [x] 6.3 Editor de `commissionPct` retirado de
     `academia/configuracion/general` (acuerdo económico lo reemplaza).

## 7. Analítica
- [x] 7.1 "Consultas rápidas" (SavedQueries) sobre los tabs de
     entidad, colapsable con `Chevron`, cerrado por defecto.

## 8. Deuda
- [x] 8.1 `commissionPct` fuera de escritura/exposición activa:
     create/assign no lo escriben (default 0); UpdateInstructorDto
     ya no lo acepta; vista staff expone el acuerdo económico; listado
     y detalle solo lo incluyen en filas históricas `>0`; `mine`
     deriva netClp/commissionClp solo en histórico; entidad de
     analítica sin filtro ni columnas de comisión. Columnas y
     `pay-commission` se conservan para liquidar histórico.
- [x] 8.2 Paginación: `/events/mine`, `/discount-codes`,
     `/events/:id/guest-lists`, `/academies/:id/videos` con envelope
     `{items,total,page,pageSize}`; consumidores web y specs/e2e
     migrados; pickers con `pageSize` acotado. Admin user-intel
     verificado: detalles por persona con `take` fijos por diseño —
     no requiere envelope.
- [x] 8.3 Helper e2e `cleanupPeople` (test/helpers/cleanup.ts) con
     retry ante notificaciones async; 25 suites migradas.
- [x] 8.4 omni-dance.md sincronizado (economía SaaS, acuerdo
     económico vs comisión, modelos retirados).
- [x] 8.5 Vocabulario de filtros módulos↔analítica verificado: todas
     las listas operativas usan FilterBar/EntityDef/QueryFilters del
     paquete compartido; los selects restantes son sort/formularios.

## 9. Verificación
- [x] 9.1 Spec deltas escritos y `openspec validate` verde.
- [x] 9.2 tsc API + web limpio; suite API 92 archivos/1790 tests verde.
- [x] 9.3 i18n audit `ALL_KEYS_OK`; `impeccable detect` → `[]`.
- [x] 9.4 Docs API regeneradas; handoff 2026-10-09f; commit.
