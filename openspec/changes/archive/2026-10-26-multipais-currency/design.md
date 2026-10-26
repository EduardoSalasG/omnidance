# Design — multipais-currency

## Contexto

`multipais-foundation` fijó el contrato ("Moneda por mercado", "Price
book tier×country") y dejó la base: `Event/Ticket/Payment/
PlatformSubscription.currency`, `Country`/`City`, `TierPrice` (usado
solo por Pase Social), `GatewayRegistry.resolve(name, currency)` que ya
rutea por moneda, y `StripeGateway` implementando `SubscriptionProvider`.

Lo que falta para cobrar de verdad fuera de CL: la moneda en el dominio
de membresías, la fuente de precios por país, y la selección de
provider de suscripciones por moneda.

## Decisiones

### D1. `Country.currency` — la moneda vive en el país

Columna `currency String @default("CLP")` en `Country`. Justificación:
un país opera con una moneda de cobro (los países EUR comparten EUR y
está bien — el precio exacto lo da `TierPrice`, la moneda el país).
`academy.city.country.currency` resuelve la moneda de una academia;
`event → venue.city.country` o `event.city.country` la del evento.
Fallback a "CL"/"CLP" cuando el actor no tiene ciudad.

### D2. Montos siguen en `Int` — unidad menor de la moneda

Convención: `price`, `amount`, `fee`, `net` = unidad menor (CLP ya es
entero; USD/EUR = centavos). No hay cambio de tipo; se documenta en el
schema. Sin FX — nunca se suman montos de monedas distintas; reportes
agrupan por `currency`.

### D3. `TierPrice` es la fuente de precio de suscripciones de plataforma

`chargeSpec(kind, tierCode, billingCycle, countryCode)` consulta
`TierPrice` primero; si no hay fila para el país, cae a la fila CL del
price book y luego al param `*_monthly_clp` legacy (compat con seeds y
entornos sin price book). `kind` ACADEMY/PRODUCER cubren los tiers
SaaS; la fila del Pase Social sigue como está (`tierCode=SOCIAL_PASS`,
`kind=PRODUCER` placeholder — el resolver busca por tierCode+country).

El resultado de `chargeSpec` gana `{price, currency}` — hoy devuelve
solo monto CLP. Todos sus callers (subscribe, pendingTier, reprice,
drift-check) persis­ten `currency` en la `PlatformSubscription`.

### D4. País de cobro de la suscripción de plataforma

`PlatformSubscription.countryCode String @default("CL")`:
- `kind=ACADEMY` → `academy.city.country.code` (null → "CL").
- `kind=PRODUCER` → `billingCountry` en el body del subscribe (ISO-2,
  default "CL") — el productor no tiene venue; lo declara igual que en
  `PayoutDestination`.

### D5. Provider de suscripciones por moneda

`subscriptionGateway()` gana la moneda del plan/tier:
- CLP → param `payments.subscription_gateway` (comportamiento actual).
- Otra moneda → primer adaptador registrado con `createSubscription`
  cuyo `currencies` la soporte (o sin restricción = Stripe/Stub). Ninguno
  → error explícito "moneda sin proveedor de suscripciones", jamás
  caer en silencio a CLP/Flow.

Misma regla para `PlatformSubscriptionsService.provider()` y
`SubscriptionsService` (membresías). `SocialPassService` ya resuelve
`gateways.get("STRIPE")` explícito — se deja igual.

### D6. Espejo remoto por gateway+moneda

`MembershipPlan.flowPlanId` queda como el espejo Flow/CLP (compat). Se
agrega `remoteRefs Json` con mapa `"<GATEWAY>:<CURRENCY>" → remoteId`
para espejos no-Flow (Stripe: lookup_key `omni_<planId>_<currency>`,
mismo patrón que Pase Social). Primer subscribe no-CLP crea el
Product+Price remoto lazy, igual que hoy.

### D7. Moneda del dominio de membresías y claims

- `MembershipPlan.currency` — default la moneda de la academia al
  crear; no editable después (un plan no cambia de moneda: se crea otro
  plan). Staff en CL ni lo nota.
- `MembershipSubscription.currency` — snapshot del plan al suscribir.
- `PaymentClaim.currency` — snapshot de la moneda de la academia al
  declarar; `amount` se interpreta en esa moneda.
- Drop-in (`orderType WORKSHOP`): la orden lleva la moneda de la
  academia de la clase.
- Door sale: `Ticket.currency = event.currency` (hoy cae al default CLP).

### D8. Promos multi-moneda

`PlatformPromo` `FIXED_CLP` aplica solo a cargos CLP (una promo fija en
CLP no descuenta euros). `PERCENT` aplica a cualquier moneda.
`AcademyPromo` igual si tiene tipo FIXED — verificar enum al
implementar; misma regla.

### D9. Front

`lib/intl.ts`: `formatMoney(amountMinor, currency, locale?)` sobre
`Intl.NumberFormat`; `formatClp` queda como wrapper. Superficies:
checkout (quote/orden), `/academia` billing + planes + reporte cobros,
`/productor` suscripción, `/admin/facturacion`, ficha pública de
academia (plan prices). El i18n muestra el código de moneda cuando no
es CLP para evitar ambigüedad ("US$ 50" vs "$ 50.000").

## Riesgos

- **Espejos remotos**: crear Price remoto en moneda equivocada deja la
  sub cobrando mal — el create es lazy y validado por currency.
- **Datos legacy**: todo default CLP/CL — migración trivial, cero drift.
- **Params vs TierPrice**: mantener params CL como fallback evita
  romper entornos sin price book; el seed siembra TierPrice CL desde
  los params para que converjan.
- **`Person.jurisdiction` ≠ país de cobro**: jurisdiction es legal
  (EU/CL), no ISO-3166 país. No reusarlo para pricing — de ahí el
  `countryCode` propio en PlatformSubscription.

## Verificación

- Specs: chargeSpec por país (fila exacta, fallback CL, param legacy),
  provider por moneda (Flow CLP, Stripe USD, error sin soporte),
  subscribe persiste currency+countryCode, claim/door/dropin currency.
- `pnpm --filter @omnidance/api build` + vitest de payments/academies.
- Migración + `migrate diff` vacío.
