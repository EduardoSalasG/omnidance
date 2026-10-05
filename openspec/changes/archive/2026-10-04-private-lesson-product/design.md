# Design — private-lesson-product

## Modelo

La clase particular deja de ser una solicitud del alumno y pasa a ser un
producto vendido por la academia:

1. El owner configura `Academy.privateLessonPrice` (precio único — mismo
   valor para todos los instructores; la comisión por instructor ya existe
   en `AcademyInstructor.commissionPct`).
2. El alumno compra desde el perfil de la academia → `Payment` PRIVATE
   `pvt_<academyId>_<uuid>` → gateway.
3. Al PAID el settle crea `PrivateLesson` con `instructorId=null`,
   `scheduledAt=null`, `status=REQUESTED` — semánticamente "pagada,
   pendiente de asignación".
4. El owner la ve en "por asignar" (consola) y ejecuta `assign` con
   instructor + fecha → `CONFIRMED` + snapshot de `commissionPct`.
5. De ahí sigue el ciclo normal: done / cancel / reschedule.

## Decisiones

- **`scheduledAt`/`instructorId` nullables** en vez de fila separada
  "purchase pendiente": una sola entidad que el alumno ya ve en
  `private-lessons/mine` con copy "por agendar". Cero endpoints extra
  para el alumno.
- **`price` de la lección = `unitListPrice` del Payment** (sin fee) — la
  comisión se calcula sobre el precio de lista, no sobre el total cobrado.
- **`commissionPct` se snapshottea en `assign`, no en settle** — en settle
  el instructor aún no existe.
- **POST request → staff-only**: cierra el hueco de "solicitud gratis con
  precio decidido por el cliente" y conserva el uso legítimo (owner crea
  clases manuales). El form de alumno sale de la UI.
- **Fee = `service_fee.membership_clp`** — misma decisión que la clase
  suelta: línea de negocio academy.
- **Cancelación del alumno**: sin cambios — cancela en REQUESTED/CONFIRMED;
  el refund monetario es manual (misma política que clase suelta: el asiento
  se libera, el crédito se perdió/pagó).
- **assign es owner/ADMIN solamente** — la decisión de fecha+instructor es
  del dueño por diseño de producto (confirmado con el usuario).
- **Notificaciones**: settle → notify owner (vendida, asignar); assign →
  notify alumno (clase agendada) + instructor (clase asignada). Best-effort
  vía `notifySafe`, fuera del camino crítico.

## Riesgos

- Lecciones legacy siempre tienen `instructorId`/`scheduledAt` — los JOINs
  manuales deben tolerar null sin romper el shape actual.
- `list` ordena por `scheduledAt asc` — las null quedan primero, que es
  justo lo deseado (las pendientes arriba).
