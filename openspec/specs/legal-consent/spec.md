# legal-consent Specification

## Purpose
Consentimiento legal versionado al crear cuenta (Ley 21.719 Chile): páginas públicas `/terminos` y `/privacidad`, checkbox requerido en el alta, estampa `Person.consentVersion`/`consentAcceptedAt` en todos los caminos de registro y `POST /me/consent` + `ConsentBanner` para re-aceptación de usuarios existentes.

## Requirements

### Requirement: Páginas legales públicas

La plataforma SHALL publicar `/terminos` (términos y condiciones de
uso) y `/privacidad` (política de tratamiento de datos personales
alineada con la Ley 19.628 según Ley 21.719) accesibles sin sesión,
enlazadas desde el formulario de acceso y desde el aviso de
consentimiento.

#### Scenario: acceso anónimo

- **WHEN** un visitante abre `/terminos` o `/privacidad` sin sesión
- **THEN** ve el texto legal completo en español.

### Requirement: Consentimiento registrado al crear cuenta

El alta de una cuenta SHALL requerir la aceptación explícita de los
términos y la política (checkbox en el formulario de acceso/registro) y
la API SHALL persistir `consentAcceptedAt` + `consentVersion` en la
Person cuando el request de autenticación declara el consentimiento.

#### Scenario: alta con consentimiento

- **WHEN** un usuario crea su cuenta aceptando el checkbox
- **THEN** su Person queda con `consentAcceptedAt` y la versión vigente.

#### Scenario: sin consentimiento explícito del usuario

- **WHEN** el formulario se intenta enviar sin aceptar
- **THEN** el envío no procede (validación de formulario).

### Requirement: Re-aceptación por versión

Un usuario autenticado cuya `consentVersion` esté ausente o sea
anterior a la vigente SHALL ver un aviso persistente (no bloqueante)
con la opción de aceptar la versión nueva; al aceptar, `POST
/me/consent` registra la aceptación.

#### Scenario: usuario legado acepta

- **WHEN** un usuario con `consentAcceptedAt` null acepta el aviso
- **THEN** `POST /me/consent` estampa la versión vigente y el aviso no
  vuelve a mostrarse.

### Requirement: Reclamo de cuenta pre-sembrada en register

Cuando `POST /auth/register` recibe un email que ya existe en `Person`
(cuenta pre-sembrada con data asociada), el sistema SHALL NOT crear una
Person duplicada ni pisar sus datos. Si la cuenta tiene `passwordHash`
y el password entregado coincide, register SHALL emitir la sesión
(equivale a login) y estampar el consentimiento si vino declarado. Si
no coincide o la cuenta nunca tuvo password, el sistema SHALL enviar un
magic link a ese correo (best-effort: el fracaso del mailer no cambia
la respuesta) y responder 409 con un mensaje que indique que se envió
el link. Al verificar el magic link, `upsertByEmail` SHALL adjuntar la
sesión a la Person existente con toda su data sembrada.

#### Scenario: password correcto reclama la cuenta

- **WHEN** register llega con el email y password de una Person
  existente
- **THEN** emite la sesión (cookie) sobre esa Person; sin crear
  duplicado ni pisar el nombre; y no envía correo

#### Scenario: cuenta sin password recibe link de reclamo

- **WHEN** register llega sobre una Person existente sin
  `passwordHash`
- **THEN** se envía un magic link a su correo y la respuesta es 409;
  al verificar el link la sesión queda sobre esa Person con toda su
  data

#### Scenario: password incorrecto no da acceso

- **WHEN** register llega con password que no coincide con el
  `passwordHash` de la Person existente
- **THEN** se envía magic link al correo real y responde 409; el
  password incorrecto nunca emite sesión ni cambia la contraseña

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
