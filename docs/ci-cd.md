# CI/CD - omnidance

Mismo patrón que video-repo: **backend → GitHub Actions** (build → imagen
GHCR → SSH a VM → recreate → health gate), **frontend → Netlify** (Next.js
runtime). DB = **Neon** (Postgres gestionado, fuera de la VM).

Dominios:

- API: `https://api.omnidance.eduardosalasg.dev` (nginx de la VM →
  contenedor en `127.0.0.1:3002` - el contenedor escucha 4000 interno,
  el host publica 3002)
- Web: `https://omnidance.netlify.app`

## Checklist primer deploy (en orden)

1. **Neon**: crear DB `omnidance` y copiar la connection string
   (directa o pooled - pooled recomendada para runtime).
2. **GitHub secrets** (repo → Settings → Secrets): `ORACLE_SSH_KEY`,
   `ORACLE_USER`, `ORACLE_HOST`, `GHCR_PAT`, `GHCR_USERNAME`,
   `MIGRATION_DATABASE_URL` (endpoint **directo** de Neon),
   `SEED_ADMIN_EMAIL`.
3. **VM**: `/opt/apps/omnidance/.env` completo (bloque de abajo - ojo:
   `PAYMENT_GATEWAY=flow` + `FLOW_*` son **fail-close obligatorios**,
   sin ellos el API no levanta).
4. **Nginx**: vhost `api.omnidance.eduardosalasg.dev` → `127.0.0.1:3002`
   + TLS (certbot).
5. **Netlify**: sitio conectado al repo + env vars (`API_PROXY_TARGET`,
   `NEXT_PUBLIC_*`); `NEXT_PUBLIC_API_URL` **vacía**.
6. **Push a `main`** → el workflow hace el resto: tests → imagen GHCR →
   SSH → migrate+seed one-shot → recreate → health gate + sonda HTTPS.

## DB (Neon)

1. Crear proyecto Neon → base **`omnidance`**.
2. Neon entrega dos endpoints:
   - **Pooled** (`…-pooler.…neon.tech`) → `DATABASE_URL` de la app.
   - **Directo** (sin `-pooler`) → `MIGRATION_DATABASE_URL` - opcional,
     solo para los one-shots de migración/seed del workflow. El pooler
     corre en modo transaction y los advisory locks de `prisma migrate`
     pueden fallar intermitente ahí; sin endpoint directo el workflow
     cae a `DATABASE_URL` con warning (re-correr el deploy suele
     alcanzar si el lock flaquea).
3. **El bootstrap es automático y vive en el workflow**: antes de
   recrear el contenedor corre `prisma migrate deploy` one-shot
   (compara `_prisma_migrations` y aplica solo las pendientes) y, si la
   DB está vacía (sin roles baseline), el seed prod (baseline + admin).
   Contra una Neon recién creada, el primer deploy crea todas las
   tablas y las puebla. El contenedor solo ejecuta `node dist/main.js`
   (mismo patrón que video-repo) - migrar en el boot del contenedor se
   descartó: vía pooler el advisory lock dejaba al contenedor en
   crash-loop (P1002) y duplicaba lo que ya hace el workflow.

## Backend - `.github/workflows/deploy-api-docker.yml`

Push a `main` → test + build → imagen `ghcr.io/EduardoSalasG/omnidance-api:<sha>`
+ `:latest` → SSH al host → `prisma migrate deploy` → `seed.ts` con
`SEED_ENV=prod` → `docker compose up -d api` → health gate
(`/api/health` 200 + `/api/me` 401 anónimo) → reload nginx + sonda HTTPS
a `api.omnidance.eduardosalasg.dev`.

### Secrets de GitHub (repo → Settings → Secrets)

| Secret | Contenido |
|---|---|
| `ORACLE_SSH_KEY` | Clave privada SSH del usuario de deploy |
| `ORACLE_USER` | Usuario SSH de la VM |
| `ORACLE_HOST` | IP/host de la VM |
| `GHCR_PAT` | PAT con `read:packages` para `docker login` en la VM |
| `GHCR_USERNAME` | Usuario dueño del PAT |
| `MIGRATION_DATABASE_URL` | Endpoint **directo** de Neon para los one-shots de migración/seed (opcional: también se lee del `.env` de la VM; si falta se usa `DATABASE_URL` con warning). **Precedencia: secret GH > `.env`** - un secret con la URL pooled pisa un `.env` correcto |
| `SEED_ADMIN_EMAIL` | Email del admin que crea el seed prod |

