# Fix: lente INSTRUCTOR sin privilegios heredados + transferencias en seed

## Por qué

Tres brechas reportadas en la consola del instructor:

1. **`/academia/alumnos`**: la página resuelve permisos por roles crudos
   (`me.roles.includes("ADMIN")`, `caps.students`) y no por la lente
   activa. Una persona con ADMIN/owner/staff navegando con la lente
   INSTRUCTOR ve la sección Insights — incluida "quienes pagaron más
   este mes" — que la spec `academies/staff-roles` prohíbe bajo esa
   lente. Además `GET /students/insights` devuelve `topPayersMonth` a
   cualquier `requireManage` (incl. instructor puro): fuga de datos de
   pago por API.
2. **Ficha de alumno**: `canEdit` viene del backend por rol real, así
   que bajo la lente INSTRUCTOR un admin/staff todavía ve el editor de
   estado de inscripción y fecha. La spec exige que el instructor solo
   modifique asistencia de sus clases (la mutación ya está protegida
   por `requireCapabilityWrite("students")` en `PATCH /enrollments/:id`
   y por roster en `POST /classes/:id/attendance` — falta alinear la UI
   a la lente).
3. **`/academia/clases`**: los inputs `desde`/`hasta` del FilterBar se
   estiran y se sobreponen — el grid `grid-cols-2` revienta porque los
   `input[type=date]` imponen su min-content width y los `<label>` no
   tienen `min-w-0`. El defecto es del componente compartido: se
   replica en todo listado con filtros de fecha.

Además: el seed solo daba medios de pago a 3 academias y a ningún
productor. Se pide transferencia habilitada con datos de cuenta para
**todas** las academias y **todos** los productores (cubre todos sus
eventos, porque el método propio es por productor).

## Qué cambia

- `academia/alumnos` y `academia/alumnos/[personId]` y
  `alumnos/nuevo`: la lente INSTRUCTOR activa (`useActiveRole`) degrada
  la vista a instructor puro — sin KPIs/insights/importación/CTA y sin
  editor de enrollment aunque la persona tenga más privilegios reales.
- `GET /academies/:id/students/insights`: `topPayersMonth` solo se
  computa/devuelve para viewers con capacidad `payments` (owner, ADMIN
  o staff con el flag); el resto recibe `[]` — el backend deja de
  filtrar montos a quien no puede ver cobros.
- `FilterBar`: `min-w-0` en labels del grid e inputs/selects → los
  filtros de fecha ocupan su celda sin desbordar ni tapar al vecino en
  todas las superficies que lo usan (instructor, owner, productor,
  admin, analítica).
- `seed-dev.ts`: backfill idempotente al final del seed — toda academia
  sin TRANSFER recibe uno activo con datos de cuenta generados
  (banco, tipo, número, titular, RUT, email); todo Person con rol
  PRODUCER aprobado sin TRANSFER recibe `ProducerPaymentMethod` activo.
  Métodos existentes solo se reactivan si estaban `active:false`, sin
  pisar `details` (data real editable en consola).

## Out of scope

- Rediseñar qué ve el instructor en `/academia` hub o en la ficha más
  allá de lo pedido (historial de pagos del alumno sigue visible — es
  contexto de asistencia, no mutación).
- Enviar la lente al backend: la lente es un concepto de vista
  client-side; el backend ya es autoridad por rol real.
