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

## Verificación

- [x] Suite API completa: 793 tests (3 fallos corregidos: fixture
      determinista en checkout + precedencia VAPID_SUBJECT en spec).
- [x] `tsc --noEmit` limpio api + web.
- [x] prisma db push + generate aplicados (`Event.serviceFeeClp` en DB).
- [x] OpenAPI + Postman regenerados: 124 paths.

## Pendiente conocido

- BullMQ/Redis sigue diferido — node-cron in-process.
- Contraste de color (ratios exactos), asteriscos visuales en `required`,
  `min-h-screen` vs `min-h-dvh` inconsistente, StarRating sin radio
  semantics — decisiones de diseño diferidas, documentadas por la auditoría.
- Venue payouts: visibles solo para admin (Venue no tiene ownerId).
- Web Push en producción requiere keys VAPID propias por entorno.