### `/opt/apps/omnidance/.env` en la VM (una vez)

El deploy usa `/opt/apps/omnidance` (mismo patrón que video-repo) - el
usuario SSH ya tiene ownership del directorio, sin sudo en el pipeline.

```env
# Neon - la connection string que da el dashboard (pooled recomendado
# para runtime; directa también sirve - sin pooler los advisory locks
# funcionan siempre).
DATABASE_URL="postgresql://<user>:<pass>@<host>-pooler.<region>.neon.tech/omnidance?sslmode=require"
# Opcional: endpoint directo (mismo host sin -pooler) para los
# one-shots de migrate/seed del workflow - hace deterministas los
# advisory locks de prisma migrate, que vía pooler son intermitentes.
# MIGRATION_DATABASE_URL="postgresql://<user>:<pass>@<host>.<region>.neon.tech/omnidance?sslmode=require"

JWT_SECRET="<aleatorio>"
QR_SECRET="<aleatorio>"

# Orígenes
WEB_URL="https://omnidance.netlify.app"
CORS_ORIGINS="https://omnidance.netlify.app"
API_URL="https://api.omnidance.eduardosalasg.dev"   # callbacks de Flow

# Pagos - obligatorio en prod (fail-close: sin esto el API no levanta)
PAYMENT_GATEWAY="flow"
FLOW_API_KEY="…"
FLOW_SECRET_KEY="…"
FLOW_BASE_URL="https://sandbox.flow.cl/api"          # sandbox

# MercadoPago - opcional: el adaptador se registra en el
# GatewayRegistry si existe el token (convive con Flow; el proveedor
# de cada orden lo decide el param `payments.default_gateway`, que
# cae al default del env si el provider no está registrado).
# Webhook a configurar en el panel MP: {API_URL}/api/payments/webhook/MERCADOPAGO
# MERCADOPAGO_ACCESS_TOKEN="APP_USR-…"               # test-… = sandbox
# MERCADOPAGO_BASE_URL="https://api.mercadopago.com" # opcional

# Cuentas de pasarela del productor (spec producer-gateway-accounts) -
# clave AES-256-GCM que cifra credentialsEnc de ProducerGatewayAccount.
# Obligatoria si algún productor configura su pasarela: sin ella el
# PUT /producer/gateway-account falla explícito (no se persiste nada).
# Generar: `openssl rand -hex 32`. ROTARLA INVALIDA las cuentas
# existentes - guardar como secreto permanente.
PRODUCER_GATEWAY_KEY="…64 hex…"

# Mail (Resend) - magic links
RESEND_API_KEY="…"
EMAIL_FROM="OmniDance <noreply@…>"
MAIL_FROM="noreply@…"

# Web push - opcional: sin keys el sender es no-op seguro y el front
# oculta el opt-in. Para activarlo: `cd apps/api && npx web-push
# generate-vapid-keys`; la PÚBLICA va también a Netlify como
# NEXT_PUBLIC_VAPID_PUBLIC_KEY (misma key en ambos lados).
WEB_PUSH_VAPID_PUBLIC_KEY="…"
WEB_PUSH_VAPID_PRIVATE_KEY="…"
WEB_PUSH_VAPID_SUBJECT="mailto:contacto@…"

# Seed prod (one-shot del workflow cuando la DB está vacía)
SEED_ADMIN_EMAIL="admin@omnidance.cl"
SEED_ADMIN_NAME="Admin Omnidance"                    # opcional

# Cookies de sesión - same-origin vía proxy Netlify → lax alcanza
SESSION_SECURE="true"
SESSION_SAMESITE="lax"

# Comprobantes de pago directo (academy-payment-claims): path dentro
# del contenedor persistido por volumen al disco dedicado de la VM.
UPLOADS_DIR="/app/uploads"
```

**Volumen de uploads (obligatorio si hay academias con pago directo)**:
los comprobantes viven en disco, no en Neon - el service `api` del
compose de la VM debe montar el disco dedicado:

```yaml
services:
  api:
    volumes:
      - /data/omnidance-uploads:/app/uploads
