# platform-multicountry — polish

## ADDED Requirements

### Requirement: Moneda declarativa del evento

`POST/PATCH /events` SHALL aceptar `currency` (ISO-4217, validado
contra el catálogo `Country.currency`); el default SHALL ser la moneda
del país del venue (venue sin país → CLP). El form del productor SHALL
permitir elegirla.

#### Scenario: evento en venue argentino

- **WHEN** un productor crea un evento en un venue de `Country("AR")`
  sin declarar `currency`
- **THEN** `Event.currency = "ARS"` y los tickets/órdenes lo heredan

### Requirement: Contacto de academia normalizado

`Academy.whatsapp` SHALL normalizarse con `normalizePhone(raw,
academyCountry)` al guardar y SHALL persistir E.164 sin `+` (formato
wa.me); un valor inválido SHALL rechazarse con 400.

#### Scenario: owner escribe número local

- **WHEN** el owner guarda `whatsapp="9 1234 5678"` en una academia CL
- **THEN** persiste `"56912345678"` y el link wa.me funciona

### Requirement: Alta de academia fuera de Chile

El alta de academia SHALL permitir elegir país y ciudad del catálogo
(`Country`/`City`), incluidos países distintos de CL, para que
`Academy.city → Country.currency` resuelva precios y moneda del
onboarding de planes.

#### Scenario: academia en Ciudad de México

- **WHEN** un admin crea una academia eligiendo país MX y una ciudad
  del catálogo MX
- **THEN** la academia persiste `cityId` MX y sus planes/facturación se
  resuelven en la moneda del país

### Requirement: Facturación mensual por moneda

La facturación bruta mensual del productor SHALL agregarse por moneda —
los KPIs y la resolución de tier SHALL operar sobre el desglose
`{currency: amount}`, nunca sobre una suma de monedas distintas.

#### Scenario: productor con ventas CLP y USD

- **WHEN** se calcula su media de 90 días
- **THEN** devuelve montos separados por moneda; la evaluación del tope
  de tier usa la moneda de su suscripción (fallback CLP)
