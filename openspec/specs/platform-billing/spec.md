# platform-billing Specification

## Purpose
TBD - created by archiving change platform-promos. Update Purpose after archive.

## Requirements

### Requirement: Promos de suscripción gestionadas por admin

El sistema SHALL permitir al admin crear promos de suscripción
(`PlatformPromo`) con: nombre, scope ACADEMY|PRODUCER|ambas, tipo
PERCENT|FIXED_CLP, valor, ventana validFrom/validUntil, maxCycles
(cobros descontados, null=ilimitado en la ventana), whitelist opcional
de actores y flag enabled. El descuento SHALL aplicarse al monto del
ciclo al suscribirse y en renovaciones mientras la promo esté vigente
y no haya agotado maxCycles (contando invoices pagados de la sub).

#### Scenario: Promo porcentual sobre whitelist

- **GIVEN** promo STUDIO -20% × 3 ciclos whitelist=academia X
  **WHEN** la academia X suscribe STUDIO mensual **THEN** el plan
  espejo cobra $63.992 y a los 3 cobros pagados vuelve a $79.990

#### Scenario: Promo expirada no aplica

- **WHEN** validUntil < ahora **THEN** el actor ve y paga precio lleno
