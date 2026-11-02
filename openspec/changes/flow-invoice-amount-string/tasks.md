# Tasks; flow-invoice-amount-string

- [x] Reproducir: smoke E2E Flow sandbox: `GET /subscriptions/:id` con invoice pagada loguea `payment.create() Expected Int, provided String` y no crea Payment.
- [x] Test rojo en `flow.gateway.spec.ts`: fixture `subscription/get` con `amount` string → `invoices[0].amount` es `number`; caso no coercible → `0`.
- [x] Fix en `flow.gateway.ts`: `FlowRawInvoice.amount` → `number | string`; `normalizeInvoice` coerce `Number(...) ?? 0` (NaN → 0).
- [x] `pnpm --filter @omnidance/api test` suite payments verde + `npx tsc --noEmit`.
- [x] Re-smoke real: `GET /subscriptions/:id` de `cmvzdf0j2007w12svryntr7hr` → Payment `mem_cmugdvnma004gxaa5g1uk979c_1239699` PAID + `lastInvoiceId` marcado + Enrollment ACTIVE + 5 Notification admin + resguardo mail (best-effort Resend).
- [x] Actualizar `docs/qa-flows-inventory.md` (primer cobro membresía + PLATFORM_SUB, tope del mandato en sandbox).
