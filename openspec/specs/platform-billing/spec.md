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
  espejo cobra $63.760 y a los 3 cobros pagados vuelve a $79.700

#### Scenario: Promo expirada no aplica

- **WHEN** validUntil < ahora **THEN** el actor ve y paga precio lleno

### Requirement: Alcance de promos por moneda

Una `PlatformPromo`/`AcademyPromo` de tipo monto fijo (`FIXED_CLP`)
SHALL aplicar solo a cargos en CLP; una promo `PERCENT` SHALL aplicar a
cualquier moneda. El resolver de promos SHALL ignorar una promo fija
cuando la moneda del cargo no es CLP (la suscripción queda a precio
lleno de su price book).

#### Scenario: promo fija sobre cargo EUR

- **GIVEN** una promo `FIXED_CLP` vigente y un cargo de suscripción en
  EUR
- **WHEN** se resuelve el precio del ciclo
- **THEN** la promo no aplica y el cargo queda al precio EUR del price
  book

#### Scenario: promo porcentual multi-moneda

- **GIVEN** una promo `PERCENT 20%` vigente
- **WHEN** el cargo es en MXN
- **THEN** el descuento se aplica sobre el monto MXN
