# Delta: producer-pro (productor-desembolso-page)

## MODIFIED Requirements

### Requirement: Cuenta de desembolso en la consola del productor

`/productor/desembolso` SHALL ser la página propia (dentro de la
sección Configuración del nav del productor) que muestra los
`PayoutDestination` del actor (estado, rail, moneda, fecha de
activación) y un CTA de onboarding. El alta SHALL pedir país ISO-2,
POSTear a `/me/payout-destinations` y redirigir al `onboardingUrl`
devuelto; al volver, la página SHALL refrescar el estado vía `GET`
(el backend hace flip a ACTIVE cuando Stripe reporta onboarding
completo). Sin `STRIPE_SECRET_KEY` configurado el endpoint responde
503 y la UI SHALL mostrar estado de error claro (no spinner infinito).
`/productor/pagos` SHALL mostrar solo el listado de liquidaciones;
la cuenta de desembolso no vive más ahí.

#### Scenario: Onboarding completo

- **WHEN** el productor pulsa "Conectar con Stripe", elige país y
  completa el flujo en Stripe
- **THEN** vuelve a `/productor/desembolso` y el destino aparece
  `ACTIVE` con su moneda tras el refresh

#### Scenario: Reintento PENDING

- **WHEN** el productor abandona el onboarding y vuelve a pulsar el CTA
- **THEN** se reutiliza la misma `acct_` (sin segunda cuenta) y recibe
  un `onboardingUrl` nuevo

#### Scenario: Estado vacío

- **WHEN** el actor no tiene destinos
- **THEN** la página muestra empty state con el CTA; nunca un panel
  vacío sin acción

## ADDED Requirements

### Requirement: "Mis pagos" en el grupo de módulos del productor

El ítem "Mis pagos" (`/productor/pagos`) SHALL vivir en el grupo de
módulos del drawer/sidebar del productor (junto a Eventos, Códigos,
Comprobantes, Colaboradores); es data operativa, no configuración.
El grupo Configuración SHALL listar solo destinos de configuración:
defaults operativos, medios de pago, cuenta de desembolso,
suscripción y apariencia.

#### Scenario: Nav del productor refleja dominio

- **WHEN** el productor abre el drawer o la sidebar
- **THEN** "Mis pagos" aparece en el grupo del módulo Productor y
  "Cuenta de desembolso" aparece en Configuración
