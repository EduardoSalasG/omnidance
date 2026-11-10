# Delta: academies/student-invites (invite-academy-lens)

## ADDED Requirements

### Requirement: lente academy al consumir invitación

Cuando `GET /auth/verify` o `POST /auth/otp/verify` consumen al menos
una `AcademyInvite` pendiente para el email del token, la respuesta
SHALL setear una cookie `omnidance:lens` con valor `academy`, legible
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
- **THEN** no se setea `omnidance:lens` y el `viewMode` queda intacto
