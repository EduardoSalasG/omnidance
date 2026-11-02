# Delta; auth/email-otp

## ADDED Requirements

### Requirement: Cuenta desactivada no consume el OTP

Cuando el código OTP es válido pero la Person tiene `deletedAt`,
`verifyOtp` SHALL lanzar error de cuenta desactivada SIN consumir el
OTP, y el endpoint SHALL responder el motivo real (no el genérico
"código inválido"), ya que el código válido prueba posesión del
correo y no hay fuga de enumeración.

#### Scenario: OTP válido sobre cuenta desactivada

- **WHEN** el usuario ingresa el código correcto de una cuenta con
  baja lógica
- **THEN** recibe "cuenta desactivada" y el OTP queda vigente hasta
  su TTL (sirve si el admin reactiva)
