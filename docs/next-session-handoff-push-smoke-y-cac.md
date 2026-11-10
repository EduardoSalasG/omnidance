# Handoff: smoke push verificado + reporte CAC por canal

Sesión 2026-11-10 (noche, continuación de `acquisition-y-campanas`).
Se atacaron los 2 pendientes elegidos por el owner: smoke manual de
push de dispositivo (con script nuevo) y el reporte CAC por canal
(change implementado y archivado).

## Trabajo completado

### 1. `admin-acquisition-report` (archivado, commit `4ff49376`)

- Superficie decidida por owner: entidad `acquisition` en la consola
  de consultas `/analitica`, lente ADMIN (la superficie viva de
  analíticas; `GET /analytics/summary` ya no tiene consumidor en web).
- `QUERY_CATALOG.ADMIN` += `acquisition`: filtros `from`/`to` (sobre
  `Person.createdAt`) y `kind` enum multi (primer filtro multi del
  catálogo); columnas `canal`,`altas`,`pct`.
- Handler en `ADMIN_ENTITIES`: canal = referral más antigua como
  referida (`invite`/`gift_ticket`/`link`) > `acquisitionSource`
  (utm:/ref:/landing:/direct) > `sin_dato`. Orden altas desc + canal;
  `total` = canales; `summary` = "N altas en M canales". Filas sin
  personId (agregado, sin drill).
- `filters.ts`: enums `multi: true` ahora validan CADA parte del CSV
  por whitelist (run + saved) - antes un CSV entero caía en 400
  (latente, ningún filtro era multi).
- i18n 4 catálogos: `query.entities.acquisition`, `query.filters.kind`,
  `query.cols.acquisition.*`, `query.optionLabels` para los kinds y
  `sin_dato`.
- `ENTITY_TITLES.ADMIN.acquisition` = "Altas por canal".
- No es CAC monetario: reporta altas por canal (no hay spend por
  campaña). Documentado en design.md del change.

### 2. Smoke manual de push de dispositivo (verificado en laptop)

- Script nuevo `apps/api/scripts/send-test-push.cjs`:
  `node scripts/send-test-push.cjs <email> [path] [título]` crea la
  Notification (type `test.push`, data `{path}`) + entrega web push a
  todos los PushToken de la persona, con limpieza de endpoints
  404/410 igual que WebPushSender.
- **Canal in-app verificado**: las notifications llegan a la campana
  del teléfono.
- **Device push verificado en laptop Chrome (FCM)**: banner del
  sistema → tap → abrió `localhost:3000/eventos` (data.path navega;
  error de carga inicial fue transitorio, retry OK).
- **iOS/teléfono NO automatizable ni viable hoy**: la PWA corre en
  `http://192.168.100.5:3000` (no-HTTPS) y iOS exige contexto seguro
  para SW/push. El token Apple viejo (sept) era de un origen muerto.
  Owner descartó probar push en el teléfono por ahora: el tunnel
  HTTPS (devtunnels/cloudflared) choca con las redirects del API que
  usan `WEB_URL=http://localhost:3000` (verify magic link, invites,
  retornos de pago) - habría que parametrizar WEB_URL al tunnel o
  hacerlo configurable por request para que el flujo completo sirva.
  `CORS_ORIGINS` ya trae un devtunnels viejo
  (`https://hvr4lkk3-3000.brs.devtunnels.ms`) de un intento previo.

## Verificación corrida

- API: `query.service.spec.ts` 20/20 (+4 nuevos: agregación/orden/pct,
  referral gana, kind por prefijo CSV + 400, from/to), `npx tsc
  --noEmit` limpio. API sin eslint config (lint del repo = solo web).
- Web: i18n-audit `ALL_KEYS_OK` (los parts de query quedaron con
  formato idéntico, solo adiciones).
- `openspec validate --changes` verde; change archivado con delta
  aplicado a `analytics/query-console`.
- Push: `send-test-push.cjs` → endpoint FCM `ok` + tap verificado por
  el owner hasta `/eventos`.

## Notas de entorno

- **Se re-levó `pnpm dev:api`** (sigue corriendo, PID 37356).
- **Git Bash parte paths absolutos**: `node script.js arg /eventos`
  envía `C:/Program Files/Git/eventos` (MSYS path mangling). Usar
  `MSYS_NO_PATHCONV=1` delante del comando.
- La suscripción FCM vieja de `admin@` apuntaba a origen muerto
  `127.0.0.1:51184` (dev server viejo): el push llegaba pero el tap
  daba ERR_CONNECTION_REFUSED. El PushToken stale se borró a mano;
  el usuario se re-suscribió en `localhost:3000` via banner
  (`localStorage.removeItem("omnidance:push-optin-dismissed")` +
  reload) o snippet de consola con `pushManager.subscribe`.
- El commit-msg hook rechaza cualquier trailer `Co-Authored-By`
  (aunque sea `nobody`): mensaje solo descriptivo.
- Comentario doc `/** x:*/y:*/ */` cierra el bloque antes de tiempo
  (el `*/` dentro) - costó un ciclo de tsc.

## Pendientes

- **Push iOS real**: descartado por el owner de momento (ver nota del
  tunnel/WEB_URL en "Trabajo completado"). Queda cubierto por el smoke
  en laptop.
- Flujo real de dominio como trigger de push (el script usa type
  `test.push`; las notificaciones reales con data.path ya están
  cubiertas por el contrato, pero un smoke de una real - ej. invite -
  queda pendiente si se quiere).
- multipais-foundation tasks 10/11/13 (sin abrir).
- `academy.sale_deal.responded` scope series sin ficha (decisión
  producto).
- `claimUrl`/`collectUrl`/`paymentUrl` en data de notificaciones son
  URLs de API - si se quiere CTA directo a página de pago, emitir
  `path` (decisión producto).

## Próxima sesión sugerida

1. Si el owner quiere push iOS: tunnel HTTPS y repetir smoke en
   teléfono.
2. multipais-foundation task 10/11/13 si el owner prioriza.
3. Decisiones producto abiertas (ficha sale_deal, URLs en push data).
