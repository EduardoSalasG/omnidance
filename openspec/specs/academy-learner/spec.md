# academy-learner Specification

## Purpose
Journey del alumno dentro de una academia: inscripciones y progreso
personal, descubrimiento y reserva de clases (scopes explorar/
reservadas/historial con calendario), compra de productos
(membresía, taller, trial, clase particular) y las clases
particulares 1:1 como reservas del alumno dentro de /clases.

## Requirements

### Requirement: El alumno puede listar sus inscripciones

`GET /academies/enrolled` SHALL devolver las inscripciones del autenticado con `{academy:{id,name}, status, plan:{name,type}|null, startedAt, attendance30d}` — asistencias de los últimos 30 días en esa academia como progreso personal no competitivo. Requiere sesión; no requiere permisos de gestión.

#### Scenario: Alumno con inscripción activa

- WHEN un dancer con Enrollment ACTIVE consulta /academies/enrolled
- THEN recibe su academia con status, plan y attendance30d

#### Scenario: Sin inscripciones

- WHEN un usuario sin enrollments consulta /academies/enrolled
- THEN recibe [] (no error)

### Requirement: El alumno puede ver su historial de clases

`GET /classes/mine?scope=past` SHALL devolver las clases pasadas del autenticado (reservas + asistencias, dedup por classId donde la asistencia prevalece), orden descendente por fecha, con `status: attended|booked|cancelled`. Sin `scope` mantiene el comportamiento actual (reservas futuras BOOKED/WAITLIST).

#### Scenario: Historial con asistencia

- WHEN un alumno reservó y asistió a una clase pasada
- THEN el historial la lista una vez con status "attended"

#### Scenario: Reserva sin asistencia

- WHEN un alumno reservó una clase pasada sin asistir
- THEN el historial la lista con status "booked"

### Requirement: Navegación learner no expone la consola de gestión

La lente academia del DANCER SHALL enlazar solo a superficies de alumno (/clases, /academias). El hero de /inicio con próxima clase SHALL apuntar a /clases, nunca a /academia (consola owner/instructor).

#### Scenario: Dancer con próxima clase

- WHEN un dancer en lente academia tiene una clase próxima
- THEN el hero de /inicio enlaza a /clases con copy de alumno

### Requirement: El alumno explora clases priorizando sus academias

`GET /classes/browse` SHALL aceptar `scope=enrolled` para acotar el listado a las academias donde el autenticado tiene Enrollment en `ACTIVE | TRIAL | ONLINE` (`PAUSED`/`FROZEN` no cuentan). Sin `scope` mantiene `all` (todas las academias activas). Cada item SHALL incluir `enrolled: boolean` — vigencia de inscripción del autenticado en la academia de la clase — para resolver el CTA de reserva sin query extra.

#### Scenario: Alumno inscrito en una academia

- WHEN un dancer con Enrollment ACTIVE en academia A consulta `/classes/browse?scope=enrolled`
- THEN recibe solo clases de academia A, cada una con `enrolled: true`

#### Scenario: Alumno sin inscripciones vigentes

- WHEN un dancer con Enrollment PAUSED (o sin enrollments) consulta `/classes/browse?scope=enrolled`
- THEN recibe `[]`

#### Scenario: Explorar todas las academias

- WHEN un dancer consulta `/classes/browse` sin `scope`
- THEN recibe clases de todas las academias activas; las de academias sin inscripción vigente llegan con `enrolled: false`

### Requirement: Reservar clase exige inscripción vigente

`POST /classes/:id/book` SHALL verificar que el autenticado tenga Enrollment en `ACTIVE | TRIAL | ONLINE` en la academia de la clase; sin ella responde `403` sin crear ni reactivar reserva. `GET /classes/:id` SHALL incluir `enrolled: boolean` con la misma regla, para que la ficha y el CTA reflejen la elegibilidad.

#### Scenario: Reserva con inscripción vigente

- WHEN un alumno con Enrollment ACTIVE en la academia de la clase hace POST /classes/:id/book
- THEN se crea la reserva (BOOKED o WAITLIST según cupo) como hoy

#### Scenario: Reserva sin inscripción vigente

- WHEN un alumno sin Enrollment vigente en la academia de la clase hace POST /classes/:id/book
- THEN recibe 403 y no se crea ni modifica ninguna reserva

#### Scenario: Reserva con inscripción pausada

- WHEN un alumno con Enrollment PAUSED en la academia hace POST /classes/:id/book
- THEN recibe 403

### Requirement: /clases separa "mis academias" de "explorar"

