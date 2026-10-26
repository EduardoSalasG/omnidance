# platform-multicountry Specification

## Purpose
TBD - created by archiving change multipais-currency. Update Purpose after archive.

## Requirements

### Requirement: Moneda de cobro por país

`Country` SHALL declarar `currency` (ISO-4217) — la moneda de cobro del
mercado. La moneda de un actor SHALL resolverse por su contexto:
academia → `academy.city.country.currency` (sin ciudad → CLP);
evento → `venue.city.country.currency` (o `event.city.country`);
productor → el país de cobro declarado al suscribir. Todo monto
monetario SHALL persistirse como entero en la unidad menor de su
moneda y SHALL llevar su `currency` — nunca se suman montos de monedas
distintas.

#### Scenario: academia en Argentina

- **GIVEN** una academia con `city` en `Country("AR")` cuyo `currency`
  es `ARS`
- **THEN** sus planes de membresía y sus claims se expresan en ARS y
  `Intl.NumberFormat` los formatea como tal en todas las superficies

#### Scenario: academia sin ciudad

- **WHEN** una academia no tiene `cityId`
- **THEN** su moneda resuelve CLP (comportamiento actual)

### Requirement: Price book por país

`TierPrice(tierCode, kind, billingCycle, countryCode)` SHALL ser la
fuente de precio de las suscripciones de plataforma
(`kind=ACADEMY|PRODUCER`). La resolución SHALL consultar la fila del
país del actor primero; sin fila para ese país SHALL caer a la fila
`countryCode="CL"` del price book y luego al param legacy
`*_monthly_clp`. La suscripción SHALL persistir `currency` y
`countryCode` resultantes.

#### Scenario: tier con precio local

- **WHEN** una academia de `Country("ES")` suscribe PRO anual y existe
  `TierPrice(PRO, ACADEMY, ANNUAL, ES) = {price, EUR}`
- **THEN** el cargo es ese precio en EUR y la `PlatformSubscription`
  guarda `currency="EUR"`, `countryCode="ES"`

#### Scenario: país sin fila en el price book

- **WHEN** el país del actor no tiene fila para el tier pedido
- **THEN** se usa la fila `CL` del mismo tier/ciclo; si tampoco existe,
  el param `*_monthly_clp` como hoy

### Requirement: Provider de suscripciones por moneda

La suscripción (membresía de alumno o SaaS del actor) SHALL crearse en
el provider que soporte su moneda: CLP sigue resolviendo por el param
`payments.subscription_gateway`; otra moneda SHALL usar el primer
adaptador registrado que implemente `SubscriptionProvider` y declare la
moneda en `currencies` (sin declaración = sin restricción). Si ningún
adaptador la soporta el sistema SHALL fallar con error explícito —
nunca SHALL caer en silencio a un provider de otra moneda.

#### Scenario: membresía en USD

- **WHEN** una academia con planes en USD recibe un subscribe
- **THEN** la suscripción remota se crea en el provider que soporta USD
  (Stripe) sobre un plan espejo en USD, no en Flow

#### Scenario: moneda sin proveedor

- **WHEN** la moneda del plan no la soporta ningún
  `SubscriptionProvider` registrado
- **THEN** el subscribe responde error explícito de moneda no
  soportada

### Requirement: Espejo remoto por gateway y moneda

`MembershipPlan` SHALL persistir el id del plan espejo por gateway y
moneda (`remoteRefs`, mapa `"<GATEWAY>:<CURRENCY>" → remoteId`). El
espejo Flow/CLP SHALL seguir en `flowPlanId` (compat). El primer
subscribe en una combinación gateway+moneda SHALL crear el plan espejo
lazy con el precio vigente.

#### Scenario: dos espejos de un mismo plan

- **GIVEN** un plan con espejo Flow CLP ya creado
- **WHEN** llega el primer subscribe en USD vía Stripe
- **THEN** se crea el Price espejo en USD y se guarda en
  `remoteRefs["STRIPE:USD"]` sin tocar `flowPlanId`

### Requirement: Price book administrable

El admin SHALL poder listar, crear y actualizar filas `TierPrice`
vía endpoints protegidos por `admin.access` — abrir un mercado es un
cambio de data, no de código.

#### Scenario: abrir mercado

- **WHEN** el admin crea `TierPrice(PRO, ACADEMY, MONTHLY, "MX",
  {price, MXN})`
- **THEN** las academias de México ven y pagan ese precio desde el
  próximo subscribe

### Requirement: Teléfono normalizado E.164

Todo write path de `Person.phone` SHALL normalizar con
`normalizePhone(raw, defaultCountry)` (libphonenumber-js): `phone`
persiste E.164 con `+` y `phoneCountryCode` persiste el ISO-2 derivado
del número parseado. Un `+` inicial SHALL sobreescribir el país por
defecto (el número ya declara su país). Números inválidos SHALL
rechazarse con `400 telefono_invalido`. La unicidad de `phone` SHALL
evaluarse sobre el E.164 — dos formatos del mismo número SHALL
resolver a la misma Person.

#### Scenario: formato nacional con país por defecto

- **WHEN** un flujo recibe `"9 1234 5678"` con `defaultCountry="CL"`
- **THEN** persiste `phone="+56912345678"`, `phoneCountryCode="CL"`

#### Scenario: override por prefijo internacional

- **WHEN** un flujo recibe `"+52 55 1234 5678"` con
  `defaultCountry="CL"`
- **THEN** persiste `phone="+525512345678"`, `phoneCountryCode="MX"`

#### Scenario: el mismo número en dos formatos no duplica

- **GIVEN** una Person con `phone="+56912345678"`
- **WHEN** otro write path ingresa `"912345678"` con default CL
- **THEN** ambos normalizan al mismo E.164 y el lookup/conflicto opera
  sobre la misma fila — no se crea ni permite una segunda Person

#### Scenario: teléfono inválido

- **WHEN** un flujo recibe `"123"` o texto no telefónico
- **THEN** responde `400 telefono_invalido` sin persistir
