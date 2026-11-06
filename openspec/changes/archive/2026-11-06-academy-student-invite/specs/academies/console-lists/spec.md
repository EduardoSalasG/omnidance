## ADDED Requirements

### Requirement: Registro parcial con invitación en el alta de alumno

`POST /academies/:id/enrollments` SHALL aceptar `email`+`name` como
alternativa a `personId`. Sin personId el email es requerido (400 si
falta). Con email inexistente se SHALL crear un stub de Person y
enviar magic link de invitación (best-effort) para que complete su
cuenta; la respuesta incluye `invited: true`. El resto del flujo
(plan, estado, vigencia, niveles iniciales) es idéntico al alta por
personId.

#### Scenario: alta con persona inexistente

- **GIVEN** un owner en /academia/alumnos/nuevo cuya búsqueda no
  encuentra candidatos
- **WHEN** registra email+nombre y envía el alta
- **THEN** se crea el stub + la inscripción y la persona recibe la
  invitación por mail

#### Scenario: email existente no duplica

- **WHEN** el email ya pertenece a una Person
- **THEN** se reutiliza su registro sin crear stub ni enviar
  invitación (`invited: false`)
