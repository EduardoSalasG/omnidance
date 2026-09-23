# academy-learner

## ADDED Requirements

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

La página `/clases` SHALL tener vistas `list | calendar | history | explore`. `list` y `calendar` SHALL mostrar solo clases de academias con inscripción vigente (`browse?scope=enrolled`); `explore` SHALL mostrar todas las academias (`browse` sin scope). `history` SHALL seguir incluyendo todas las clases pasadas del alumno, esté inscrito actualmente o no.

#### Scenario: Lista por defecto acotada

- WHEN un alumno inscrito abre /clases
- THEN la lista muestra solo clases de sus academias, agrupadas por día/hora

#### Scenario: Explorar sin inscripción en una academia

- WHEN un alumno abre view=explore y una clase es de una academia sin inscripción vigente
- THEN la card muestra un estado "requiere inscripción" en vez del botón Reservar

#### Scenario: Sin inscripciones vigentes

- WHEN un alumno sin inscripciones vigentes abre /clases (list o calendar)
- THEN ve un empty state con CTA hacia explorar

### Requirement: Filtro Todas | Reservadas en lista y calendario

Las vistas `list` y `calendar` SHALL ofrecer un filtro segmentado `scope=todas|reservadas`. `reservadas` SHALL listar las reservas futuras del alumno (BOOKED/WAITLIST) como cards wallet con link al QR — la vista `mine` desaparece y `view=mine` legado SHALL redirigir a `list + scope=reservadas`.

#### Scenario: Ver solo lo reservado en lista

- WHEN un alumno con reservas activa el filtro Reservadas en lista
- THEN ve sus reservas agrupadas por día con badge de estado y acceso al QR

#### Scenario: Reservadas en calendario

- WHEN un alumno activa Reservadas en calendario
- THEN los dots del strip semanal y las cards del día seleccionado reflejan solo sus reservas

#### Scenario: Deep link legado

- WHEN se abre /clases?view=mine
- THEN se muestra la lista en scope Reservadas
