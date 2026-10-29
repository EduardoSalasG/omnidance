# Delta: producer-pro (payout-destinations-front)

## ADDED Requirements

### Requirement: Cuenta de desembolso en la consola del productor

`/productor/pagos` SHALL mostrar una sección "Cuenta de desembolso"
con los `PayoutDestination` del actor (estado, rail, moneda, fecha de
activación) y un CTA de onboarding. El alta SHALL pedir país ISO-2,
POSTear a `/me/payout-destinations` y redirigir al `onboardingUrl`
devuelto; al volver, la página SHALL refrescar el estado vía `GET`
(el backend hace flip a ACTIVE cuando Stripe reporta onboarding
completo). Sin `STRIPE_SECRET_KEY` configurado el endpoint responde
503 y la UI SHALL mostrar estado de error claro (no spinner infinito).

#### Scenario: Onboarding completo

- **WHEN** el productor pulsa "Conectar con Stripe", elige país y
  completa el flujo en Stripe
- **THEN** vuelve a `/productor/pagos` y el destino aparece `ACTIVE`
  con su moneda tras el refresh

#### Scenario: Reintento PENDING

- **WHEN** el productor abandona el onboarding y vuelve a pulsar el CTA
- **THEN** se reutiliza la misma `acct_` (sin segunda cuenta) y recibe
  un `onboardingUrl` nuevo

#### Scenario: Estado vacío

- **WHEN** el actor no tiene destinos
- **THEN** la sección muestra empty state con el CTA; nunca un panel
  vacío sin acción
