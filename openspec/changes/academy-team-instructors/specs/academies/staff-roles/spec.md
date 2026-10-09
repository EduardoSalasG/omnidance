# Delta — academies/staff-roles

## ADDED Requirements

### Requirement: Mantenedor de profesores

Bajo `/academies/:id/instructors` (capacidad `team`, mismas reglas de
acceso que el mantenedor de colaboradores):

- `GET` SHALL listar los `AcademyInstructor` de la academia con
  `person:{id,name,email}`, `commissionPct` y `createdAt`, ordenados
  por alta.
- `POST {email, name?, commissionPct?}` SHALL normalizar el email; si
  existe `Person` crear/actualizar la membresía; si no existe crear
  `Person` stub `{email, name}` + membresía + enviar email de
  invitación con magic link de TTL ≥72h. Re-enviar a un email ya
  instructor SHALL actualizar `commissionPct` (si se envía) sin
  duplicar la fila. `commissionPct` SHALL ser entero 0–100 cuando se
  envía.
- `DELETE /:personId` SHALL eliminar la membresía: la persona pierde
  acceso de instructor a esa academia pero conserva su cuenta. 404 si
  no existe.
- `academy.ownerId` SHALL NOT ser objetivo de POST/DELETE (el dueño no
  es instructor de su propia academia por fila). El actor SHALL NOT
  gestionarse a sí mismo (`cannot_modify_self`).

La membresía `AcademyInstructor` SHALL ser suficiente para los
endpoints de instructor (`/classes/teaching`, asistencia de sus clases)
sin requerir `PersonRole INSTRUCTOR`.

#### Scenario: invitar profesor nuevo

- **WHEN** owner hace POST instructors con email inexistente y
  `commissionPct=20`
- **THEN** se crea Person stub + AcademyInstructor con esa comisión y se
  envía email de invitación; al entrar por el link la persona puede
  llamar `/classes/teaching` de esa academia

#### Scenario: quitar profesor

- **WHEN** owner hace DELETE instructors/:personId de un instructor
- **THEN** la fila se elimina y sus llamadas de instructor a esa
  academia responden 403

#### Scenario: staff sin team no gestiona profesores

- **WHEN** un staff sin `canTeam` llama GET/POST/DELETE instructors
- **THEN** recibe 403
