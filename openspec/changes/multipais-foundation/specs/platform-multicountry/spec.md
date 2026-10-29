## ADDED Requirements

### Requirement: Ciudad como dimensión de datos

Toda entidad geolocalizable SHALL resolver su `City`; `Venue.cityId`
requerido para venues nuevos; `City` con `country`, `slug`, lat/lng,
`geohash` y `timezone` IANA. Las fechas de eventos/clases SHALL
persistir en UTC y SHALL renderizarse en la `timezone` de la ciudad
del venue. Data existente SHALL migrarse a `Santiago, CL`.

#### Scenario: Evento en otra ciudad

- WHEN un evento se crea para un venue de `City` X
- THEN su horario se guarda UTC y se muestra en la TZ de X a todo
  usuario, sin importar dónde esté

#### Scenario: Backfill Santiago

- WHEN corre la migración sobre datos pre-multipaís
- THEN todos los venues existentes quedan en `City("Santiago","CL")`
  sin pérdida ni cambio de comportamiento

### Requirement: Moneda por mercado

`Event`, `Ticket`, `PlatformSubscription` y membresías SHALL declarar
`currency` (ISO-4217); el default para data existente SHALL ser CLP.
Los precios de tiers SHALL resolverse por `tier × country` en un
price book versionado; nunca hardcoded.

#### Scenario: Precio por país

- WHEN una academia de otro país suscribe el mismo tier
- THEN paga el precio y moneda definidos para su país en el price book

### Requirement: Rieles de pago por región

El registro de gateways SHALL soportar más de un proveedor por país
(Chile: Flow/Fintoc; global: Stripe; opcional LatAm: MercadoPago).
Cada actor SHALL declarar su gateway acorde a su país; el payout
SHALL abstraerse tras un port; el flujo chileno actual (claims
Fintoc) SHALL seguir funcionando como el caso Chile.

#### Scenario: Productor internacional cobra

- WHEN un productor de un país sin Fintoc crea su cuenta de gateway
- THEN el sistema ofrece el rail de su región (Stripe Connect) y la
  liquidación fluye por ese port, sin código condicional por país

### Requirement: Operación regional de validación

Las colas de revisión (perfiles, academias) SHALL scopiarse por
región del revisor (`AdminRegion`); un revisor SHALL ver solo su
región salvo ADMIN global. El consentimiento legal SHALL resolverse
por jurisdicción del actor.

#### Scenario: Revisor regional

- WHEN un revisor de Europa abre la cola de validación
- THEN ve solo perfiles/academias de sus regiones asignadas; un
  ADMIN global ve todo

### Requirement: Descubrimiento por ciudad

La plataforma SHALL exponer por ciudad: academias, socials, eventos
y prácticas; filtrable por "cerca de mí" (geohash). Las
estadísticas verificadas (check-ins agregados, engagement de serie)
SHALL alimentar el ranking local sin exponer evaluaciones
individuales.

#### Scenario: Viajero descubre escena

- WHEN un bailarín abre la app en una ciudad distinta a la suya
- THEN ve la oferta de esa ciudad con su social proof verificado,
  sin configurar nada
