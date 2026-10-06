# Change: admin-billing-documents

## Por qué

`omni-dance.md` declara la deuda: "BillingDocument - la factura formal
al productor por nuestro fee". El PayoutLine ya deja la contabilidad
lista; falta el documento emitible con folio correlativo que el
productor pueda descargar (documento interno v1 — NO es DTE/SII).

## Qué cambia

- `BillingDocument` (folio único correlativo, snapshot del receptor,
  líneas JSON, net/IVA/total, estado ISSUED|VOID, pdfKey en storage
  privado) + `BillingCounter` (folio atómico bajo concurrencia).
- `POST /admin/billing/generate {payoutId}` — idempotente por
  `payoutId @unique`; líneas = cargos del payout (PLATFORM_FEE_*,
  OWN_METHOD_FEE_*, GATEWAY_FEE_PASSTHROUGH).
- `GET /admin/billing` (+candidates: payouts recientes sin documento),
  `GET /admin/billing/:id/pdf`, `POST /admin/billing/:id/void {reason}`.
- `GET /me/billing` + `GET /me/billing/:id/pdf` (actor dueño).
- PDF propio (pdfkit, layout documento — no la tabla genérica).
- Audit `BILLING_ISSUE` / `BILLING_VOID`.
- UI `/admin/facturacion` + card en el hub.

## Fuera de scope

DTE/SII real (folio CAF, timbre), envío por email, documentos que no
nazcan de un payout (billing por período libre), perfil tributario del
receptor editable (FiscalProfile existe pero aún no se captura).
