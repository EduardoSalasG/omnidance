# Handoff — i18n multi-locale completo (es-CL default + en + fr + pt-PT)

**Rama**: `dev` · **Change OpenSpec**: `openspec/changes/i18n-multi-locale` (validado, tasks 100%)

## Qué quedó hecho

### Infra de routing
- `src/i18n/`: `routing.ts` (locales `es-CL|en|fr|pt-PT`, default es-CL, `localePrefix: "as-needed"` — es-CL sin prefijo, resto bajo `/<locale>`), `navigation.ts` (adapter createNavigation), `request.ts`, `messages.ts`, `merge.ts`, `catalogs/{es-CL,en,fr,pt-PT}.ts`.
- Todo el árbol `app/` bajo `app/[locale]/` (`(app)` + `(marketing)`); `[locale]/layout.tsx` con `generateStaticParams` (4 locales), `lang` dinámico, provider raíz solo con `common` (~3KB — necesario para `Spinner`/`PageLoadingHost`, bug resuelto en 9207fbf).
- Middleware compuesto: next-intl (prefijo → cookie NEXT_LOCALE → Accept-Language) + gate de sesión + CSP.
- 79 archivos `next/link` + 87 `next/navigation` → `@/i18n/navigation` (transform con `scripts/` — el transformer de una vez `locale-imports.cjs` se eliminó tras usarlo).
- Todos los `redirect("/x")`/`router.push` literales pasan por el adapter; `safeInternalPath` intacto.

### Preferencia de idioma
- `Person.language` (string, default `"es-CL"`) + migración `20261107000000_person_language` — aplicada.
- `PATCH /me` acepta `language` con whitelist (`IsIn(["es-CL","en","fr","pt-PT"])`); `GET /me` lo devuelve.
- Selector en `/perfil/datos` → PATCH + `router.replace(pathname, {locale})` (setea cookie también).
- `MeProvider` sync: al primer `/me` con `language` distinto navega al path localizado — la preferencia viaja entre dispositivos (una vez por carga, `langSynced` ref evita loop).
- Docs API regenerados: `docs/openapi.json` + postman (296 paths).

### Formatters
- `lib/intl.ts`: `getDateFmt(locale, opts)`/`getNumFmt(locale, opts)` memoizados + hooks `useDateFmt`/`useNumFmt` (módulo neutral, sirve server y client).
- ~110 sites `new Intl.*("es-CL")` migrados: module-scope → factories `(locale)`, componentes → hooks, server → `getLocale()`.
- **Ojo**: la migración dejó `"use client"` después de decls Intl en 16 archivos — ya reparado (directiva arriba, consts tras imports).

### Catálogos — paridad exacta vs es-CL (3414 flattened keys c/u)
- `messages/{en,fr,pt-PT}.json` + `parts/{en,fr,pt-PT}/*` (34 parts cada uno).
- `scripts/i18n-parity.cjs` → `en/fr/pt-PT: 3414 keys · missing 0 · extra 0` · `i18n-audit.cjs` → `ALL_KEYS_OK`.
- Cuidado: 5 parts pt-PT se habían escrito con estructura propia (academyBilling, academyImport, landing, legal, tours) — corregidas contra el namespace real de `en`.

### SEO
- `lib/seo.ts` → `localeAlternates(locale, path)`: canonical auto-referencial por locale + `languages` con las 4 + `x-default`. Aplicado en las 4 landings (`/`, `/pro`, `/para-academias`, `/para-productores`).
- `og:image` absoluto `${SITE_URL}/opengraph-image` (spec OG exige absoluta).
- `sitemap.ts` con `alternates.languages` por entrada.

## Verificación (G3)

- `tsc --noEmit` web: **limpio** · `next build`: **367/367 páginas × 4 locales**, middleware 47.2kB
- Smoke `next start` y `pnpm dev`: `/` es-CL 200, `/en` `/fr` `/pt-PT` 200 con `<title>` localizado y `og:image` absoluto
- `pnpm exec openspec validate i18n-multi-locale`: válido

## Notas / caveats

- ~~Warning cosmético x15 en build: `metadataBase not set`~~ — resuelto: `opengraph-image.tsx`/`twitter-image.tsx` movidas a `src/app/[locale]/` (heredan `metadataBase` del layout, og:image sale por locale). Las 4 landings usan la convención, sin `images:` explícito.
- `wallet.service.ts` hardcodea `language: "es-CL"` — es el campo del pase de Google Wallet, no del usuario; correcto que sea fijo.
- Dev server corre con el árbol nuevo (Next 15.5.28 + locales). API Nest 11 en :4000.
- pt-PT tiene ~15-30% de strings idénticos a es-CL — coincidencia legítima de vocabulario ("Guardar", "Copiar", "Check-ins"), no copia sin traducir (verificado: ninguna part es 100% idéntica).

## Próximos pasos posibles

- Archivar el change `i18n-multi-locale` (post-commit).
- QA funcional del selector de idioma con sesión real (cambiar en /perfil/datos → navegar → verificar persistencia).
- `generateStaticParams` por página con `setRequestLocale` ya aplicado; revisar que no haya páginas estáticas con texto hardcodeado restante.
