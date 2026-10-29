# payments/class-dropin; moneda de la orden

## ADDED Requirements

### Requirement: Moneda de la orden de clase suelta

La orden `WORKSHOP` de un drop-in SHALL persistir `currency` = la
moneda del país de la academia dueña de la clase (fallback CLP) y el
checkout SHALL resolver el gateway por esa moneda.

#### Scenario: drop-in en academia mexicana

- **GIVEN** una academia con `city` en `Country("MX", currency="MXN")`
  y una clase con `dropInPrice`
- **WHEN** un bailarín hace `POST /checkout/class`
- **THEN** la orden lleva `currency="MXN"`, los montos en centavos de
  MXN y el gateway que soporta MXN procesa el cobro
