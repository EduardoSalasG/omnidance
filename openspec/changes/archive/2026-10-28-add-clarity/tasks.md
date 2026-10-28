# Tasks — add-clarity

- [x] 1. Crear `apps/web/src/components/clarity.tsx`: export
      `ClarityScript` (script inline bootstrap oficial,
      `dangerouslySetInnerHTML`); devuelve `null` si
      `process.env.NEXT_PUBLIC_CLARITY_ID` no está definido.
- [x] 2. Montar `<ClarityScript/>` en
      `apps/web/src/app/[locale]/layout.tsx`, en `<head>` tras
      `<GtmScript/>`.
- [x] 3. CSP en `apps/web/src/middleware.ts`: agregar
      `https://*.clarity.ms` a `script-src`.
- [x] 4. `netlify.toml`: `NEXT_PUBLIC_CLARITY_ID = "z4swabie90"` en
      `build.environment` + línea en el bloque de comentarios de env.
- [x] 5. Verificar: typecheck/lint y smoke sirviendo una página con el
      ID seteado (markup en head + CSP header).
