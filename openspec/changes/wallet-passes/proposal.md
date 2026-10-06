# Change: wallet-passes

## Por qué

La entrada digital tiene dos fricciones hoy: el día del evento la
persona debe recordar abrir la app (no hay empuje day-of), y una orden
por método propio en revisión es **invisible** en la vista de entradas -
la persona puede llegar a puerta creyendo que tiene ticket válido.

Decisión de producto (conversada): el QR personal rotativo es la
credencial canónica - NO se crean QR por entrada. El wallet pass es
un **lanzador** a `/qr`, nunca una segunda credencial (Google Wallet
RotatingBarcode no puede reproducir el JWT HS256 del QR sin cambiar la
verificación - queda fuera).

## Qué cambia

- `GET /payments/mine` ya devuelve las órdenes PENDING - la vista
  "Mis entradas" (`/eventos?view=mios` → TicketWallet) las muestra como
  cards "pago en validación" (ámbar, sin link al QR, sin QR usable).
- Cron day-of (`TicketsDayOfService` + scheduler 09:00 hora Chile):
  eventos PUBLISHED/LIVE que empiezan hoy (día America/Santiago) →
  `Notification` `ticket.day_of` a dueños de tickets ACTIVE - dedup por
  (person, event, día) vía `data.eventId`.
- `GET /wallet/google` → `{saveUrl}` con JWT RS256 firmado por la
  service account (GenericPass lanzador a `/qr`, sin barcode);
  503 `wallet.not_configured` sin credenciales → el botón se oculta.
- Install chaining: ya cubierto por `InstallPrompt`/`PushOptIn`
  globales - el push aterriza en `/qr` y la cadena existe; se documenta.

## Fuera de scope

QR por entrada, RotatingBarcode (incompatible con JWT HS256 del QR
personal), Apple Wallet, gating del QR por día del evento.
