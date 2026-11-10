# Delta: academies/student-invites (academy-invite-first-polish)

## ADDED Requirements

### Requirement: Invitación como camino principal de alta

En `/academia/alumnos` la invitación SHALL ser el CTA principal para
sumar alumnos: es el embudo de venta (la persona se registra,
aterriza en la academia y compra su plan). El alta directa de
enrollment SHALL presentarse como fallback administrativo —
liquidación del alumno que ya pagó presencial — con jerarquía
secundaria y etiquetado como inscripción manual ("Inscripción
manual"), nunca como acción principal.

#### Scenario: staff ve el orden de acciones

- **WHEN** un miembro con cap `students` abre `/academia/alumnos`
- **THEN** "Invitar" es la acción primaria y el alta directa aparece
  secundaria como "Inscripción manual"
