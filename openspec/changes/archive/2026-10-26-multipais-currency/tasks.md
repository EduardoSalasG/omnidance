# Tasks — multipais-currency

- [x] 1. Migración: `Country.currency` (default CLP, backfill por code:
      CL→CLP, ES/DE/FR/PT/IT→EUR, AR→ARS, MX→MXN, PE→PEN, CO→COP,
      US→US), `MembershipPlan.currency`, `MembershipPlan.remoteRefs
      Json?`, `MembershipSubscription.currency`,
      `PaymentClaim.currency`, `PlatformSubscription.countryCode` —
      todo default CLP/CL. `pnpm db:migrate`.
- [x] 2. Seed: `Country.currency` por code en los países seed; filas
      `TierPrice` CL para ACADEMY (COBROS/STUDIO/PRO × ciclo) y
      PRODUCER (PRO_STARTER/GROWTH/BIG × ciclo) derivadas de los params
      actuales (`update:{}` — no pisar precios editados).
- [x] 3. `chargeSpec` gana `countryCode` + consulta `TierPrice`
      (fila país → fila CL → param legacy) y devuelve
      `{price, currency}`; callers persisten `currency`/`countryCode`
      en `PlatformSubscription` (subscribe, pendingTier, reprice,
      drift-check).
- [x] 4. País del actor: ACADEMY → `academy.city.country.code` (null→CL);
      PRODUCER → `billingCountry` ISO-2 en el body del subscribe
      (default CL, validado contra `Country`).
- [x] 5. Provider de suscripciones por moneda en
      `PlatformSubscriptionsService` y `SubscriptionsService`: CLP→param
      `subscription_gateway`; otra→primer `SubscriptionProvider` que la
      soporte; sin soporte→error explícito.
- [x] 6. Espejo remoto por gateway+moneda: `MembershipPlan.remoteRefs`
      `"<GW>:<CUR>" → remoteId`; lazy create del Price en Stripe
      (lookup_key `omni_<planId>_<currency>`); `flowPlanId` intacto.
- [x] 7. Planes: `currency` al crear plan (default academia; no
      editable); `MembershipSubscription.currency` snapshot al
      subscribe; `PaymentClaim.currency` snapshot al claim.
- [x] 8. `createDoorSale`: `ticket.currency = event.currency` **[YA HECHO
      por el orquestador — verificar, no tocar `apps/api/src/checkins/`]**;
      orden WORKSHOP (drop-in) con moneda del país de la academia.
- [x] 9. Promos: `FIXED_CLP` solo aplica a cargos CLP (resolver ignora
      si currency ≠ CLP), en PlatformPromo y AcademyPromo.
- [x] 10. Admin endpoints TierPrice: `GET /admin/tier-prices`,
      `POST /admin/tier-prices`, `PUT /admin/tier-prices/:id` —
      `admin.access`, zod validado; sección en `/admin/catalogos` o
      `/admin/facturacion` siguiendo console-patterns.
- [x] 11. Web: `formatMoney(amount, currency)` en `lib/intl.ts`
      (formatClp → wrapper); checkout, billing, planes, reporte cobros
      y ficha pública muestran moneda real; código de moneda visible
      cuando ≠CLP. Keys i18n en parts existentes (no crear parts
      nuevos ni tocar `catalogs/*.ts`).
- [ ] 12. Specs vitest: chargeSpec por país + fallbacks; provider por
      moneda (CLP Flow / USD Stripe / error sin soporte); claim/door/
      dropin currency; promo fija no-CLP ignorada.
- [ ] 13. Docs: `docs/architecture.md` (sección payments/subs),
      `docs/flows.md` si algún diagrama queda inexacto,
      `docs/qa-flows-inventory.md` — NOTA: qa-inventory lo integra el
      orquestador, reportar los flujos tocados al final del brief.
