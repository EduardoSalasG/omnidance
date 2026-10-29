# Tasks; add-gtm

- [x] 1. Crear `apps/web/src/components/gtm.tsx`: exports `GtmScript`
      (script inline bootstrap, `dangerouslySetInnerHTML`) y
      `GtmNoScript` (`<noscript><iframe>`); ambos devuelven `null` si
      `process.env.NEXT_PUBLIC_GTM_ID` no está definido.
- [x] 2. Montar en `apps/web/src/app/[locale]/layout.tsx`:
      `<GtmScript/>` como primer hijo de `<head>` y `<GtmNoScript/>`
      como primer hijo de `<body>`.
- [x] 3. CSP en `apps/web/src/middleware.ts`: agregar
      `https://www.googletagmanager.com` a `script-src` y nueva
      directiva `frame-src https://www.googletagmanager.com`.
- [x] 4. `netlify.toml`: `NEXT_PUBLIC_GTM_ID = "GTM-W9KC3378"` en
      `build.environment` + línea en el bloque de comentarios de env.
- [x] 5. Verificar: `pnpm --filter @omnidance/web typecheck` y
      `pnpm --filter @omnidance/web build`; smoke: servir una página
      con el ID seteado y comprobar el markup + CSP en headers.
