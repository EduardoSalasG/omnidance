# Design: auth-sessions

## Modelo

```prisma
model AuthSession {
  id         String    @id @default(cuid())
  jti        String    @unique
  personId   String
  userAgent  String?
  ip         String?
  createdAt  DateTime  @default(now())
  lastSeenAt DateTime  @default(now())
  revokedAt  DateTime?
  person     Person    @relation(fields: [personId], references: [id])
  @@index([personId, revokedAt])
}
model PushToken { ... userAgent String?  platform String? }
```

El JWT lleva `jti` (nuevo claim; los tokens viejos sin jti quedan fuera
de revocación — aceptable, expiran). `SessionGuard` valida
`revokedAt == null` solo cuando el claim jti existe; lookup por request
con cache in-memory corta (60s por jti) para no pegarle a la DB cada vez.

## Emisión

`verify` magic/otp/password login emiten `AuthSession` con el jti del
token emitido (generar jti = random id, va en el JWT y en la fila).
UA e IP de los headers de la request.

## Revocación

Self: `/me/sessions` (list) + `DELETE /me/sessions/:id` +
`POST /me/sessions/revoke-others` (todas menos la actual).
Admin: `/admin/users/:personId/sessions` +
`DELETE /admin/sessions/:id` + `revoke-all` (incluye la actual del
usuario si la tiene — es el punto de matar sesiones).

## Telemetría

`POST /analytics/track` (público, throttle): body
`{event:"app.launch", displayMode, platform}` + UA del header;
persiste AnalyticsEvent con personId de sesión si la hay.
Front: un efecto en el layout app que dispara una vez por arranque
(matchMedia display-mode standalone/browser; plataforma por
`navigator.userAgentData?.platform` o UA fallback).
Entidad `dispositivos` en `QUERY_CATALOG.ADMIN`: modos
(instalada/browser) × plataforma, filtros from/to + platform multi —
misma máquina que `acquisition`.

## Dependencia con api-edge-hardening

Este change toca `auth.controller.ts`/`auth.service.ts` y
`schema.prisma` — los mismos archivos que `api-edge-hardening`. La
implementación del core de sesión corre DESPUÉS de que ese change
aterrice; el slice de telemetría/admin es paralelizable.

## Riesgos

- Lookup jti por request: mitigado con cache 60s; sin cache el costo es
  1 read indexado por request autenticada.
- Tokens pre-change sin jti: siguen válidos sin revocación hasta expirar
  (documentado, no bloquea).
