# Tasks: i18n-multi-locale

## 1. Infra de routing
- [x] `src/i18n/routing.ts` con locales/default/localePrefix as-needed
- [x] `src/i18n/navigation.ts` (createNavigation: Link, redirect, useRouter, usePathname, getPathname)
- [x] `messages.ts` → `getMessages(locale)` por locale + fallback merge con es-CL
- [x] `request.ts` resuelve locale del request
- [x] Mover `app/(app)` + `app/(marketing)` bajo `app/[locale]/`; root layout → `app/[locale]/layout.tsx` con `generateStaticParams`; `lang` dinámico
- [x] Providers por grupo leen `getMessages(locale)` (common/app/marketing messages)
- [x] Middleware: next-intl `createMiddleware` + gate de sesión componiendo (paths públicos sin prefijo)
- [x] Imports `next/link`/`next/navigation` → `@/i18n/navigation` en todo el árbol movido
- [x] Redirects absolutos (`redirect("/x")`, `router.push("/x")`) pasan por el adapter
- [x] `safeInternalPath` sigue validando el destino post-locale (paths sin prefijo)

## 2. Preferencia de idioma
- [x] `Person.language` string default "es-CL" + migración
- [x] `PATCH /me` acepta language (whitelist de locales)
- [x] Selector de idioma en `/perfil/datos` → PATCH + replace al path con prefijo
- [x] Cookie NEXT_LOCALE para anónimos; Accept-Language detect en primera visita
- [x] html `lang` por locale en layout

## 3. Formatters
- [x] `lib/intl.ts`: `getDateFmt(locale, opts)`/`getNumFmt(locale, opts)` con mapa LOCALE_TAG
- [x] Reemplazar `Intl.DateTimeFormat("es-CL")`/`Intl.NumberFormat("es-CL")` en páginas y componentes (~110 sites) por el helper con useLocale()/getLocale()

## 4. Catálogos
- [x] `messages/en.json` + `parts/en/*` completo (3414 keys, 0 faltantes/extra)
- [x] `messages/fr.json` + `parts/fr/*` completo (3414 keys)
- [x] `messages/pt-PT.json` + `parts/pt-PT/*` completo (3414 keys)
- [x] `scripts/i18n-parity.cjs` valida los 4 locales (paridad de keys vs es-CL)

## 5. SEO + verificación
- [x] alternates.languages en landings públicas (`localeAlternates` en lib/seo.ts)
- [x] sitemap con alternates.languages por entrada
- [x] tsc web+api, next build (367 páginas × 4 locales), smoke /en /fr /pt-PT (títulos localizados, og:image absoluto)
- [x] Regenerar docs API (`/me` acepta `language`); openapi.json + postman
