# Proposal: auth-sessions

## Why

La sesión es JWT stateless de 30 días: no hay tabla de sesiones, así que
el admin no puede ver ni matar sesiones activas (brecha detectada en la
auditoría 2026-11-10, B1/B7 backend). Tampoco hay telemetría de
instalación de la PWA ni de tipo de dispositivo: `PushToken` solo existe
para quienes aceptaron push y sin userAgent.

## What Changes

- `AuthSession(jti, personId, userAgent, ip, createdAt, lastSeenAt,
  revokedAt)` persistida al emitir sesión (verify magic/otp/login);
  `SessionGuard` valida jti no revocado por request (con cache corta si
  el costo lo amerita).
- Matar sesiones: la persona ve y revoca sus propias sesiones
  ("mis dispositivos" en perfil); el admin ve y revoca sesiones de
  cualquier persona desde su ficha. Revocar = `revokedAt`.
- Telemetría de instalación/uso: el front emite `app.launch` a
  `AnalyticsEvent` al arrancar con `display-mode`, plataforma y UA →
  entidad `dispositivos` en la consola `/analitica` (lente ADMIN):
  instaladas (standalone) vs browser, por dispositivo.
- `PushToken` += `userAgent`/`platform` en el registro.

## Capabilities

`auth` (sesiones) + `analytics` (dispositivos en consola de consultas).

## Out of scope

- Rotación/refresh de JWT ni reduce el TTL (evaluable después).
- Cloudflare/nginx/CF-IP real del cliente (ip es la vista por el server).
