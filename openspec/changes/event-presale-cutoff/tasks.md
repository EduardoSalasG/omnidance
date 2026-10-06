# Tasks - event-presale-cutoff

- [x] `schema.prisma`: `Event.presaleCutoffMinutes Int?` +
  `ProducerParams.presaleCutoffMinutes Int?` + migración manual aplicada
  con `migrate deploy`.
- [x] `src/common/presale-cutoff.ts`: helper puro
  `resolvePresaleCutoffMinutes(event, producer, globalHour)` +
  `presaleCutoffDate(startsAt, minutes)` (0–2879, >1439 = día siguiente).
- [x] `params.service.ts`: `presaleCutoffMinutes` en
  `ProducerFeeDefaults` + mapeo en `getProducerParams`.
- [x] `checkout.service.ts`: mover `getProducerParams` antes del canal;
  resolver corte por la cadena (purchaseTicket + discountQuote); path
  `orderTotal === 0` → Payment `gateway: "FREE"` + `settle(..., "PAID",
  {actor: "checkout"})` + `paymentUrl` = return URL; inyectar
  `PaymentSettlementService`.
- [x] `events.controller.ts`: `presaleEndsAt` por la cadena (detalle ×2);
  `presaleCutoffMinutes` en Create/Update DTOs (@IsInt 0–2879, null =
  heredar) + persistencia.
- [x] `admin/producer-params.controller.ts`: `presaleCutoffMinutes` en
  DTO + FEE_FIELDS + vista `effective` (?? global × 60).
- [x] `events/infrastructure/producer.controller.ts`: mismo campo en
  `GET/PUT /producer/table-params` (default auto-editable del productor).
- [x] Web: `producer/event-form.tsx` campo "Preventa hasta"
  (`type="time"` → minutos, vacío = heredar, dirty flag preserva
  valores post-medianoche) + i18n `producer.json`; campo editable en
  `/productor/parametros` (PUT `table-params`, dirty flag) y en
  `/admin/parametros` (input `time`, preserva >1439 cargado).
- [x] `seed-dev.ts`: Bachata con Salsa `presaleCutoffMinutes: 1425`.
- [x] Tests: spec del helper (8); spec checkout (override/productor/
  global, corte 23:45, post-medianoche 1500, orden $0 sin gateway +
  settle PAID, descuento a $0, puerta post-corte).
- [x] Docs: `docs/flows.md` (cadena de corte + orden gratis) +
  `docs/architecture.md` (param `presale.cutoff_hour` + cadena);
  regenerar openapi/postman.
