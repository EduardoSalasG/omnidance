# Auditoría exposición y DDoS — 2026-11-10

Evaluación defensiva read-only: probes ligeros contra producción + auditoría
del repo. Sin load testing, fuzzing ni port scanning.

## Mapa del perímetro confirmado

```
Internet
 ├─► omnidance.tech  ──►  Netlify Edge (75.2.60.5)
 │      Next.js + rewrites: /api/*, /socket.io/* ──► API_PROXY_TARGET
 │
 └─► api.omnidance.eduardosalasg.dev  ──►  A 146.181.44.133 (Oracle VM, DIRECTO, sin CDN/WAF)
        Nginx 1.18.0 (Ubuntu) ──► 127.0.0.1:3002 ──► container omnidance-api (:4000)
        DB: Neon Postgres (pooler) · Redis: no se usa en runtime
```

Evidencia de probes:

- `api.omnidance.eduardosalasg.dev` → A directo `146.181.44.133` (IP pública
  de la VM, trivialmente descubrible).
- `omnidance.tech` → `75.2.60.5` (Netlify apex LB); www → CNAME
  `omnidance.netlify.app`. CDN delante.
- OPTIONS con `Origin: https://evil.example.com` → 204 sin
  `Access-Control-Allow-Origin` (whitelist CORS funciona).
- `GET /api/docs` y `/api/docs-json` → 200 públicos (Swagger + schema completo).
- `GET /api/events/near` → `X-RateLimit-Limit: 300 / Remaining / Reset: 60`
  (throttler activo por IP).
- `/api/health` responde sin headers `X-RateLimit` (es `@SkipThrottle`).
- `GET /socket.io/?EIO=4&transport=polling` emite `sid` a anónimos.
- `POST /api/payments/webhook/FLOW` con token falso → 400, pero el adapter
  hizo una llamada firmada saliente a Flow antes de rechazar.
- `http://api…` → 301 a HTTPS; TLS Let's Encrypt válido.
- `GET /api/admin/users` anónimo → 401.
- Puerto de la app publicado solo en loopback (`127.0.0.1:3002:4000` en
  `apps/api/docker-compose.yml`); nginx es la única puerta.
- **La config de nginx NO está en el repo** (vhost vive en la VM; el deploy
  hace `systemctl reload nginx` no-fatal). No verificable: `limit_req`,
  `limit_conn`, `client_max_body_size`, timeouts.
- Throttler in-memory por defecto (OK para 1 instancia; se resetea con
  restart) y `skipIf` excluye WS (socket.io no throttlea).
- Cron de jobs in-process; `REDIS_URL` declarada sin uso en runtime.
- Compose prod sin `mem_limit`/`cpus`; logs capados 10m×3.
- **Sentry especificado (`omni-dance.md`) pero NO implementado**; sin uptime
  checks ni alertas.
- **Bucket compartido vía Netlify (confirmado por probe del padre)**: hits
  por `omnidance.tech/api/*` decrementan un bucket distinto al directo —
  `req.ip` en esa vía es la IP de egreso de Netlify → todos los usuarios del
  PWA comparten el límite 300/min (y el de auth 8/min) por egress IP de
  Netlify.

## Respuesta directa

**¿Cualquiera puede pegarle al API?** Sí, por diseño: el hostname del API
debe ser público para que el rewrite de Netlify lo alcance. El tráfico
directo pasa por el mismo nginx, throttler y guards que el proxeado — no hay
bypass de controles. La diferencia: pegarle directo evita el edge de
Netlify; cada request llega crudo a la VM.

**¿Y si hay DDoS?** No aguanta casi nada: L3/L4 satura el enlace de la VM
única (sin scrubbing/Anycast/réplica); L7 tiene throttler por IP que no
detiene una botnet; `/api/health` no throttleado toca la DB; webhooks
amplifican; handshakes socket.io anónimos sin throttle. Punto único de fallo
total y sin monitoreo que lo detecte.

## Hallazgos

### Alta

**A1. Origen API sin CDN/WAF — saturación directa de la VM.**
Recomendación: Cloudflare free delante del hostname API (CNAME orange-cloud);
absorbe L3/L4 y da WAF/rate-limit. Al hacerlo hay que corregir la cadena de
IPs (`CF-Connecting-IP`/`proxy_set_header X-Real-IP`) para que el throttler
siga viendo IP real. Alternativa: `limit_req_zone`+`limit_conn_zone` en
nginx + fail2ban, versionando el vhost en el repo. Esfuerzo M.

**A2. `POST /api/payments/subscription-webhook` — amplificación L7.**
`webhook.controller.ts` + `subscriptions.service.ts`: cualquier POST con
`token` no vacío dispara `reconcileAll` fire-and-forget (full scan +
llamadas firmadas salientes). Sin mutex ni cooldown.
Recomendación: lock en vuelo + cooldown (<60s) o secreto en el callback. S.

**A3. `POST /api/payments/webhook[/:provider]` — outbound firmado antes de
validar.** Amplificación 1:1 a la pasarela; quema cuota compartida con
cobros reales. Recomendación: `@Throttle` dedicado (~30/min), allowlist IP
del proveedor si publica rangos, o rechazo barato por formato de token. S.

### Media

**A4. `/api/health` no throttleado y toca la DB** (`@SkipThrottle` +
`SELECT 1`): el endpoint más barato de golpear consume roundtrip a Neon.
Recomendación: health público sin DB; check de DB en `/api/health/db`
restringido o re-throttleado. S.

**A5. Handshake socket.io anónimo sin throttle**: cada intento crea sesión
engine.io (~20-25s de vida). Churn ilimitado = memoria/CPU en el proceso
único. Recomendación: `limit_req` nginx sobre `/socket.io/` o límites de
engine.io. S-M.

**A6. Magic-link: spam de correo a víctimas** — 8/60s por IP sin cap por
email destino (costo Resend + harassment). Recomendación: segundo bucket
por email (~5/h). S.

**A7. Sin monitoreo ni alertas**: contenedor sin límites de recursos, sin
uptime checks. Recomendación: UptimeRobot/BetterStack sobre `/api/health`
(5min) + `deploy.resources` en compose + Sentry cuando haya presupuesto. S.

### Baja

- B1. Swagger UI + docs-json públicos: schema completo = recon gratis.
  Rec: auth básica o gate por NODE_ENV. S.
- B2. `GET /api/events` sin `take` (feed público completo). Rec: take +
  `s-maxage` corto. S.
- B3. Streaming de fotos público con buffer completo en memoria
  (`people.controller.ts`): 300/min × 5MB de egress por IP. Rec: CF lo
  resuelve (cachea); si no, `createReadStream` + `X-Accel-Redirect`. S-M.
- B4. `trust proxy` correcto pero frágil: al agregar CF/Netlify hay que
  reconfigurar XFF o el throttler agrupa usuarios. Incluir en A1. S.
- B5. Hardening VM fuera del repo (supuesto): fail2ban, ufw/security list,
  auto-updates, rotación de deploy key. Rec: documentar estado del firewall
  en `docs/ci-cd.md`. S.

## Ya bien cubierto

CORS whitelist verificado en vivo; trust proxy restringido a hops privados;
HSTS + helmet; webhooks idempotentes con ledger + verificación por
proveedor; stub fail-close en prod; lockout login + throttle auth; uploads
con límites y anti-traversal; `X-RateLimit-*` visibles; binding 127.0.0.1;
80→443 redirect; TLS válido.
