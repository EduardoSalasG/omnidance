# Proposal: cobranza de academias con gateway propio (BYO) + take facturado mes vencido

## Resumen

Hoy las ventas de academias pasan por **nuestra** cuenta Flow y se
liquidamos por payout (bruto − pasarela ~3,19%, sin comisión). Eso nos
convierte en merchant of record del GMV ajeno (exposición SII,
especialmente con academias informales), nos obliga a operar payouts
de academias y mantiene su plata en nuestro float.

El owner decidió (sesión 2026-11-09) migrar al modelo **BYO estilo
Membrezia/VirtualPos**: la academia trae sus credenciales de pasarela
(Flow / MercadoPago / otras del `GatewayRegistry`), el checkout cobra
por SU adaptador y la plata va directo a su cuenta. Omnidance nunca
recibe plata de academias: **le factura mes vencido** su suscripción
SaaS + un take sobre lo cobrado por pasarela.

Decisiones aprobadas:

- **Take: 1% neto + IVA** sobre operaciones cobradas por pasarela
  (MEMBERSHIP/WORKSHOP/PRIVATE gateway-PAID). Flat, un solo param
  `academy_fee.net_pct` editable en /admin (precio de adopción; sube
  por param cuando el volumen lo justifique — evaluado vs Membrezia/
  BoxMagic: ninguno cobra take, el de la academia con su pasarela ya
  es ~3–4%; con 1% su all-in ≈ 4,2–5,4% ≈ a menos de ~1,2pp del DIY).
- **Cobro mes vencido**: el take se acumula por `Payment` del período
  y viaja en la factura de la `PlatformSubscription` (o claim mensual
  dedicado). Omni jamás liquida payouts de academias.
- **Bloqueo por liquidación impaga**: si la academia no paga su
  liquidación, se deshabilitan sus medios integrados (BYO) — el
  checkout de sus alumnos queda solo con **claim manual por
  comprobante** (gratis, no nos implica). El reconcile de invoices
  impagas setea/libera el flag (`collectionsBlockedAt` o equivalente).
- **Deprecar el path our-Flow** para ventas de academia: elimina la
  operación de payouts de academia (GATEWAY_FEE_PASSTHROUGH +
  ACADEMY_COBROS_TAKE se retiran del modelo nuevo; subsisten solo para
  liquidar históricos).
- **Liquidación mensual exportable**: estado de cuenta del período
  por academia — operaciones por pasarela, take devengado por orden,
  total facturado neto+IVA — exportable **PDF** (reusa
  `buildTablePdf`, mismo formato/diseño del reporte de cobros) y
  **CSV** (patrón producer-export).
- **Precios neto + IVA** (convención B2B, como el fee de productor):
  el cargo del ciclo y el take se cotizan netos y el documento muestra
  el IVA desglosado. Revisar si los params `*_monthly_clp` actuales se
  reinterpretan como neto (decisión de pricing, documentarla).
- Academias sin credenciales propias → solo cobro manual por
  comprobante (canal de las informales; gratis).
- ANNUAL sigue solo para tiers de plataforma.

## Por qué BYO

- La arquitectura ya existe: `ProducerGatewayAccount` (AES-256-GCM,
  `OWN_GATEWAY`, webhook `?account=<id>`, `GatewayConfirmation`
  normalizado) — se generaliza a academias.
- Cero exposición fiscal: el GMV nunca entra a nuestra cuenta.
- Cero payouts de academia: se elimina la peor operación manual.
- El leverage de cobro pasa de "retener su plata" a "retener la
  automatización" (bloqueo BYO por impago).

## Cambios

- `AcademyGatewayAccount` (o generalizar la tabla a actor-scope):
  credenciales por academia cifradas, alta desde su consola, probe de
  conexión.
- Checkout de órdenes de academia resuelve el adaptador de SU cuenta
  (webhook ya enruta por `?account=`); si no tiene credenciales →
  solo claim manual.
- Devengado del take: `Payment` gateway-PAID de la academia por
  período → línea de factura neta ×(1+IVA).
- Facturación: el take viaja en el cobro del ciclo de
  `PlatformSubscription` (o `PlatformInvoice`/claim propio); mora →
  flag `collectionsBlockedAt` → checkout BYO rechaza gateway-orders
  de esa academia (claims manuales siguen).
- Liquidación mensual por academia: endpoint + export PDF
  (`buildTablePdf`) + CSV; visible en su consola y en /admin/finanzas.
- Deprecación: nuevas ventas de academia no generan líneas de payout;
  el código de payout de academia se conserva para histórico y se
  retira del flujo nuevo.
- Params: `academy_fee.net_pct` (1,0), posible override por tier.

## Scope

- In: BYO gateway academias, take 1% neto+IVA, factura mes vencido,
  bloqueo por impago, liquidación PDF/CSV, params/precios neto+IVA.
- Out: modelo de inscripciones/estados/vigencia (change
  `enrollment-plan-simplify`), pase social/tickets de productores
  (no cambian), Fintoc payout rail.

## Specs afectadas

- `payments` — cobro por cuenta BYO de academia, deprecación de su
  payout, devengado del take.
- `academy-billing` — factura mes vencido con take, bloqueo por
  impago, neto+IVA.
- `checkout` — resolución de gateway por cuenta del actor.
- `admin-finance` — liquidaciones mensuales de academia (PDF/CSV).
