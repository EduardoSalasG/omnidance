# Tasks — backlog-closure

## Implementado

- [x] Payouts ACADEMY/VENUE — `computeSettlement` usa el vínculo transitivo
      `Payment.eventId → Event.academyId/venueId` con `producerId = null`
      (la entidad produjo directamente; si hay productor, éste devenga).
      Solo TICKET/PAID. `me/payouts` incluye academias del owner
      (`Academy.ownerId`); Venue sin ownerId → solo admin.
- [x] Fee por evento — `Event.serviceFeeClp Int?` (override admin del param
      global `service_fee.presale_clp`). Checkout y webhook honran
      `event.serviceFeeClp ?? param`. POST/PATCH /events lo acepta solo con
      `admin.access` (presencia del campo sin permiso → 403; null limpia).
      GET list+detail lo exponen; consola productor lo muestra read-only.
- [x] `POST /crm/triggers/evaluate-all` — `crm.manage` + `admin.access`
      (operación platform-wide); devuelve el resultado del servicio tal cual.
- [x] BottomNav — tab `/notificaciones` con badge de no-leídas (unreadCount
      inicial + `omnidance:notification` incrementa; reset por pathname).
- [x] PWA icons — `icon-192.png`, `icon-512.png` (any) y
      `icon-512-maskable.png` generados por `apps/web/scripts/generate-icons.mjs`
      (Node puro, sin deps); manifest actualizado.
- [x] Fix env — `WebPushSender` lee `WEB_PUSH_VAPID_SUBJECT` (con fallback a
      `WEB_PUSH_SUBJECT`); spec cubre la precedencia.

## Auditoría a11y/UX (agente D + fixes)

- [x] Auditoría estática completa de `apps/web` (semántica, ARIA, teclado,
      touch, motion, contraste, formularios, estados, i18n).
- [x] Fixes críticos: input búsqueda admin sin label, botones "+" y "↻" sin
      nombre accesible.
- [x] Fixes importantes: `aria-invalid`/`aria-describedby` en inputs con
      error, focus trap+restore en bottom-sheets, tabs ARIA completos en
      academy-console, `aria-current`/`aria-pressed` en admin, progressbar
      con nombre, live regions en escanear y estados loading/error/empty
      sistémicos, indicador no-leída para AT, touch targets <44px.
- [x] Menores: alt redundantes, `role="img"` en canvas QR, regiones
      scrolleables con teclado, i18n hardcodeado, labels por fila,
      `target="_blank"` anunciado.

## Cierre de diferidos

- [x] Contraste medido (script `apps/web/scripts/contrast-check.cjs`):
      `text-white/50+` ya cumple AA en todos los fondos night; solo
      `text-white/40` fallaba (3.5-3.8:1) → subido a `/50` en placeholders
      (3 archivos). Glifo ☆ de StarRating queda (UI non-text, pasa 3:1).
- [x] `min-h-screen` → `min-h-dvh` unificado (37 ocurrencias, 25 archivos).
- [x] Indicador `*` visual en los 32 inputs `required` (15 archivos);
      label sr-only de transferencia convertido a visible.
- [x] StarRating: APG radiogroup (roving tabindex, flechas, Home/End) en
      modo interactivo; `role="img"` + label localizado en display.
- [x] `Venue.ownerId` → `me/payouts` incluye payouts VENUE del owner
      (venue se fija por admin/seed — no hay CRUD de venues en v1).

## Verificación

- [x] Suite API completa: **795/795 tests (34 archivos)**.
- [x] `tsc --noEmit` limpio api + web.
- [x] prisma db push + generate aplicados (`serviceFeeClp`, `Venue.ownerId`).
- [x] OpenAPI + Postman regenerados: 124 paths.
- [x] Build web verde: 30 rutas.

## Pendiente conocido

- BullMQ/Redis sigue diferido por diseño — node-cron in-process cubre el
  volumen v1 (un dev, infra mínima); Redis disponible en docker-compose.
- Sin migraciones versionadas (`prisma/migrations/` no existe — el repo
  usa `db push`); crear la baseline es decisión aparte.
- Web Push en producción requiere keys VAPID propias por entorno.
