# academies/student-invites Specification

## Purpose
Invitación de registro que la academia envía a personas sin crearles
enrollment: la invitada se registra en la plataforma, aterriza en el
perfil de la academia y se inscribe por su cuenta; la academia ve el
estado de cada invitación.

## Requirements

### Requirement: Invitación por email sin enrollment

Un miembro con capability `students` SHALL poder invitar con email +
nombre y apellido vía `POST /academies/:id/invites`. El sistema SHALL
crear `AcademyInvite` y enviar un correo transaccional de invitación
con magic link (TTL 7d). Si el email ya tiene cuenta, el correo se
envía igual (magic link de login) y además SHALL enviarse
notificación push a esa persona.

#### Scenario: invitado nuevo recibe correo

- **WHEN** el staff invita `nuevo@mail.com`
- **THEN** queda `AcademyInvite` pendiente y el correo lleva magic
  link con `next` al perfil de la academia

#### Scenario: cuenta existente recibe correo y push

- **GIVEN** un email con `Person` existente
- **WHEN** se envía la invitación
- **THEN** recibe el correo con magic link y una notificación push
  "la academia te invitó"

#### Scenario: invitación duplicada pendiente

- **WHEN** ya existe una invitación pendiente (sin `consumedAt`) para
  el mismo email en la academia
- **THEN** el alta es idempotente: se reenvía el correo sin crear una
  segunda invitación

### Requirement: Consumo al registrarse

Al verificar el magic link, la invitación SHALL marcarse consumida
(`personId` + `consumedAt`), crearse `Referral` (source INVITE,
referrer = quien invitó) y emitirse `ActivityEvent`. El verify
SHALL respetar `AuthOtp.next`: tras el onboarding estándar la
persona aterriza en el perfil de la academia invitante.

#### Scenario: registro consume la invitación

- **GIVEN** una invitación pendiente
- **WHEN** la persona verifica el magic link
- **THEN** `consumedAt` + `personId` quedan seteados, existe el
  `Referral` y el onboarding termina en el perfil de la academia

### Requirement: Listado de invitaciones en consola

`GET /academies/:id/invites` SHALL devolver las invitaciones de la
academia (email, nombre, fecha, estado pendiente/registrado) para
miembros con capability `students`, pendientes primero.

#### Scenario: staff ve pendientes y registrados

- **WHEN** el staff abre el listado de invitados
- **THEN** ve cada invitación con su estado y las pendientes arriba

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
