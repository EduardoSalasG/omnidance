# Proposal; multipais-polish

## Why

Tras `multipais-currency`/`multipais-phone` quedaron cabos: el
productor no puede declarar la moneda de su evento (queda CLP),
`Academy.whatsapp` sigue sin normalizar, `producerMonthlyGross` mezcla
monedas y la UI de precios no sigue console-patterns.

## What Changes

- **Evento multi-moneda**: `POST/PATCH /events` SHALL aceptar
  `currency` ISO-4217 validado, con default = moneda del país del
  venue (venue sin ciudad → CLP). La UI del productor SHALL poder
  elegirla.
- **Whatsapp normalizado**: `PATCH /academies/:id` SHALL pasar
  `whatsapp` por `normalizePhone` (defaultCountry = país de la
  academia) y persistir E.164 sin `+` (formato wa.me); inválido → 400.
- **Facturación por moneda**: `producerMonthlyGross` SHALL agrupar
  `Payment.amount` por `currency`; nunca suma monedas distintas;
  los consumidores del KPI reciben el desglose.
- **Deuda UI**: `/admin/facturacion/precios` alinea a console-patterns
  (crear = CTA → página dedicada, fila → edición) si el diff lo permite
  sin reescribir la página.
- **Onboarding academia internacional**: el alta de academia SHALL
  permitir elegir país→ciudad fuera de CL para que
  `Academy.city → Country.currency` resuelva precios/moneda locales.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `events`: moneda del evento declarativa.
- `academies/public-profile`: whatsapp E.164 validado.
- `event-analytics`: gross mensual agrupado por moneda.

## Impact
- `events.controller`, `academies.controller` (cleanWhatsapp →
  normalizePhone), `platform-subscriptions.service` (gross), web
  event-form + precios page.
