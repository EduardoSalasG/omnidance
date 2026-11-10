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

### Requirement: lente academy al consumir invitación

Cuando `GET /auth/verify` o `POST /auth/otp/verify` consumen al menos
una `AcademyInvite` pendiente para el email del token, la respuesta
SHALL setear una cookie `omnidance_lens` con valor `academy`, legible
por JavaScript (no httpOnly), `sameSite=lax` y vida corta (~5
minutos). El chrome del cliente SHALL, al resolver la sesión, leer
esa cookie una sola vez, persistir `viewMode=academy`
(`localStorage["omnidance:view-mode"]`) y expirarla. La lente academy
activa el acento verde del design system (mismo criterio que
`academyLens` vigente). Sin invite consumido la respuesta SHALL NO
setear la cookie y el default `social` se mantiene.

#### Scenario: cuenta nueva por magic link de invite

- **WHEN** una persona sin cuenta abre el magic link de una invitación
  de academia y completa `/bienvenida`
- **THEN** al entrar a la app su `viewMode` persiste `academy` y la
  ficha `/academias/:id` renderiza con acento academy (verde)

#### Scenario: cuenta existente consume invite

- **WHEN** una persona con sesión social activa consume una invitación
  por `/auth/verify`
- **THEN** la cookie se setea en esa respuesta, el cliente persiste
  `viewMode=academy` y el toggle queda disponible para volver a
  social

#### Scenario: verify sin invite

- **WHEN** el verify corre con un `next` que no consume ninguna
  invitación
- **THEN** no se setea `omnidance_lens` y el `viewMode` queda intacto

### Requirement: Consumo por notificación push (cuenta existente)

La notificación `academy.invite` SHALL ser un camino de llegada
equivalente al magic link para la cuenta existente: su tap en
`/notificaciones` o en el toast en tiempo real SHALL consumir la
invitación pendiente del propio usuario vía `POST
/academies/invites/:inviteId/consume` (SessionGuard, valida que
`invite.email === person.email`), persistir `viewMode=academy` en el
cliente (mismo efecto que la cookie `omnidance_lens` del verify) y
navegar a la ficha pública `/academias/:academyId`. El consumo SHALL
tener el mismo efecto que el del verify: `consumedAt` + `personId`,
`Referral` INVITE (dedup por referrer+referred+source) y
`invite.registered`. El endpoint SHALL ser idempotente sobre
invitación ya consumida y SHALL rechazar (404) una invitación de otro
email.

#### Scenario: tap en el push consume y abre la ficha

- **GIVEN** una persona con cuenta existente y una `AcademyInvite`
  pendiente con notificación `academy.invite`
- **WHEN** toca la notificación en `/notificaciones` o en el toast en
  tiempo real
- **THEN** la invitación queda consumida (`consumedAt` +
  `personId`, `Referral` INVITE, `invite.registered`), su
  `viewMode` persiste `academy` y navega a `/academias/:academyId`

#### Scenario: consumo idempotente

- **GIVEN** una invitación ya consumida (por el push o por el magic
  link)
- **WHEN** se llama `POST /academies/invites/:inviteId/consume`
- **THEN** responde OK sin duplicar `Referral` ni evento

#### Scenario: invitación de otra persona

- **WHEN** se llama `POST /academies/invites/:inviteId/consume` con
  un `inviteId` cuyo `email` no corresponde a la persona autenticada
- **THEN** responde 404 y no consume nada
