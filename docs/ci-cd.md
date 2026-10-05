# CI/CD — omnidance

Mismo patrón que video-repo: **backend → GitHub Actions** (build → imagen
GHCR → SSH a VM → recreate → health gate), **frontend → Netlify** (Next.js
runtime). DB = **Neon** (Postgres gestionado, fuera de la VM).

Dominios:

- API: `https://api.omnidance.eduardosalasg.dev` (nginx de la VM →
  contenedor en `127.0.0.1:3002` — el contenedor escucha 4000 interno,
  el host publica 3002)
- Web: `https://omnidance.netlify.app`

## DB (Neon)

1. Crear proyecto Neon → base **`omnidance`**.
2. Neon entrega dos endpoints:
   - **Pooled** (`…-pooler.…neon.tech`) → `DATABASE_URL` de la app.
   - **Directo** (sin `-pooler`) → `MIGRATION_DATABASE_URL` —
     migraciones y seed. El pooler corre en modo transaction y puede
     interferir con los advisory locks de `prisma migrate`.
3. **El bootstrap es automático**: el entrypoint del contenedor
   (`apps/api/docker-entrypoint.sh`) corre `prisma migrate deploy` en cada
   arranque — compara `_prisma_migrations` y aplica solo las pendientes —
   y luego, si la DB está vacía (sin roles baseline), corre el seed prod
   (baseline + admin). Contra una Neon recién creada, el primer boot crea
   todas las tablas y las puebla. El workflow además ejecuta los mismos
   pasos como one-shot antes de recrear el contenedor (fail temprano y
   log claro en Actions).

## Backend — `.github/workflows/deploy-api-docker.yml`

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
| `MIGRATION_DATABASE_URL` | Endpoint **directo** de Neon para migraciones/seed (opcional si está en `.env` de la VM) |
| `SEED_ADMIN_EMAIL` | Email del admin que crea el seed prod |

### `/opt/apps/omnidance/.env` en la VM (una vez)

El deploy usa `/opt/apps/omnidance` (mismo patrón que video-repo) — el
usuario SSH ya tiene ownership del directorio, sin sudo en el pipeline.

```env
# Neon — pooled para la app, directo para migrate/seed del entrypoint
DATABASE_URL="postgresql://<user>:<pass>@<host>-pooler.<region>.neon.tech/omnidance?sslmode=require"
DIRECT_DATABASE_URL="postgresql://<user>:<pass>@<host>.<region>.neon.tech/omnidance?sslmode=require"

JWT_SECRET="<aleatorio>"
QR_SECRET="<aleatorio>"

# Orígenes
WEB_URL="https://omnidance.netlify.app"
CORS_ORIGINS="https://omnidance.netlify.app"
API_URL="https://api.omnidance.eduardosalasg.dev"   # callbacks de Flow

# Pagos — obligatorio en prod (fail-close: sin esto el API no levanta)
PAYMENT_GATEWAY="flow"
FLOW_API_KEY="…"
FLOW_SECRET_KEY="…"
FLOW_BASE_URL="https://sandbox.flow.cl/api"          # sandbox

# Mail (Resend) — magic links
RESEND_API_KEY="…"
EMAIL_FROM="OmniDance <noreply@…>"
MAIL_FROM="noreply@…"

# Web push
WEB_PUSH_VAPID_PUBLIC_KEY="…"
WEB_PUSH_VAPID_PRIVATE_KEY="…"
WEB_PUSH_VAPID_SUBJECT="mailto:contacto@…"

# Seed prod (entrypoint en DB vacía + one-shot del workflow)
SEED_ADMIN_EMAIL="admin@omnidance.cl"
SEED_ADMIN_NAME="Admin Omnidance"                    # opcional

# Cookies de sesión — same-origin vía proxy Netlify → lax alcanza
SESSION_SECURE="true"
SESSION_SAMESITE="lax"
```

Otros knobs opcionales ya tienen default: `PORT` (4000 interno del
contenedor — el host expone **3002**), `LOG_LEVEL`, `SERVICE_FEE_CLP`,
`THROTTLE_*`. `REDIS_URL` hoy no se usa en runtime.

### VM — otros pasos

1. Nginx vhost `api.omnidance.eduardosalasg.dev` → `127.0.0.1:3002`
   (`proxy_pass` + headers de upgrade para `/socket.io/`).
2. Usuario de deploy con docker (grupo `docker`). El reload de nginx
   usa `sudo -n` no-fatal — si hay NOPASSWD para `systemctl reload
   nginx` se recarga, si no, el vhost es estático y la sonda HTTPS
   igual valida el upstream.
3. Postgres NO va en la VM (Neon). El compose de prod solo tiene `api`.

## Frontend — `netlify.toml`

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
| `NEXT_PUBLIC_API_URL` | **vacía** — relativa = same-origin; setearla rompe el modelo de cookies Lax/iOS |

### Caveat socket.io

El upgrade WebSocket no pasa por el proxy de Netlify — el cliente queda en
polling (mismo comportamiento que dev con el rewrite de Next; documentado
en `apps/web/src/lib/realtime.ts`). Suficiente para el fan-out de
notificaciones.

## Flujo

- `dev` = trabajo diario; `main` = estable → dispara deploy del API.
  Promoción `dev → main` sigue el release gate de AGENTS.md (SemVer +
  tag + changelog).
- Health checks post-deploy son parte del workflow — un deploy rojo
  bloquea el pipeline antes de cortar tráfico.
