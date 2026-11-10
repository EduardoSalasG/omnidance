# academies/student-invites

## ADDED Requirements

### Requirement: Consumo por notificación push (cuenta existente)

La notificación `academy.invite` SHALL ser un camino de llegada
equivalente al magic link para la cuenta existente: su tap en
`/notificaciones` SHALL consumir la invitación pendiente del propio
usuario vía `POST /academies/invites/:inviteId/consume`
(SessionGuard, valida que `invite.email === person.email`),
persistir `viewMode=academy` en el cliente (mismo efecto que la
cookie `omnidance_lens` del verify) y navegar a la ficha pública
`/academias/:academyId`. El consumo SHALL tener el mismo efecto que
el del verify: `consumedAt` + `personId`, `Referral` INVITE (dedup
por referrer+referred+source) y `invite.registered`. El endpoint
SHALL ser idempotente sobre invitación ya consumida y SHALL
rechazar (404) una invitación de otro email.

#### Scenario: tap en el push consume y abre la ficha

- **GIVEN** una persona con cuenta existente y una `AcademyInvite`
  pendiente con notificación `academy.invite`
- **WHEN** toca la notificación en `/notificaciones`
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
