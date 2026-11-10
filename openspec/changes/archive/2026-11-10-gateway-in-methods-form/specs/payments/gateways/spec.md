# Delta: payments/gateways (alta de pasarela dentro de métodos de pago)

## ADDED Requirements

### Requirement: Pasarela BYO dentro del flujo de métodos de pago

La consola de métodos de pago del actor (academia
`/academia/configuracion/metodos-de-pago`, productor
`/productor/medios-pago`) SHALL ofrecer el alta de pasarela propia
DENTRO del mismo flujo "Agregar método": el usuario elige entre método
manual y pasarela; en pasarela selecciona provider
(FLOW/MERCADOPAGO/FINTOC) y completa sus credenciales (apiKey +
secret solo FLOW/FINTOC, accessToken único MERCADOPAGO). La cuenta
configurada SHALL listarse junto a los métodos manuales (badge de
tipo, mask, status, webhookUrl visible) y SHALL NO existir una
sección de pasarela separada en la página.

#### Scenario: Alta de pasarela por Agregar método

- **WHEN** el owner entra a "Agregar método" y elige pasarela FLOW
- **THEN** completa apiKey + secret, guarda por el endpoint de cuenta
  existente y la pasarela queda listada como método con su mask

#### Scenario: Lista unificada

- **WHEN** la academia tiene una transferencia manual y una cuenta
  MERCADOPAGO activas
- **THEN** la página lista ambas en la misma colección de métodos, la
  de MP con badge de pasarela y webhookUrl
