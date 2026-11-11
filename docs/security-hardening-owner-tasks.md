# Tareas del owner — hardening post-auditoría (2026-11-10)

Lo que solo tú puedes configurar (dashboards, DNS, VM, secretos). El código
que depende de estos cambios ya quedó preparado para tolerar ambos estados
(antes/después de Cloudflare) — ver "dependencia de código" en cada item.

## 1. Monitoreo de uptime (15 min, hoy) — HECHO 2026-11-10

- Cuenta BetterStack creada con 2 monitores.
- PENDIENTE menor: apuntar el monitor del API a
  `https://api.omnidance.tech/api/health` (el hostname nuevo tras la
  migración a Cloudflare; el viejo sigue respondiendo pero conviene
  medir el path real del proxy).

## 2. Cloudflare delante del API (la respuesta anti-DDoS) — HECHO 2026-11-10

Implementación final (distinta a la original: en vez de mover la zona
`eduardosalasg.dev` con sus 23 records, se migró la zona chica
`omnidance.tech` a CF y el API cambió de hostname):

- Zona `omnidance.tech` en CF (nameservers erin/guss), registros de
  correo Zoho + Resend preservados DNS-only, web Netlify DNS-only.
- `api` A → VM proxied; `api.omnidance.tech` ya responde por CF
  (Full strict, cert origen expandido con ambos SAN).
- `API_URL` en `/opt/apps/omnidance/.env` actualizado al host nuevo
  (webhooks Flow/Fintoc nuevos registran la URL proxied); contenedor
  recreado. Alias viejo sigue sirviendo para webhooks ya registrados.
- Repo: `API_PROXY_TARGET`, rewrite socket.io y `PUBLIC_API_HOST`
  apuntan al host nuevo (`bac02704`).
- Pendiente voluntario: rate limiting rule de CF (Security → Rate
  limiting) sobre `api.omnidance.tech` si quieres una capa extra.

Plan original (solo referencia histórica):

- Crear cuenta Cloudflare free y agregar la zona `eduardosalasg.dev`
  (plan free exige mover los nameservers del dominio completo a CF —
  ojo: en esa VM/DNS conviven otros servicios, el puerto 80 de la IP sirve
  un vhost de otra app; migrar la zona mueve TODO el dominio a CF).
- Registro `api.omnidance` → proxied (nube naranja) a `146.181.44.133`.
- Activar "Bot Fight Mode" y rate limiting rules si quieres (free trae
  algunas).
- **Una vez proxied, avísame**: el código ya tolera `CF-Connecting-IP` y
  `X-Nf-Client-Connection-Ip` (ver §3 del change `api-edge-hardening` /
  vhost nuevo en `deploy/nginx/`); el paso final es instalar el vhost
  versionado en la VM (item 4).
- Alternativa sin CF: solo nginx `limit_req`/`limit_conn` + fail2ban
  (protege L7 pero no L3/L4 — una saturación de enlace igual tumba la VM).

## 3. Google Tag Manager — deduplicar Clarity (10 min)

- Contenedor `GTM-W9KC3378`: elimina la **tag de Clarity** que vive dentro
  del contenedor. El snippet propio (`src/components/clarity.tsx`) queda
  como única vía. Hoy carga doble → 8 third-party cookies y Best
  practices 0.77 en Lighthouse.
- De paso: audita qué más vive en el contenedor (GA4 `G-WRMD1D9BX7` +
  ¿algo más?) y elimina lo que no uses — `gtm.js` pesa 185KB, 49% de la
  página.
- Revisa quién puede publicar el workspace GTM (es inyección arbitraria
  de JS en el origen).

## 4. VM Oracle — nginx vhost versionado + fail2ban + firewall

- El vhost de nginx hoy vive solo en la VM (no en el repo). Dejé la
  versión propuesta en `deploy/nginx/omnidance-api.conf`: incluye
  `limit_req`/`limit_conn`, `client_max_body_size`, timeouts y la cadena
  de IP real (Netlify `x-nf-client-connection-ip` > `cf-connecting-ip` >
  directo). Instálalo en `/etc/nginx/sites-available/` + `nginx -t` +
  reload. **Sin este paso, el throttler sigue viendo IPs de
  Netlify/CF compartidas.**
- Security List de Oracle + `ufw`: confirma que solo 22/80/443 estén
  abiertos (el puerto de la app ya está en loopback).
- `sudo apt install fail2ban` con jails para `sshd` y `nginx-limit-req`.
- `unattended-upgrades` si no está.
- Anota el estado real en `docs/ci-cd.md` (hoy el hardening de VM es
  supuesto no documentado).

## 5. Swagger/API docs en producción

- `/api/docs*` quedó cerrado en prod (spec api-hardening): solo se monta
  si el API corre con `API_DOCS_ENABLED=true` (o `NODE_ENV` distinto de
  production). Sin acción requerida; si algún día necesitas regenerar
  `docs/openapi.json` contra prod, reinicia el proceso con el flag y
  corre `node apps/api/scripts/export-api-docs.cjs` (el script ya avisa
  el 404 si falta).

## 6. Microsoft Clarity — masking (5 min)

- En el dashboard del proyecto Clarity de omnidance.tech: verifica que
  **masking = Strict**. Sin eso, Clarity graba inputs de comprobantes,
  datos bancarios y PII de /admin/usuarios.
- (Código: ya quedaron `data-clarity-mask` en las superficies sensibles.)

## 7. Rotaciones y cuenta (cuando puedas)

- Rotar `ORACLE_SSH_KEY` + `GHCR_PAT` + `MIGRATION_DATABASE_URL` en GitHub
  secrets es higiene anual; no urgente.
- `pnpm audit` recomendado agregar a CI (yo puedo agregarlo al workflow QA
  si quieres).

## 8. Neon — nada que hacer

Pooler + migraciones por endpoint directo ya cubiertos en el deploy.

---

### Estado: qué queda en código (yo) vs config (tú)

| Item | Quién | Estado |
|---|---|---|
| BOLA cross-tenant (checkins, guest lists, passes, discounts) | yo | change `security-event-scope` |
| Health sin DB, locks/throttle en webhooks, exports throttle, cap por email, swagger gate, magic token single-use, settle mismatch, internalNext %5c, xlsx | yo | change `api-edge-hardening` |
| URL schema validation, SW notificationclick, connect-src, logout cache, serverApiUrl, browserslist, SWR landings | yo | change `web-edge-hardening` |
| Uptime monitor | tú | item 1 |
| Cloudflare DNS/proxy | tú | item 2 |
| GTM dedup Clarity + limpieza | tú | item 3 |
| Nginx vhost + fail2ban + firewall VM | tú (instalar) / yo (escribir el conf) | item 4 |
| Clarity masking | tú | item 5 |
