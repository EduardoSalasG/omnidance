# Delta: legal-consent (consent-por-jurisdiccion)

## ADDED Requirements

### Requirement: Jurisdicción legal del actor

`Person` SHALL persistir `jurisdiction` resuelta desde el país
declarado en el alta (`country` ISO-2 en `POST /auth/register`, default
`CL`): códigos EU/EEA → `EU`, resto → `CL`. La jurisdicción SHALL ser
editable en el perfil del usuario.

#### Scenario: Alta europea

- **WHEN** un usuario registra con `country: "ES"`
- **THEN** `Person.jurisdiction` queda `EU` y el consentimiento
  requerido es el GDPR granular

#### Scenario: Sin país declarado

- **WHEN** el alta no declara `country`
- **THEN** la jurisdicción queda `CL` (baseline actual)

### Requirement: Texto legal por jurisdicción

El sistema SHALL mantener `LegalText` versionado por jurisdicción
(`{jurisdiction, version, body, requiredScopes[], granular, publishedAt,
active}`) y exponer `GET /legal/consent?country=<ISO-2>` (público) que
resuelve jurisdicción por el país y devuelve el texto/versión vigente,
`requiredScopes` y si el consentimiento es `granular` (EU: scopes
`essential`/`marketing`/`analytics` separados; CL: `essential` único).

#### Scenario: Form EU muestra granularidad

- **WHEN** el form de registro consulta `GET /legal/consent?country=DE`
- **THEN** recibe `granular: true` y `requiredScopes` con los tres
  scopes; el envío solo requiere `essential`; `marketing`/`analytics`
  son opt-in registrados

#### Scenario: Sin LegalText activo para la jurisdicción

- **WHEN** no hay `LegalText` `active` para la jurisdicción resuelta
- **THEN** responde con la versión CL por defecto (fail-open al texto
  baseline, nunca bloquea el registro)

### Requirement: Registro auditable por aceptación

`POST /me/consent` SHALL aceptar `{version, scopes?}` y SHALL escribir
un `ConsentRecord` por aceptación (`{personId, jurisdiction, version,
scopes Json, acceptedAt}`) además del snapshot
`Person.consentVersion`/`consentAcceptedAt`. El alta con consentimiento
declarado SHALL escribir el mismo record con la jurisdicción resuelta.
Scopes no requeridos por la jurisdicción SHALL ignorarse (un scope
`marketing` enviado en CL no se persiste).

#### Scenario: Aceptación granular EU

- **WHEN** un usuario EU acepta `{version:"eu-v1.0",
  scopes:{essential:true,marketing:true}}`
- **THEN** el `ConsentRecord` persiste ambos scopes, `jurisdiction:"EU"`
  y el snapshot queda `eu-v1.0`; una auditoría puede reconstruir qué
  aceptó y cuándo

#### Scenario: Re-aceptación por versión de la jurisdicción

- **WHEN** un usuario cuyo `consentVersion` es anterior a la vigente
  DE SU jurisdicción abre la app
- **THEN** el aviso de re-aceptación muestra el texto de su
  jurisdicción y aceptar escribe un `ConsentRecord` nuevo
