# academy-learner

## ADDED Requirements

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
