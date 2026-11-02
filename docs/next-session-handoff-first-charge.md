# Handoff; primer cobro de suscripciones - verificado E2E + bugfix

**Rama**: `dev` · commits `95d4476f` (fix) + `dcd57caf` (archive spec).

## Estado

Primer cobro de suscripción **verificado end-to-end contra Flow sandbox**
(membresía de alumno). Bug real encontrado y corregido:
`flow-invoice-amount-string` archivado
(`archive/2026-11-02-flow-invoice-amount-string`, spec canónica
`payments/subscriptions` actualizada).

## Qué se verificó (traza real)

- `MembershipSubscription` `cmvzdf0j2007w12svryntr7hr` (Eduardo →
  Clave Timba "Esencial" $25.000, remote `sus_sb26ca3fa9`) creada por
  el usuario vía UI → `subscription/create` 200 → sub ACTIVE.
- Flow cobró la 1ª invoice `1239699` al momento ($25.000, status 1).
- `GET /subscriptions/:id` (refresh del owner) → reconcile →
  `Payment cmvzdpyqf000634313byrv7mn` **PAID** $25.000,
  `refId mem_cmugdvnma004gxaa5g1uk979c_1239699`, feeMode ACADEMY,
  ledger ORDER_CREATED→STATUS_CONFIRMED→RENEWAL_SETTLED,
  `lastInvoiceId=1239699`, `Enrollment` ACTIVE endsAt 2026-11-30,
  5 `payment.confirmed` a admins, mail resguardo best-effort (Resend).

## Bug corregido (root cause)

- Flow reporta `invoices[].amount` como **string** (`"25000.0000"`);
  `normalizeInvoice` lo pasaba crudo → `payment.create(amount:"25000.0000")`
  → Prisma `Expected Int, provided String`, tragado por el try/catch
  best-effort del refresh (fallo silencioso). Pegaba en MEMBERSHIP y
  PLATFORM_SUB. Fix: `Number(inv.amount)` (NaN → 0 → fallback de
  precio de plan) en `flow.gateway.ts` + tipo crudo `number | string`.
- Tests: +2 en `flow.gateway.spec.ts` (50/50; suite payments 664/664;
  `tsc --noEmit` limpio).

## Hallazgo de ambiente (no bug): tope del mandato

- La invoice anual PRO de La Casa del Mambo (`sus_m0fbb9feea`,
  invoice `1238979` $1.223.898) **rebotó**: el monto supera el tope
  autorizado en el mandato de la tarjeta (contract cap del
  `customer/register` en Webpay; Flow error "greater than that
  authorized in the contract"). `morose=2` = pendiente no vencida
  (vence 2026-11-04); Flow reintenta solo (next_attemp 2026-11-02
  15:50 CLT). `paymentLink` no disponible: solo se paga vía mandato.
- Tope real desconocido (entre $25.000 y $1.223.898 - el cobro de
  $25.000 pasó). `customer/get` no lo expone.
- Re-registro generado para subir el tope:
  `customer/register` cus_cffffb8772 →
  `https://sandbox.flow.cl/app/customer/disclaimer.php?token=7ACAF0F7E8AEB523867D2FE5B4C863B07D2BD18F`
  (url_return → `${API_URL}/api/payments/flow/platform-customer-return`;
  el return no claimea nada porque la sub ya está ACTIVE - la gracia
  es el mandato nuevo).

## Pendiente

- Completar el primer cobro PLATFORM_SUB de `sus_m0fbb9feea`:
  re-registrar tarjeta con tope ≥ $1.223.898 y esperar retry de Flow,
  o cancelar y suscribir un ciclo/tier más barato (COBROS monthly
  $39.990 probablemente entre bajo el tope actual).
- `customer/collect` (cobros sueltos plataforma→actor): sin
  implementar.
- API corriendo con PAYMENT_GATEWAY=flow + tunnel devtunnels
  `hvr4lkk3-4000.brs.devtunnels.ms` (webhook subscription/callback
  ya llegó: INBOUND_WEBHOOK auditado).
- Scripts nuevos útiles: `apps/api/scripts/flow-call.cjs`
  (GET firmado genérico a Flow) y
  `smoke-membership-sub-charge.cjs` (subscribe + poll reconcile).
- Nota de entorno: `prisma generate` tuvo que re-correrse (cliente
  stale → `nest start --watch` moría con 2598 errores TS). Si la API
  no compila, correr `cd apps/api && pnpm exec prisma generate`.
