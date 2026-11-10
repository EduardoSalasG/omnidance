# Delta: student-invites (academy-import-invites)

## ADDED Requirements

### Requirement: Canal masivo (import de alumnos)

El import de alumnos SHALL actuar como fuente bulk de
`AcademyInvite` con el mismo contrato del alta individual:
idempotencia por invitación pendiente `(academyId,email)`, correo con
magic link 7d y `next` a la ficha pública de la academia, push "te
invitó" cuando el email ya tiene cuenta, `invitedById` = quien corre
el import. El consumo al registrarse no distingue origen. Un email
con `Enrollment` ACTIVE en la academia SHALL saltarse (no invite, no
mail): ya es alumno vigente y el flujo de invitación no aplica.

#### Scenario: import crea invitaciones en masa

- **WHEN** el staff importa un archivo con 50 filas válidas
- **THEN** quedan las AcademyInvite pendientes correspondientes
  (dedup por pendiente) y aparecen en el listado de invitaciones
  junto a las individuales

#### Scenario: registro consume invite bulk igual que individual

- **GIVEN** una invitación creada por el import
- **WHEN** la persona verifica el magic link
- **THEN** se consume como la individual (personId, consumedAt,
  Referral INVITE con referrer = quien importó, aterriza en la ficha
  pública de la academia)

#### Scenario: alumno vigente no recibe invitación bulk

- **WHEN** una fila del import corresponde a un email con Enrollment
  ACTIVE en la academia
- **THEN** no se crea ni reenvía invitación y no se envía correo