```

Sin el volumen, los archivos se pierden en cada `--force-recreate` del
deploy. El env `UPLOADS_DIR` debe calzar con el destino del mount.

Otros knobs opcionales ya tienen default: `PORT` (4000 interno del
contenedor - el host expone **3002**), `LOG_LEVEL`, `SERVICE_FEE_CLP`,
`THROTTLE_*`. `REDIS_URL` hoy no se usa en runtime.

### VM - otros pasos

1. Nginx vhost `api.omnidance.eduardosalasg.dev` → `127.0.0.1:3002`
   (`proxy_pass` + headers de upgrade para `/socket.io/`).
2. Usuario de deploy con docker (grupo `docker`). El reload de nginx
   usa `sudo -n` no-fatal - si hay NOPASSWD para `systemctl reload
   nginx` se recarga, si no, el vhost es estático y la sonda HTTPS
   igual valida el upstream.
3. Postgres NO va en la VM (Neon). El compose de prod solo tiene `api`.

### Troubleshooting deploy

- **`Error: P1002 - Timed out trying to acquire a postgres advisory
  lock`**: otra sesión tiene el lock de `prisma migrate`. Causa típica:
  un contenedor viejo en crash-loop reintentando, o una sesión zombie
  que el pooler de Neon mantiene viva server-side. Fix, en orden:
  1. En la VM: `docker rm -f omnidance-api` - mata el contenedor y sus
     sesiones DB.
  2. Si persiste, Neon SQL Editor:
     `SELECT pid FROM pg_locks WHERE locktype = 'advisory'` →
     `SELECT pg_terminate_backend(<pid>)` (o restart del compute
     desde el dashboard, que cierra todas las sesiones).
  - Incidente real: run 37319881110 (2026-10-05) - un contenedor con el
    entrypoint viejo (migrate-on-boot) quedó en crash-loop ~8h
    sosteniendo el lock; el one-shot del workflow fallaba aun por el
    endpoint directo. Por eso migrate NO corre en el boot del
    contenedor.
- **`PAYMENT_GATEWAY=flow con FLOW_API_KEY/FLOW_SECRET es requerido`**
  (crash-loop del contenedor): fail-close intencional - el StubGateway
  acepta webhooks sin firma y está deshabilitado en producción. Falta
  `FLOW_API_KEY`/`FLOW_SECRET_KEY` (sandbox.flow.cl → Mis datos →
  Integraciones) en el `.env`.
- **Email del admin con comillas en la DB** (incidente 2026-10-05): el
  workflow extrae `SEED_ADMIN_EMAIL` del `.env` con `grep|cut`, que
  devuelve el valor crudo - si la línea traía `"mail"` quedaba con
  comillas en `Person.email` y el magic link nunca lo encontraba (el
  auth compara `email.toLowerCase()`). El extractor ya normaliza
  (comillas + whitespace fuera) y `seed-prod` hace lo propio como
  defensa. Para reparar una fila ya contaminada, en Neon SQL Editor:
  `UPDATE "Person" SET email = btrim(email, '" ') WHERE email <> btrim(email, '" ');`
  - si un intento de login ya creó otra `Person` con el email limpio,
  borrar primero esa fila duplicada (y su `PersonRole` si existe) para
  no chocar con el unique de `email`.

## Frontend - `netlify.toml`

Netlify conecta el repo (pnpm workspace), corre `shared build → web
build`, publica `apps/web/.next` con el runtime de Next. Deploy previews
por branch/PR gratis.

### Env vars en Netlify (Site settings → Environment variables)

| Var | Valor |
|---|---|
| `API_PROXY_TARGET` | `https://api.omnidance.eduardosalasg.dev` (ya en `netlify.toml`) |
| `NEXT_PUBLIC_CARTO_BASEMAP_KEY` | key pública del basemap |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | misma VAPID pública del API |
| `NEXT_PUBLIC_WEB_URL` | `https://omnidance.netlify.app` |
| `NEXT_PUBLIC_API_URL` | **vacía** - relativa = same-origin; setearla rompe el modelo de cookies Lax/iOS |

### Caveat socket.io

El upgrade WebSocket no pasa por el proxy de Netlify - el cliente queda en
polling (mismo comportamiento que dev con el rewrite de Next; documentado
en `apps/web/src/lib/realtime.ts`). Suficiente para el fan-out de
notificaciones.

## Flujo

- `dev` = trabajo diario; `main` = estable → dispara deploy del API.
  Promoción `dev → main` sigue el release gate de AGENTS.md (SemVer +
  tag + changelog).
- Health checks post-deploy son parte del workflow - un deploy rojo
  bloquea el pipeline antes de cortar tráfico.
