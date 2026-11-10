# Delta: auth/email-otp (academy-invites)

## ADDED Requirements

### Requirement: Destino post-verify en el token

`AuthOtp`/magic token SHALL poder llevar un `next` (path interno
`/…`). Tras verificar, la redirección SHALL completar el onboarding
estándar (`/bienvenida` si la cuenta es nueva, `/inicio` si existe)
preservando `next`, y el flujo de bienvenida SHALL continuar a ese
destino al finalizar. Un `next` que no sea path interno SHALL
ignorarse.

#### Scenario: invitado termina en la academia

- **GIVEN** un magic link con `next=/academias/<id>`
- **WHEN** la persona verifica
- **THEN** completa el onboarding y termina en el perfil de esa
  academia

#### Scenario: next externo se ignora

- **WHEN** el token trae `next=https://…`
- **THEN** el verify redirige solo al onboarding estándar
