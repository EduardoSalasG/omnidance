# instructor-console-quorum — consola del profesor + quorum parametrizable

INSTRUCTOR existe como rol y ya tiene acceso de gestión vía
requireManage, pero no tiene superficie propia ni visibilidad de
roster. Además el "quórum" (cupos de la clase) hoy es solo
slot.capacity fijo — debe heredar: clase → slot → serie → academia.

## Alcance

1. **Schema**: `Academy.defaultQuorum Int?`, `ClassSeries.quorum Int?`,
   `ClassSlot.capacity` → nullable (null = hereda), `Class.capacity Int?`
   (override puntual). Resolución efectiva:
   class.capacity → slot.capacity → series.quorum → academy.defaultQuorum → 20.
2. **API instructor**: `GET /classes/teaching` (clases asignadas al
   instructor en todas sus academias), `GET /classes/:id/roster`
   (detalle + reservados + quorum efectivo; requireManage),
   `GET /academies/:id/students/:personId` (historial + próximas
   reservas; requireManage), `PATCH /academies/:id/settings`
   {defaultQuorum} (requireAdminister = solo owner/admin).
3. **Series/slots**: `quorum` en create/update de serie; capacity de
   slot opcional (null hereda). Booking y browse usan el quorum efectivo.
4. **Web**: vista instructor en /academia (mis clases + roster +
   quórum), perfil de alumno /academia/alumnos/[id] (historial +
   reservas futuras), campo quorum en form de serie y settings de
   academia (solo owner).
5. **Nav**: DJ pierde el tab QR (su acceso es por lista/staff, no por
   QR personal); INSTRUCTOR mantiene /academia + Asistencia.

## Fuera de scope

- Cancelación automática de clases bajo quórum (el quórum es
  informativo — no bloquea ni cancela la clase).
- Notificación a alumnos cuando el profesor cambia.
