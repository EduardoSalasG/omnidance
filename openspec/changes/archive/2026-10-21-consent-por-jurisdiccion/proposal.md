# Proposal — consent-por-jurisdiccion

## Why

El consentimiento legal actual es único e implícito chileno (Ley
19.628 + 21.719): un solo checkbox en el alta, `Person.consentVersion`
+ `consentAcceptedAt`, `/terminos` y `/privacidad` con texto único, y
`POST /me/consent` + `ConsentBanner` para re-aceptación. Multipaís
exige resolver la ley aplicable por jurisdicción del actor: Europa
exige GDPR (consentimiento **granular**: necesario vs. marketing vs.
analítica, y registro auditable de qué aceptó cada persona) — operar
en UE con el checkbox chileno único es ilegal.

## What Changes

- **Jurisdicción del actor**: `Person.jurisdiction` resuelta al alta
  desde el país declarado (`country` ISO-2 en register; mapping
  EU/EEA → `EU`, resto → `CL` baseline). Editable en settings.
- **`LegalText`** (nuevo modelo): catálogo versionado de textos por
  jurisdicción `{jurisdiction, version, body, requiredScopes[],
  granular, publishedAt, active}`. Seed: texto CL vigente (extraído
  del `/privacidad` actual) + texto EU GDPR (contenido base,
  pendiente revisión legal — marcado `draftNote`).
- **`ConsentRecord`** (nuevo modelo): historial auditable por
  aceptación `{personId, jurisdiction, version, scopes Json,
  acceptedAt}` — `Person.consentVersion`/`consentAcceptedAt` quedan
  como snapshot del último consentimiento.
- **`GET /legal/consent?country=`** (público): versión vigente +
  `requiredScopes` + flag `granular` para la jurisdicción — el
  registro la consulta para renderizar el form correcto (EU →
  checkboxes granulares; CL/resto → checkbox único como hoy).
- **`POST /me/consent`** extendido: acepta `{version, scopes?}` y
  escribe `ConsentRecord` además del snapshot en `Person`. Register
  escribe el mismo record cuando el consent viene declarado.
- **Front**: `ConsentBanner` pide la versión de la jurisdicción del
  usuario y renderiza granular cuando aplica; registro consulta
  `GET /legal/consent` antes de armar los checkboxes.
- Migración versionada: `Person.jurisdiction` + `LegalText` +
  `ConsentRecord`.

## Out of scope

- Derecho al olvido/descarga de datos GDPR como flujo (la baja lógica
  ya existe; la operación ARCO/GDPR sigue por soporte).
- Geo-IP para inferir jurisdicción (es por país declarado).
- Redacción legal del texto EU final (contenido base con `draftNote`
  visible en admin).
