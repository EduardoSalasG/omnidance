# Delta: academies/class-series

## ADDED Requirements

### Requirement: Plantel multi-profesor por horario y clase

Un `ClassSlot` SHALL admitir un plantel de uno o más instructores
(`ClassSlotInstructor`: `slotId` + `personId`), además del instructor
principal (`instructorId`, que se conserva como el profesor referente
para comisiones, encuestas y liquidación).

Al materializar clases desde el slot SHALL copiarse el plantel completo
a la instancia (`ClassInstructor`: `classId` + `personId`), de modo que
cada clase refleje a todos sus profesores y no solo al principal.

La consola del instructor SHALL listar las clases donde la persona es
instructora principal O co-instructora (por `Class.instructorId`,
`ClassInstructor`, `ClassSlot.instructorId`, `ClassSlotInstructor` o el
instructor por defecto de la serie).

Las lecturas que exponen el profesor de una clase/serie SHALL incluir la
lista completa de instructores (principal primero), sin romper el campo
singular existente para clientes que solo muestran uno.

#### Scenario: co-teaching en un slot

- **GIVEN** un slot sábado 17:00 con María como instructora principal y
  Eduardo como co-instructor
- **WHEN** se materializan las clases del slot
- **THEN** cada `Class` tiene `instructorId` = María y un
  `ClassInstructor` por cada uno (María y Eduardo)

#### Scenario: mis clases del co-instructor

- **GIVEN** Eduardo es co-instructor (no principal) del slot de sábado
- **WHEN** consulta su consola de instructor
- **THEN** las clases de sábado aparecen en su listado de "mis clases"

#### Scenario: lecturas singulares intactas

- **GIVEN** una clase con dos instructores
- **WHEN** se calcula la comisión del mes o la encuesta de instructor
- **THEN** el sistema usa el instructor principal (`instructorId`), sin
  duplicar ni repartir montos/evaluaciones
