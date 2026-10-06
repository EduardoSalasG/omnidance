# Handoff - 2026-10-19 (post admin-billing-documents)

## Completado (dev, pusheado)

- `staff-offline-checkin` → `1299282` (manifest + cola IndexedDB + sync batch + sw cache)
- `fintoc-gateway-adapter` → `2b692af` (FintocGateway + puerto con ctx firmado + cuentas propias)
- `admin-billing-documents` → este commit: `BillingDocument` + `BillingCounter` (folio atómico), emisión idempotente por `payoutId`, líneas desde `PayoutLine`, PDF documento (`common/billing-pdf.ts`) en storage privado, void con motivo + evidencia, `/admin/facturacion` + candidates, sección "Notas de cobro" en `/productor/pagos`, `/me/billing` + PDF propio. Migración `20261019000000_billing_documents`.

## Verificación

- API vitest: **1670/1670, 80 archivos** (billing: 7 service + 5 controller)
- API tsc + web tsc limpios; i18n `ALL_KEYS_OK`
- openapi/postman regenerados: **237 paths** (+7 billing)
- openspec validate: válido
- impeccable CLI no instalado (limitación declarada; fallback = revisión contra el sistema atómico)

## Pendiente

- `wallet-passes` (último slice del programa): day-of push, Google Wallet como **lanzador** del QR personal (RotatingBarcode NO reproduce el JWT HS256 - decisión tomada), install chaining, estado "pago en validación" en `/entradas`.

## Gaps conocidos

- `FiscalProfile` existe pero nunca se captura por UI - las notas emiten con nombre de Person cuando no hay perfil fiscal.
- QA visual de `/admin/facturacion` pendiente (browser real).
