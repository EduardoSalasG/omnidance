# CI/CD — omnidance

Mismo patrón que video-repo: **backend → GitHub Actions** (build → imagen
GHCR → SSH a VM → migrate + seed one-shot → recreate → health gate),
**frontend → Netlify** (Next.js runtime).

## Backend — `.github/workflows/deploy-api-docker.yml`

Push a `main` → test + build → imagen `ghcr.io/<owner>/omnidance-api:<sha>`
+ `:latest` → SSH al host → `prisma migrate deploy` → `seed.ts` con
`SEED_ENV=prod` → `docker compose up -d api` → health gate
(`/api/health` 200 + `/api/me` 401 anónimo) → reload nginx + sonda HTTPS
por `PUBLIC_API_HOST`.

### Secrets de GitHub (repo → Settings → Secrets)

| Secret | Contenido |
|---|---|
| `ORACLE_SSH_KEY` | Clave privada SSH del usuario de deploy |
| `ORACLE_USER` | Usuario SSH de la VM |
| `ORACLE_HOST` | IP/host de la VM |
| `GHCR_PAT` | PAT con `read:packages` para `docker login` en la VM |
| `GHCR_USERNAME` | Usuario dueño del PAT |
| `MIGRATION_DATABASE_URL` | DATABASE_URL para `migrate deploy`/`seed` (opcional si está en `.env` de la VM) |
| `SEED_ADMIN_EMAIL` | Email del admin que crea el seed prod |

### Variables de GitHub (repo → Settings → Variables)

| Var | Contenido |
|---|---|
| `PUBLIC_API_HOST` | Host público del API sin scheme (p.ej. `api.omnidance.cl`). Vacía = se omite la sonda nginx |

### Setup de la VM (una vez)

1. `mkdir -p /opt/apps/omnidance` y crear `/opt/apps/omnidance/.env` con:
   `DATABASE_URL`, `JWT_SECRET`, `QR_SECRET`, `CORS_ORIGINS` (o `WEB_URL`),
   `WEB_URL` (URL pública del front — magic links apuntan ahí),
   `PAYMENT_GATEWAY=flow` + `FLOW_API_KEY`/`FLOW_SECRET_KEY`/`FLOW_BASE_URL`
   (obligatorio en prod: sin credenciales Flow el API rechaza el boot —
   fail-close, el stub está deshabilitado), `RESEND_API_KEY`,
   `EMAIL_FROM`/`MAIL_FROM`, `WEB_PUSH_VAPID_*`, `SESSION_SAMESITE`/`SESSION_SECURE`.
2. Postgres: local con `127.0.0.1:…:5432` o gestionado — el compose de prod
   **no** incluye DB (REDIS_URL hoy no se usa en runtime).
3. Nginx vhost `PUBLIC_API_HOST` → `127.0.0.1:4000` con
   `proxy_pass` + upgrade headers para `/socket.io/` (aunque el front
   llega por polling vía Netlify, clientes directos pueden usar WS).
4. Usuario de deploy con permisos docker y `sudo systemctl reload nginx`
   sin password (sudoers: `user ALL=(root) NOPASSWD: /bin/systemctl reload nginx`).

## Frontend — `netlify.toml`

Netlify detecta el repo (pnpm workspace), corre
`shared build → web build`, publica `apps/web/.next` con el runtime de
Next. Conectar el repo en Netlify → Site settings → Build & deploy
toma `netlify.toml` automáticamente; **deploy previews por branch/PR
quedan gratis**.

### Env vars en Netlify (Site settings → Environment variables)

| Var | Valor |
|---|---|
| `API_PROXY_TARGET` | `https://<PUBLIC_API_HOST>` — el rewrite `/api/*` + `/socket.io/*` de `next.config.mjs` proxea aquí (same-origin) |
| `NEXT_PUBLIC_CARTO_BASEMAP_KEY` | key pública del basemap |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | VAPID pública (misma que `WEB_PUSH_VAPID_PUBLIC_KEY` del API) |
| `NEXT_PUBLIC_WEB_URL` | URL del sitio Netlify |
| `NEXT_PUBLIC_API_URL` | **dejar vacía** — relativa = same-origin; ponerla rompe el modelo de cookies Lax/iOS |

### Caveat socket.io

El upgrade WebSocket no pasa por el proxy de Netlify — el cliente queda en
polling (mismo comportamiento que dev con el rewrite de Next; documentado
en `apps/web/src/lib/realtime.ts`). Suficiente para el fan-out de
notificaciones.

## Flujo

- `dev` = trabajo diario; Netlify puede servir un deploy preview de `dev`.
- `main` = estable → dispara deploy del API. Promoción `dev → main` sigue
  el release gate de AGENTS.md (SemVer + tag + changelog).
- Health checks post-deploy son parte del workflow — un deploy rojo
  bloquea el pipeline antes de cortar tráfico.
