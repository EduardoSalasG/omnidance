# Delta; legal/consent

## ADDED Requirements

### Requirement: Consentimiento solo al crear la cuenta vía magic link

`POST /auth/magic-link` solo exige `consent` cuando el email no tiene
cuenta (la acción crea la Person). Una cuenta existente obtiene el
link sin consentimiento nuevo - el check no se repite en cada login.

#### Scenario: Magic link sobre cuenta existente

- **WHEN** se pide magic link con `consent:false` para un email con
  Person existente
- **THEN** el link se envía normalmente (sin exigir consentimiento).

#### Scenario: Magic link sobre email sin cuenta sin consentimiento

- **WHEN** se pide magic link con `consent:false` para un email sin
  Person
- **THEN** responde 400 `consent_required` y no genera token ni OTP.

#### Scenario: Magic link sobre email sin cuenta con consentimiento

- **WHEN** se pide magic link con `consent:true` para un email sin
  Person
- **THEN** el link se envía y la aceptación queda registrada al crear
  la cuenta.
