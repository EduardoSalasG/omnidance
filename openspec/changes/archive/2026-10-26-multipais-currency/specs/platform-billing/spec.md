# platform-billing; promos por moneda

## ADDED Requirements

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
