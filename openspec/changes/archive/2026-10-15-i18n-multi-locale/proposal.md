# Proposal: i18n-multi-locale

## Why

La app nació es-CL-only (next-intl con locale fijo, `lang="es-CL"`,
formatters `Intl.*("es-CL")` hardcodeados y catálogo único). Para
crecer fuera de Chile - la escena SBK es internacional - hace falta
soporte multi-idioma real: la landing es la puerta de entrada de
productores y academias de otros países, y un usuario debe poder usar
la consola en su idioma.

## What Changes

- **Locales**: `es-CL` (default, sin prefijo) + `en`, `fr`, `pt-PT`
  con prefijo de ruta (`/en/*`, `/fr/*`, `/pt-PT/*`):
  `localePrefix: "as-needed"` en routing next-intl.
- **Estructura `[locale]`**: todo el árbol de páginas se mueve bajo
  `app/[locale]/` (route groups `(app)`/`(marketing)` intactos
  dentro); el root html layout pasa a `app/[locale]/layout.tsx` con
  `generateStaticParams` por locale.
- **Middleware**: `createMiddleware(routing)` de next-intl maneja el
  prefijo (redirect a locale preferido); el gate de sesión existente
  se compone encima - la comparación de paths públicos ignora el
  prefijo.
- **Navegación**: `Link`/`redirect`/`useRouter`/`usePathname` pasan a
  `@/i18n/navigation` (createNavigation) para que los links resuelvan
  el prefijo del locale activo - las URLs internas no cambian en
  código.
- **Preferencia persistida**: `Person.language` ("es-CL" default,
  migración) + `PATCH /me` la acepta; el selector en
  `/perfil/datos` guarda en perfil y navega al path prefijado.
  Cookie `NEXT_LOCALE` para anónimos / detect por Accept-Language en
  primera visita.
- **Formatters**: `Intl.DateTimeFormat("es-CL")` hardcodeado pasa a
  helper `getDateFmt(locale, opts)`/`getNumFmt(locale)` (mapa
  LOCALE_TAG por locale) - CLP sigue siendo la moneda de negocio.
- **Catálogos**: `messages/en/`, `messages/fr/`, `messages/pt-PT/`
  completos (espejo de es-CL.json + parts/); `i18n-audit` valida
  paridad de keys en los 4 locales.
- **SEO**: `lang` por locale, `hreflang`/`alternates.languages` en
  metadatos de las landings públicas.

## Impact

- ~130 archivos `app/(app)|(marketing)` movidos a `app/[locale]/` (mv
  puro, sin cambios de contenido salvo imports de navegación).
- ~100 call sites de Link/next/navigation se repuntan al adapter (en
  muchos casos basta cambiar el import).
- ~60 `new Intl.*("es-CL")` pasan al helper por locale.
- ~190KB × 3 catálogos nuevos (en, fr, pt-PT).
- `schema.prisma`: campo `Person.language`; migración.
- Middleware: sesión + locale compose; matcher igual.
