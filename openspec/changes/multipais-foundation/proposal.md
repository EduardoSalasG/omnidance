# Proposal; multipaís-foundation

## Why

El modelo de datos y operación asume Chile/Santiago implícito
(CLP hardcoded, gateways nacionales Flow/Fintoc, sin entidad City,
sin timezone en Venue, ADMIN global sin scoping regional). El
roadmap "Civitatis de baile"; viajar, abrir la app, ver dónde
bailar en otra ciudad; requiere la capa de fundación antes de
cualquier feature de descubrimiento o suscripción.

Este change es **diseño + spec**: no implementa todavía, define el
contrato que las implementaciones siguientes cumplirán.

## What Changes (diseño)

### A. Datos y modelo

- **`City`/`Country` normalizados**: `Country(code, name)`,
  `City(id, countryId, name, slug, lat, lng, timezone IANA,
  geohash)`. `Venue.cityId` requerido a futuro (backfill de venues
  existentes a "Santiago, CL").
- **`currency`**: campo `currency` ISO-4217 en `Event`
  (presale/door), `Ticket`, tiers de `PlatformSubscription` y
  membresías de academia; default `CLP` para data existente.
- **Timezone**: se almacena vía `City.timezone` (venue → city);
  fechas siempre UTC en DB, render local en front por venue.
- **Formatos de contacto**: teléfono con `countryCode` (hoy asume
  +56 en cuentas ligeras de puerta).

### B. Payments multi-mercado

- `gateway-registry` ya es hexagonal; se agrega **Stripe** como
  adapter global (y MercadoPago opcional LatAm). Cada
  `ProducerGatewayAccount`/`AcademyBilling` declara su gateway por
  país del actor.
- Settlement/payout: abstraer los flujos chilenos (Fintoc claims)
  tras un port `PayoutRail`; Chile sigue en Fintoc, resto por
  Stripe Connect o manual.
- Price book por mercado: los tiers de suscripción se definen
  `tier × country → {price, currency}`.

### C. Operación regional

- **`Region` = City-scope de permisos**: el staff de validación
  (perfiles, academias) se scopia por `PersonRole.regionId` o
  `AdminRegion(personId, regionId)`; la cola de validación se
  filtra por la región del revisor. ADMIN global se mantiene.
- Consentimiento legal por jurisdicción (`consentVersion` +
  `country` del actor: GDPR UE vs. Ley 19.628 CL).

### D. Descubrimiento viajero (capa posterior, referencia)

- Landing por ciudad: "¿dónde bailar en {city}?"; academias,
  socials, eventos filtrados por `City` + geohash "cerca de mí".
- City guides curadas ("imprescindibles"); contenido editorial
  por ciudad.
- "Mi viaje": trip planner (agregar clases/socials a días del
  viaje → itinerario).
- Pases multi-día / packs de clases.
- Prácticas/socials gratuitas como adquisición por ciudad.

### E. Suscripción del bailarín ("Pase Viajero", posterior)

- Tier nuevo a nivel `Person` (reutiliza
  `platformSubscriptionsPayer`): descuentos en la red, drop-in en
  academias opt-in (revenue share), prioridad y experiencias.
- Sentido solo con ≥2 ciudades vivas; la red es el valor.

## Out of scope (explícito)

- Reembolsos/refunds en tickets (decisión de producto: no van).
- Traducciones a más locales (pt-BR cuando llegue Brasil).
- Migración de la escena Santiago; queda intacta como ciudad 0.
