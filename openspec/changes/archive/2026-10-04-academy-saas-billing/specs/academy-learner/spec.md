# Capability: academy-learner (delta SaaS)

Acceso del alumno cuando la academia está bloqueada por mora — la
falta de solvencia del owner no castiga al alumno más allá de lo
necesario.

## ADDED Requirements

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
