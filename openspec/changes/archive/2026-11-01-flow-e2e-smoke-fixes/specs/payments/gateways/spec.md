# Delta; payments/gateways

## ADDED Requirements

### Requirement: Retorno del pagador con sesión preservada

El `urlReturn` enviado a la pasarela en `createOrder` debe ser un
endpoint público de la API que responda `303` a la página de retorno
de la web, de modo que la navegación resultante sea GET y transporte
la cookie de sesión (Flow devuelve al pagador con POST cross-site y
las cookies SameSite=Lax no viajan en ese primer request).

#### Scenario: Retorno tras pago Flow

- **WHEN** Flow redirige al pagador por POST a
  `/api/payments/order-return?paymentId=<id>`
- **THEN** la API responde `303` a
  `${WEB_URL}/checkout/return?paymentId=<id>` y la web recibe la
  navegación con sesión vigente (sin redirect a /login).

### Requirement: Verdad monetaria de la pasarela persistida completa

El settle PAID persiste además `Payment.gatewayCurrency` con la
moneda reportada por la pasarela, auditable contra
`Payment.currency`.

#### Scenario: Orden pagada persiste moneda reportada

- **WHEN** el webhook o polling confirma una orden en estado
  terminal PAID
- **THEN** `Payment.gatewayCurrency` guarda la moneda reportada por
  la pasarela junto a los demás campos `gateway*`.
