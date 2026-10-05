# Handoff - 2026-10-05: deploy a producción verde (saga P1002 → Flow)

Sesión de infraestructura sobre `dev` → `main`. Objetivo: llevar
omnidance al patrón de deploy de video-repo/expenses-tracker y dejar
el API corriendo en producción. **Logrado**: run `37326822526` verde
end-to-end (CI + VM + sonda HTTPS nginx).

## Resultado final

- API en `https://api.omnidance.eduardosalasg.dev` - nginx →
  `127.0.0.1:3002` → contenedor `:4000`. `/api/health` 200, `/api/me`
  401 (gate de ruta protegida), sonda HTTPS por nginx 401.
- Contenedor arranca solo con `node apps/api/dist/main.js` -
  `apps/api/docker-entrypoint.sh` **eliminado** (commit `108e1b5`).
- Migrate + seed son **one-shots del workflow**, nunca en el boot.
- Seed condicional por completitud: `role.count()` +
  `personRole.count({role:"ADMIN",status:"APPROVED"})` →
  `DB completa (9 roles, 1 admin) - seed omitido` (commit `e3147ed`).

## Qué pasó (para no repetir el debugging)

1. **Crash-loop P1002** (advisory lock): el entrypoint viejo corría
   `prisma migrate deploy` en cada boot contra `DATABASE_URL` pooled.
   Un contenedor viejo quedó crash-loopando ~8h sosteniendo el lock
   via sesión zombie server-side del pooler - bloqueó incluso el
   one-shot por endpoint directo. Fix: `docker rm -f omnidance-api`
   en la VM + terminar la sesión en Neon
   (`pg_terminate_backend` sobre `pg_locks WHERE locktype='advisory'`).
2. **`DIRECT_DATABASE_URL` descartado** por decisión del usuario.
   Queda `MIGRATION_DATABASE_URL` (opcional) con precedencia
   **secret GH > `.env` VM > `DATABASE_URL`** - ojo: un secret GH
   con URL pooled pisa un `.env` correcto.
3. **Fail-close de Flow**: `resolveGateway` exige en prod
   `PAYMENT_GATEWAY=flow` + `FLOW_API_KEY` + `FLOW_SECRET_KEY`.
   El usuario puso keys **placeholder** - el API levanta (solo valida
   presencia + `FLOW_BASE_URL` sandbox exacto) pero los pagos NO
   funcionan hasta credenciales sandbox reales
   (sandbox.flow.cl → Mis datos → Integraciones).
4. **Health check "failures" iniciales son normales**: el loop imprime
   `attempt N/60` en cada intento; 3-4 intentos (~8s) es el cold start
   de Nest (module graph + Prisma connect + bind). Solo es problema
   si llega a 60/60.

## Estado git

- `main` = `dev` en merge `96cf181`. Commits del día: `108e1b5`
  (sin entrypoint), `c89ec3f` (docs ci-cd), `e3147ed` (seed check),
  `1f8cbac`/`96cf181` (merges). Tag `v0.1.0` sigue en `87dfe57`
  (código de producto idéntico - todo lo posterior es CI/docs).

## Pendientes (usuario)

- **Flow sandbox real**: reemplazar `FLOW_API_KEY`/`FLOW_SECRET_KEY`
  placeholder en `/opt/apps/omnidance/.env` + recreate.
- **Netlify**: confirmar `API_PROXY_TARGET`, `NEXT_PUBLIC_API_URL`
  **vacía**, `NEXT_PUBLIC_VAPID_PUBLIC_KEY` si se activa web push,
  `NEXT_PUBLIC_CARTO_BASEMAP_KEY`, `NEXT_PUBLIC_WEB_URL`.
- **Resend**: `RESEND_API_KEY`/`EMAIL_FROM`/`MAIL_FROM` en la VM -
  sin esto los magic links no llegan (login cojo).
- ~~VAPID~~ - hecho el mismo día (ver "Post-handoff").

## Post-handoff (misma sesión)

- **VAPID habilitado**: usuario generó keys, `.env` VM + Netlify
  pública; rerun `37326822526` recreó el contenedor y rebuild de
  Netlify horneó la pública en el bundle.
- **Verificación pública end-to-end**:
  `api…/api/health` 200, `api…/api/me` 401, `omnidance.netlify.app`
  200, `omnidance.netlify.app/api/health` 200 (proxy same-origin OK -
  cookies first-party confirmadas).
- `workflow_dispatch` agregado al workflow (commit `4ffaa09`, `dev`) -
  permite redeploy manual sin commit una vez mergeado a `main`.
- Health gate ahora imprime `API healthy after N attempt(s)` (commit
  `8e9148c`, `dev`) - ya no parecen errores los attempts de cold start.

## Pendientes (repo)

- Docs de referencia completas en `docs/ci-cd.md` (checklist primer
  deploy, troubleshooting P1002/Flow, precedencia de secrets).
- `dev` adelanta a `main` en 2 commits cosméticos (`8e9148c` log del
  health gate, `4ffaa09` workflow_dispatch) - mergearlos en el
  próximo release, no ameritan deploy propio.
