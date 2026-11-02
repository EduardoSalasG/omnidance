# Delta; payments/subscriptions

## ADDED Requirements

### Requirement: Redirect directo al registro de tarjeta

Cuando el checkout de suscripción responde `needs_card` con
`registerUrl`, el front SHALL navegar de inmediato al disclaimer del
proveedor (`location.href`), sin interstitial intermedio.

#### Scenario: needs_card en checkout membresía

- **WHEN** `POST /checkout/membership-subscription` responde
  `needs_card` con `registerUrl`
- **THEN** el browser navega directo al registerUrl del proveedor

### Requirement: Retorno de tarjeta a página de éxito compartida

El `customer-return` de suscripciones SHALL redirigir a
`/checkout/return?sub=ok|error`, la misma página de resultado de los
checkouts one-off, con `src=member` para que el CTA apunte a
`/academias` (bailarín) y el default siga siendo la consola de
suscripción del actor.

#### Scenario: Registro de tarjeta completado

- **WHEN** el pagador vuelve del disclaimer con tarjeta registrada
- **THEN** el endpoint redirige a `/checkout/return?sub=ok&src=member`
  y la página muestra el éxito con CTA a Mis academias
