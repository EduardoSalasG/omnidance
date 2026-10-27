# Tasks — multipais-polish

- [x] 1. `POST/PATCH /events` acepta `currency` (ISO-4217, validado
      contra `Country.currency`); default = venue.city.country.currency
      (null→CLP). Form del productor con selector de moneda.
- [x] 2. `cleanWhatsapp` → `normalizePhone(raw, academyCountry)`:
      persiste E.164 sin `+` (wa.me listo); inválido → 400.
- [x] 3. `producerMonthlyGross` agrupa por `currency`
      (`{currency: amount}`); consumers del KPI usan el desglose
      (pro view muestra por moneda, nunca una suma cruzada).
- [x] 4. `/admin/facturacion/precios` → console-patterns: crear via CTA
      a página dedicada si el refactor es acotado; si no, documentar
      la desviación.
- [x] 5. **Onboarding academia fuera de CL**: verificar que el alta de
      academia (admin/consola) permite elegir `cityId` fuera de CL y
      que `Academy.city → Country.currency` resuelve la moneda del
      onboarding de planes; si falta el selector de país en el form,
      agregarlo (scope acotado: select de país → filtra ciudades).
- [x] 6. Specs vitest por item + i18n en parts existentes (sin
      parts nuevos, sin `catalogs/*.ts`).

## Orquestador (no implementador)

- [x] 7. Correr `pnpm test:e2e` intentando un puerto fuera del rango
      excluido de Windows (3000-3099); si otro rango falla, documentar.
- [x] 8. SELECT de sanitidad backfill: `Person.phone` sin `+` o
      `phoneCountryCode` null/!= país del E.164 → reportar conteo.
- [x] 9. `pnpm --filter @omnidance/web build` post-fix promoState.
- [x] 10. `impeccable detect --json` sobre UI nueva (PhoneInput,
      precios, event-form).
