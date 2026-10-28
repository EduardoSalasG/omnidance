# Tasks — seo-positioning-domain

- [x] 1. `netlify.toml`: `NEXT_PUBLIC_WEB_URL = "https://omnidance.tech"`
      + ajustar comentario.
- [x] 2. `apps/web/src/app/[locale]/layout.tsx`: `SITE_TITLE`,
      `SITE_DESCRIPTION` y `keywords` al posicionamiento
      (gestión academias + productores + referencia sociales/congresos).
- [x] 3. Crear `apps/web/public/llms.txt` con resumen del sitio y links
      a secciones públicas (`/`, `/pro`, `/para-academias`,
      `/para-productores`, `/ciudades`, `/pase`) sobre omnidance.tech.
- [x] 4. `docs/ci-cd.md`: `WEB_URL`/`CORS_ORIGINS` → omnidance.tech +
      nota dominio primario Netlify + paso de actualizar `.env` en VM.
- [x] 5. Verificar: typecheck + smoke (canonical/og en HTML servido con
      la var nueva) + `curl /llms.txt`.
- [x] 6. Post-deploy (manual, usuario): `.env` de la VM con
      `WEB_URL`/`CORS_ORIGINS` = omnidance.tech + Netlify dominio
      primario + redirect del subdominio si se quiere.
