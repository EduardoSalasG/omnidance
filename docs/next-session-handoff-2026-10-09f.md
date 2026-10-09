# Handoff — academy-console-v4 (ajustes de consola + deuda)

Fecha: 2026-10-09 · Rama: `dev` · Change OpenSpec: `academy-console-v4`
(archivado con este commit)

## Qué se hizo

### Ajustes de consola (pedido del usuario, 7 slices)

1. **Cobros**: FilterBar debajo de "Pagos por validar" (arriba del
   historial); historial como lista compacta; detalle de claim con
   `paymentId` + `refId` (n° transacción del pago MANUAL vinculado) y
   detalle de pago con `gatewayRef`/canal/fecha-orden. El historial
   mezcla claims MANUAL + pagos de pasarela.
2. **Alumnos**: card completo clickeable (Link envuelve la Card);
   edición de estado + "pagado hasta" movida a
   `/academia/alumnos/[personId]` (PATCH `/enrollments/:id`,
   `enrollmentId`+`canEdit` en `studentDetail`); lista de pagos del
   alumno con plan/inicio/fin en la ficha.
3. **Particulares**: `done` solo del instructor asignado — UI no la
   muestra al owner y backend responde 403 (escape: `admin.access`).
4. **Planes**: secciones "Recurrentes"/"Pago único" + chip
   activo/desactivado por card.
5. **Equipo**: botón de baja del profesor → "Eliminar" centrado rojo
   (patrón eliminar-amigo), key `removeInstructor`.
6. **Configuración**: nav "General"→"Clases", título→"Valores por
   defecto"; métodos de pago como cards clickeables →
   `/academia/configuracion/pagos/[methodId]` (editar label/datos
   transferencia/link/instrucciones/orden/activo + eliminar).
7. **Analítica**: "Consultas rápidas" (SavedQueries) movido arriba de
   los tabs de entidad/filtros, colapsable (Chevron), **cerrado por
   defecto**.

### Deuda

- **`commissionPct` retirado de toda vía activa**: sin snapshot en
  create/assign (lecciones nuevas nacen con 0), sin DTO
  (`UpdateInstructorDto`), sin UI (editor de settings), sin columnas ni
  filtro en la entidad `private_lessons` de analítica; listado/detalle
  solo lo incluyen en filas `>0` (histórico) para owner/ADMIN/instructor
  de la clase; `mine` deriva `commissionClp`/`netClp` solo en histórico.
  Columnas + `pay-commission` se conservan para liquidar el histórico —
  **sin migración destructiva**. El acuerdo vigente es
  `payType/payAmount/payClasses`.
- **Paginación**: `GET /events/mine`, `GET /discount-codes`,
  `GET /events/:id/guest-lists`, `GET /academies/:id/videos` con envelope
  `{items,total,page,pageSize}` (mismo contrato `console-lists`); stats
  de `events/mine` por página; `q` de guest-lists filtra antes de cortar
  (post-join); pickers con `pageSize` acotado. Admin user-intel
  **verificado**: detalles por persona con `take` por diseño — sin
  envelope.
- **Teardown e2e**: helper compartido `cleanupPeople` en
  `apps/api/test/helpers.ts` (retry ante notificaciones async); 25
  suites migradas.
- **`omni-dance.md`** sincronizado (economía SaaS, acuerdo vs comisión,
  modelos retirados).

## Verificación (evidencia)

| Check | Resultado |
|---|---|
| `openspec validate academy-console-v4` | válido |
| `tsc --noEmit` API + web | limpio |
| Suite API completa | 92 archivos / 1790 tests — todo verde tras fix del fake `event.count` en `events.controller.spec` |
| i18n audit | `ALL_KEYS_OK` |
| `impeccable detect --json` (24 archivos web del diff) | `[]` |
| Docs API | `openapi.json` + Postman regenerados (270 paths) |

## Gap conocido (documentado, no nuevo)

Los endpoints con query por DTO (`@Query() dto`) no exportan sus params
en openapi.json — convención pre-existente (claims/crm/producer-claims
vienen igual desde v3). Los nuevos (`events/mine`, `guest-lists`,
`discount-codes`) quedaron igual. Los que bindean `@Query("x")`
individuales sí exportan params (con `required:true` — quirk del
exportador, también pre-existente).

## Próximo slice sugerido

- QA visual manual de la consola (las vistas nuevas/movidas: detalle de
  cobro, ficha de alumno con edición, detalle de método de pago).
- `dev → main` sigue pendiente del release gate del usuario.
