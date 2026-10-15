# i18n Specification

## Purpose

Soporte multi-idioma de la app: catálogos por locale, resolución por
prefijo de ruta, preferencia persistida y formatters por locale.
Antes del cambio toda la app era es-CL fija.

## ADDED Requirements

### Requirement: Locales soportados

La app SHALL soportar los locales `es-CL` (default, sin prefijo de
ruta), `en`, `fr` y `pt-PT`. Toda página SHALL poder renderizarse en
cualquiera de los 4 locales.

#### Scenario: URL por locale

- **WHEN** un usuario abre `/en/para-productores` o `/fr/login`
- **THEN** la página renderiza en ese locale y `html lang` refleja el
  locale del path.
- **WHEN** un usuario abre un path sin prefijo (`/eventos`)
- **THEN** renderiza en `es-CL` (default) sin redirect innecesario.

#### Scenario: Redirect por preferencia

- **WHEN** un visitante sin cookie abre `/` con
  `Accept-Language: en`
- **THEN** middleware lo redirige a `/en/` y setea la cookie
  `NEXT_LOCALE=en`.

### Requirement: Preferencia persistida

El idioma SHALL persistir en `Person.language` (default `"es-CL"`)
y la cookie `NEXT_LOCALE` para anónimos.

#### Scenario: Cambio de idioma desde perfil

- **WHEN** el usuario elige "English" en el selector de idioma de su
  perfil
- **THEN** se persiste `Person.language="en"` vía `PATCH /me`, la
  cookie se actualiza y la navegación recarga el path actual bajo el
  prefijo `/en`.

#### Scenario: Idioma viaja entre dispositivos

- **WHEN** el usuario con `language="fr"` inicia sesión en otro
  dispositivo
- **THEN** su preferencia aplica (vía cookie seteada tras login o
  primera navegación autenticada) sin volver a elegir.

### Requirement: Navegación interna preserva el locale

Todo `Link`, `redirect`, `router.push` y `router.back`-equivalente
SHALL resolver el prefijo del locale activo vía el adapter
`@/i18n/navigation`; el código no concatena prefijos a mano.

#### Scenario: Link desde página francesa

- **WHEN** el usuario navega con `Link href="/eventos"` desde una
  página `/fr/*`
- **THEN** el href resuelto es `/fr/eventos`.

### Requirement: Catálogo por locale con fallback

Cada locale SHALL tener su catálogo completo (base + parts espejo de
es-CL). Una key faltante SHALL caer a es-CL en vez de romper.

#### Scenario: Paridad de keys

- **WHEN** corre el `i18n-audit`
- **THEN** valida que en/fr/pt-PT tengan exactamente las mismas keys
  que es-CL.

### Requirement: Formatters por locale

Fechas, números y moneda SHALL formatearse con el tag del locale
activo vía el helper compartido - ningún formatter queda hardcodeado
a `es-CL`. La moneda de negocio (CLP) no cambia.

#### Scenario: Fecha en inglés

- **WHEN** una página renderiza una fecha bajo `/en/*`
- **THEN** el formato respeta convenciones en-US (o el tag del
  locale), no `es-CL`.
