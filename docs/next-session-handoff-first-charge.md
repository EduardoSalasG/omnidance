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

## Update 2026-11-02 (misma sesión, posterior)

- **Re-registro de tarjeta verificado OK**: `getRegisterStatus` status "1",
  `registerDate` 2026-11-02 12:00:42 (mismo `tbkUser`, mandato
  renovado). El POST de Flow llegó a `platform-customer/register-return`
  (auditado); el "redireccionando" colgado del browser es cosmético.
- **Asunto del mail de resguardo cambiado** (commit `43a2de3e`):
  `Pagaste: <producto>` (ej. "Pagaste: Esencial, Clave Timba");
  producto membresía usa coma; `<title>` del shell igual prefijo.
  Change `receipt-subject-pagaste` archivado; spec payments/notifications
  actualizada.

## Update 2 (2026-11-02): primer cobro PLATFORM_SUB VERIFICADO

- El re-registro NO subió el tope: el retry de la invoice `1238979`
  ($1.223.898) ya corrió (attemp_count 2, 12:00:42) y rebotó igual.
  El tope del mandato sandbox queda entre $39.990 y $1.223.898.
- Smoke nuevo `smoke-platform-sub-charge.cjs` (crea academia + subscribe
  COBROS MONTHLY + poll): academia `cmvze8fmd000e6b31e52lt5el` "Academia
  SmokeSub" → sub `sus_wb16946391` ACTIVE → invoice `1239701` cobrada →
  `Payment PAID $39.990` (`platsub_cmvze8fq7000h6b31ohzr58ct_1239701`),
  ledger RENEWAL_SETTLED, academy.tier=COBROS, mail "Pagaste: Suscripción
  COBROS · mensual · factura 1239701".
- Ambos primeros cobros verificados E2E: MEMBERSHIP $25.000 y
  PLATFORM_SUB $39.990.

## Pendiente

- ~~La invoice anual `1238979` de La Casa del Mambo seguirá impaga~~
  SUPERADO: la sub `sus_m0fbb9feea` quedó CANCELED (Flow y local) sin
  retry posible; la verificación se hizo con una sub nueva (Update 4).
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

## Update 3 (2026-11-02): tope Cargo Automático resuelto + fix OTP

- **El "tope del mandato" era otra cosa**: la doc oficial de Flow fija
  límites default del producto Cargo Automático POR CUENTA COMERCIO:
  $250.000/transacción, $500.000 diarios por cliente, 5 pagos/día.
  Por eso $25k-$60k cobran y $1.223.898 no (no era el mandato Webpay;
  re-registrar la tarjeta nunca iba a arreglarlo). **Restricción real
  de producción**: PRO anual no cabe en el límite default; para cobrarlo
  hay que pedir alza a soporte@flow.cl o usar el camino manual
  (invoice por email/link de pago, sin Cargo Automático).
- **OTP cuenta desactivada (fix)**: código válido + `deletedAt` ahora
  responde "Tu cuenta está desactivada..." y NO consume el OTP (queda
  válido si el admin reactiva dentro del TTL). Antes quemaba el código
  y decía "Código inválido o expirado". Change otp-deactivated-honest.
- **buy-ticket-cta migrado**: ConfirmSheet ganó slot `children` para el
  link /qr; consolidación de confirms completa.

## Update 4 (2026-11-03): alza de límite Cargo Automático VERIFICADA

- Soporte Flow subió el tope de la cuenta sandbox a ~$2.000.000/tx
  (el default era $250.000/tx, $500.000/día por cliente).
- La sub vieja `sus_m0fbb9feea` (PRO ANNUAL, invoice impaga `1238979`
  $1.223.898) quedó **status 4 CANCELED en Flow y CANCELED local**
  (cancel_at 2026-11-02 12:09, `next_attemp_date: null`): no había
  retry que esperar; se descartó ese camino.
- **Prueba**: `POST /academies/:id/subscribe` PRO ANNUAL sobre La Casa
  del Mambo (`cmud59yqn0152dtbm8d8tun6q`), payer `cus_cffffb8772`
  (Eduardo, tarjeta Visa ···6623 vigente): 201 → sub remota
  `sus_wb1a57f42b` ACTIVE → **invoice `1240416` $1.223.898 cobrada en
  attemp_count 1** (antes rebotó 2 veces por el tope).
- Local: `Payment platsub_cmw14ugpx003mf8sjqso9lq2i_1240416` PAID
  $1.223.898 CLP gateway FLOW; eventos
  ORDER_CREATED→STATUS_CONFIRMED→RENEWAL_SETTLED; platsub
  `cmw14ugpx003mf8sjqso9lq2i` ACTIVE PRO ANNUAL, nextInvoiceAt
  2027-11-03; academia tier PRO sin billingBlockedAt.
- Script nuevo `apps/api/scripts/smoke-pro-annual-limit.cjs`
  (subscribe PRO ANNUAL sobre academia existente + poll); sin
  commitear al cierre de esta sesión.
- **Recordatorio producción**: el plan anual PRO solo cabe con alza
  de Cargo Automático aprobada en la cuenta comercio; pedirla a
  soporte@flow.cl antes de habilitar venta de anuales en prod.
- Tunnel `hvr4lkk3-4000.brs.devtunnels.ms` vivo (health 200); API en
  PAYMENT_GATEWAY=flow.

## Update 5 (2026-11-03): `customer/collect` implementado (mora)

- Change OpenSpec `overdue-invoice-collect` (validate verde, sin
  archivar al cierre). Alcance aprobado: capability + integración en
  mora, ambas suscripciones.
- `SubscriptionProvider.collect()` nuevo: `customer/collect` de Flow
  (type 1 cargo sincrónico, type 2/3 link/email) normalizado a
  `COLLECTED`/`PENDING`/`FAILED` + `CollectResult`. Stub simulado.
- `SubscriptionInvoice.nextAttemptDate` ← `next_attemp_date`: la llave
  anti doble-cargo (solo se colecta sin retry agendado o bajo morose
  sin fecha reportada).
- Reconcile (platsub + membresías): `collectOverdueInvoices` corre
  ANTES del handler de mora; Payment PENDING pre-claim con refId de
  renovación (`platsub_<sub>_<inv>` / `mem_<plan>_<inv>`, ≤45);
  COLLECTED → settle renewal + `markInvoice`; FAILED → FAILED y corta;
  PENDING → `collectUrl` en el data de la notif de mora; error de API
  libera el claim (delete) y corta. Una invoice con Payment PAID en su
  refId queda `coveredIds` → no cuenta como deuda de mora (evita notif
  de gracia tras recuperación exitosa).
- Tests: flow.gateway 59/59, platform-subscriptions 96/96 (7 nuevos
  de collect + mocks delete/deleteMany), subscriptions 75/75
  (2 nuevos + 5 tests de mora pinchados con mockRejectedValue).
  `tsc --noEmit` limpio.
- Pendiente del change: docs (architecture/flows/qa-inventory) y
  `openspec archive`. Sin commit (working tree) como el resto de la
  sesión.
