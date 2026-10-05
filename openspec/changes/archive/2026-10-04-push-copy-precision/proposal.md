# push-copy-precision

## Why

Las notificaciones que llegan al teléfono (web push + bandeja in-app) usan
títulos largos con prefijos boilerplate ("Pago confirmado — …", "Tu reserva
de mesa fue confirmada", "Te liquidaron la comisión de una clase
particular"). En lockscreen el título se trunca ~40-50 chars y el body a
~2 líneas: el prefijo se come el espacio y la información clave (qué cosa,
quién, cuánto) queda cortada o enterrada.

## What Changes

- Convención de copy para push: **title = estado/outcome** (frase corta,
  sin prefijo de categoría ni punto final); **body = hechos clave**
  separados por ` · `, con acción pendiente al final tras `—` solo cuando
  el usuario debe hacer algo.
- Reescritura verbatim de los ~20 call sites de `notifySafe`/`notify` en
  `apps/api/src` (payments, subscriptions, academies, events, sessions,
  social, admin, leads). Sin cambios de `type`, `category` ni `data`.
- Los strings de campañas CRM (`crm.campaign`, triggers) quedan fuera:
  son copy redactado por el operador, no plantilla fija.

## Impact

- Affected specs: `notifications/push-copy` (nueva capability).
- Affected code: `apps/api/src/**` — solo literales `title`/`body`.
- Tests: ningún spec aserta sobre `title`/`body` (verificado) — no rompe
  assertions; se agrega un test de convención (largos máximos).