La página `/clases` SHALL tener scopes `s=mias | explorar | historial` (con layout `v=list | calendar` en mias/explorar). `mias` SHALL mostrar solo clases de academias con inscripción vigente (`browse?scope=enrolled`); `explorar` SHALL mostrar todas las academias (`browse` sin scope). `historial` SHALL seguir incluyendo todas las clases pasadas del alumno, esté inscrito actualmente o no.

#### Scenario: Lista por defecto acotada

- WHEN un alumno inscrito abre /clases
- THEN la lista muestra solo clases de sus academias, agrupadas por día/hora

#### Scenario: Explorar sin inscripción en una academia

- WHEN un alumno abre s=explorar y una clase es de una academia sin inscripción vigente
- THEN la card muestra un estado "requiere inscripción" en vez del botón Reservar

#### Scenario: Sin inscripciones vigentes

- WHEN un alumno sin inscripciones vigentes abre /clases (list o calendar)
- THEN ve un empty state con CTA hacia explorar

### Requirement: Filtro Todas | Reservadas en lista y calendario

El scope `mias` (en layouts list y calendar) SHALL ofrecer un filtro segmentado `scope=todas|reservadas`. `reservadas` SHALL listar las reservas futuras del alumno (BOOKED/WAITLIST) como cards wallet con link al QR — la vista `mine` desaparece y `view=mine` legado SHALL redirigir a `s=mias + scope=reservadas`.

#### Scenario: Ver solo lo reservado en lista

- WHEN un alumno con reservas activa el filtro Reservadas en lista
- THEN ve sus reservas agrupadas por día con badge de estado y acceso al QR

#### Scenario: Reservadas en calendario

- WHEN un alumno activa Reservadas en calendario
- THEN los dots del strip semanal y las cards del día seleccionado reflejan solo sus reservas

#### Scenario: Deep link legado

- WHEN se abre /clases?view=mine
- THEN se muestra la lista en scope Reservadas

### Requirement: Academia bloqueada excluida de exploración

`GET /academies` y `/classes/browse` SHALL excluir academias con
`billingBlockedAt` no nulo. La ficha pública de una academia bloqueada
SHALL renderizar estado "no disponible" sin CTAs de compra ni reserva.

#### Scenario: Explorar sin academias morosas

- **GIVEN** academia A bloqueada y B solvente **WHEN** el bailarín
  abre `/academias?s=explorar` **THEN** solo B aparece.

### Requirement: Reservas y compras bloqueadas por mora

`POST /classes/:id/book`, checkout de membresía, drop-in y particular
de una academia bloqueada SHALL rechazar con 400/403 y copy "la
academia no está disponible por el momento". Las inscripciones
existentes SHALL seguir listándose en `/academias?s=mias` con un
indicador honesto del estado.

#### Scenario: Alumno de academia morosa

- **GIVEN** alumno con enrollment ACTIVE en academia bloqueada
  **THEN** sigue viéndola en "mis academias" (con indicador), ve su
  historial de asistencias, pero no puede reservar ni comprar.

### Requirement: Preservación de datos del alumno

El bloqueo SHALL afectar solo operaciones nuevas: historial de
asistencias, enrollments y pagos pasados del alumno SHALL permanecer
visibles.

#### Scenario: Historial intacto

- **GIVEN** alumno con 12 asistencias en academia bloqueada **THEN**
  `/academia` del alumno y `GET /me` siguen mostrando su enrollment y
  asistencias.

### Requirement: Particulares del alumno dentro de reservadas

Las clases particulares del alumno SHALL aparecer en "Reservadas" de
`/clases` como un item más, sin bandeja ni página separada. Las
agendadas (REQUESTED/CONFIRMED con `scheduledAt`) SHALL intercalarse
por fecha entre las reservas de clase (lista y calendario); las
compradas sin asignar SHALL agruparse al inicio con estado "por
agendar". La card SHALL mostrar academia, instructor (o "por asignar"),
estado y acción cancelar mientras la clase esté activa
(REQUESTED/CONFIRMED). Las particulares DONE/CANCELLED SHALL aparecer
en el scope historial.

#### Scenario: Particular agendada entre reservas

- **GIVEN** alumno con una reserva de clase el lunes y una particular
  CONFIRMED el martes **WHEN** abre `/clases?scope=reservadas`
  **THEN** ambas aparecen en orden cronológico, la particular con su
  academia, instructor y estado.

#### Scenario: Particular por agendar

- **GIVEN** alumno que compró una particular aún sin asignar
  **WHEN** abre reservadas **THEN** la ve primero con estado "por
  agendar" — el pago nunca queda invisible.

#### Scenario: Sin bandeja separada

- **WHEN** el alumno navega `/clases/particular` **THEN** la ruta no
  existe; las notificaciones `academy.private_lesson.*` abren
  `/clases?scope=reservadas`.
