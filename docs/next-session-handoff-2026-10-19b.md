# Handoff - 2026-10-19b (post wallet-passes — programa completo)

## Programa de 4 slices completado (dev, pusheado)

- `staff-offline-checkin` → `1299282`
- `fintoc-gateway-adapter` → `2b692af`
- `admin-billing-documents` → `ed886b5`
- `wallet-passes` → este commit:
  - `TicketDayOfService` + `TicketsScheduler` (cron 13:00 UTC ≈09:00 CL):
    push `ticket.day_of` a dueños de tickets ACTIVE de eventos del día
    (día calendario America/Santiago), dedup por (person, event, día).
  - `GET /wallet/google` → saveUrl Google Wallet (GenericPass JWT RS256,
    **lanzador a /qr sin barcode** — el QR personal rotativo es la
    credencial canónica única, decisión de producto). 503 sin
    credenciales → botón oculto. Envs `GOOGLE_WALLET_*` en .env.example.
  - `/eventos?view=mios` muestra órdenes PENDING (manual en revisión)
    como cards ámbar "pago en validación" — nadie llega a puerta
    creyendo que tiene entrada.
  - Install chaining: ya cubierto por InstallPrompt/PushOptIn globales.

## Verificación

- API vitest: **1675/1675, 82 archivos**
- API tsc + web tsc limpios; `next build` completo; i18n `ALL_KEYS_OK`
- openapi/postman regenerados: **238 paths** (+/wallet/google)
- openspec validate: válido

## Gaps conocidos (declarados, para próxima sesión)

- Day-of push nunca ejercido end-to-end (requiere cron real + push opt-in).
- SaveUrl de Google Wallet no probado contra el panel real (JWT válido,
  pero el issuer/class deben crearse en Google Wallet Console primero).
- QA visual de cards "en validación" y botón wallet (browser real).
- `FiscalProfile` sin captura UI (billing emite con nombre Person).
- Sin e2e del flujo manual completo en sandbox.

## Roadmap restante (fuera del programa actual)

- Apple Wallet equivalente (pass con link a /qr).
- DTE/SII formal cuando exista facturación electrónica.
- E2E sandbox flows + QA visual pre-release → release gate dev→main.
