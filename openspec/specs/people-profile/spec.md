# people-profile Specification

## Purpose
El perfil de persona gana un campo social público: usuario de Instagram, editable por el dueño y visible en el perfil de amistad junto al logo de la red.

## Requirements

### Requirement: Campo instagram en el perfil propio

`Person` SHALL tener un campo `instagram` opcional (nullable). El dueño SHALL poder editarlo desde su perfil vía `PATCH /me`, que acepta `{instagram}` validado como handle (sin `@` inicial, caracteres `[a-zA-Z0-9._]`, máx 30) o null/empty para limpiarlo.

#### Scenario: Guardar handle válido

- **WHEN** el usuario envía `PATCH /me` con `{instagram: "@camila.dance"}` o `"camila.dance"`
- **THEN** el sistema normaliza y persiste `camila.dance`

#### Scenario: Handle inválido

- **WHEN** el usuario envía `PATCH /me` con un instagram que contiene espacios o caracteres fuera de `[a-zA-Z0-9._]` o supera 30 chars
- **THEN** responde 400 sin mutar el perfil

#### Scenario: Limpiar handle

- **WHEN** el usuario envía `PATCH /me` con `{instagram: ""}` o `{instagram: null}`
- **THEN** el campo queda null y deja de mostrarse

### Requirement: Instagram en el perfil público

`GET /people/:id` SHALL incluir `instagram` en la respuesta. La página `/amigos/[id]` SHALL mostrar el handle con el logo de Instagram cuando está presente, enlazando a `https://instagram.com/<handle>` en pestaña nueva.

#### Scenario: Perfil con instagram

- **WHEN** el usuario abre el perfil de una persona con instagram configurado
- **THEN** junto a su identidad aparece el logo de Instagram seguido de `@handle`, con link externo a su perfil de Instagram

#### Scenario: Perfil sin instagram

- **WHEN** el usuario abre el perfil de una persona sin instagram
- **THEN** no se renderiza la fila de Instagram (sin placeholder ni label huérfano)

### Requirement: Paso de completar perfil tras el registro

Tras un `POST /auth/register` exitoso, la web SHALL redirigir a
`/bienvenida` (propagando `?next=` si venía) en vez de directo al
destino final. `/bienvenida` SHALL ofrecer un formulario con nombre
(pre-llenado), teléfono, Instagram, género (M/F/OTHER, opcional y
deseleccionable) y estilos de baile con rol y nivel opcional; todos los
campos son opcionales y la página SHALL incluir una acción "ahora no"
equivalente a enviar vacío. Guardar SHALL persistir vía `PATCH /me` y
`PUT /me/style-roles`; tanto guardar como omitir SHALL marcar
`onboarding["profile-setup"]` vía `POST /me/onboarding` y continuar a
`next` o `/inicio`.

#### Scenario: registro desemboca en bienvenida

- **WHEN** un usuario completa el registro sin `?next=`
- **THEN** aterriza en `/bienvenida` (no en `/inicio`).

#### Scenario: magic link de cuenta nueva desemboca en bienvenida

- **WHEN** `GET /auth/verify` crea la `Person` (email desconocido)
- **THEN** el redirect tras emitir la sesión apunta a
  `WEB_URL/bienvenida`; si la cuenta ya existía apunta a
  `WEB_URL/inicio`.

#### Scenario: omitir no bloquea ni reaparece

- **WHEN** el usuario pulsa "ahora no" en `/bienvenida`
- **THEN** se marca `onboarding["profile-setup"]`, continúa a
  `next`/`/inicio`, y una visita posterior directa a `/bienvenida`
  redirige al destino sin mostrar el formulario.

#### Scenario: guardar persiste y continúa

- **WHEN** el usuario completa campos y envía
- **THEN** `PATCH /me` guarda nombre/teléfono/instagram/género,
  `PUT /me/style-roles` guarda los estilos elegidos, se marca el
  onboarding y continúa a `next`/`/inicio`.

### Requirement: Conflicto de teléfono en PATCH /me

`PATCH /me` SHALL responder `409` con el error `phone_exists` cuando el
teléfono normalizado ya pertenece a otra `Person`, en vez de propagar
el error unique de base de datos como 500.

#### Scenario: teléfono en uso por otra cuenta

- **WHEN** el usuario envía `PATCH /me` con un `phone` que otra persona
  ya registró
- **THEN** responde 409 `phone_exists` sin mutar el perfil.

### Requirement: Recordatorio sutil de perfil incompleto

`/perfil` SHALL mostrar una card "Completa tu perfil" cuando la sesión
tenga alguno de estos campos sin completar (teléfono, instagram,
género o al menos un estilo de baile) y `onboarding["profile-reminder"]`
no esté marcado. La card enlaza a `/perfil/datos` y SHALL tener un
dismiss persistente que marca `onboarding["profile-reminder"]` para
quienes prefieren no declarar.

#### Scenario: perfil incompleto sin dismiss previo

- **WHEN** un usuario con género e Instagram vacíos abre `/perfil`
- **THEN** ve la card con el link a completar datos.

#### Scenario: dismiss persistente

- **WHEN** el usuario cierra la card
- **THEN** se marca `onboarding["profile-reminder"]` y no vuelve a
  aparecer aunque el perfil siga incompleto.

### Requirement: Eliminación de persona por admin

`DELETE /api/admin/users/:personId` SHALL eliminar la `Person` en una
transacción junto con todas las filas que declaran FK hacia ella
(roles, perfil fiscal, style-roles, RSVPs, gigs DJ, notificaciones,
push tokens, suscripciones de plataforma como pagador; las
suscripciones donde figura como productor quedan con `producerId`
nulo). La acción SHALL auditarse como `USER_DELETE`. El endpoint MUST
rechazar borrar la propia cuenta en sesión (400) y responder 404 si
la persona no existe. Los ids históricos sin FK (tickets, audit log,
sesiones) no se tocan.

#### Scenario: admin elimina una cuenta

- **WHEN** un admin elimina a un usuario desde su ficha
- **THEN** la `Person` y sus filas con FK desaparecen, el email queda
  libre para re-registro y queda un `AuditLog USER_DELETE` con el
  email/nombre eliminado

#### Scenario: auto-eliminación bloqueada

- **WHEN** un admin intenta borrar su propia cuenta
- **THEN** responde 400 y nada se elimina

### Requirement: Fecha de nacimiento en el perfil propio

`Person` SHALL tener un campo `birthDate` opcional (DateTime nullable,
autodeclarado). El dueño SHALL poder editarlo desde `/perfil/datos`
vía `PATCH /me`, que acepta `{birthDate}` como fecha ISO válida en el
pasado (año ≥ 1900, no futura) o null/empty para limpiarlo.
`GET /me` SHALL devolverlo.

#### Scenario: guardar fecha válida

- **WHEN** el usuario envía `PATCH /me` con `{birthDate: "1994-03-15"}`
- **THEN** se persiste y `GET /me` la devuelve

#### Scenario: fecha inválida

- **WHEN** el usuario envía una fecha futura, un año < 1900 o un
  string que no parsea como fecha
- **THEN** responde 400 sin mutar el perfil

#### Scenario: limpiar fecha

- **WHEN** el usuario envía `PATCH /me` con `{birthDate: ""}` o
  `{birthDate: null}`
- **THEN** el campo queda null

### Requirement: Badges de rol en la identidad del perfil

`/perfil` SHALL mostrar los roles de la persona como badges bajo el
nombre y correo solo cuando son ≤2. Con 3 o más `roleStates` la lista
MUST omitirse — los roles siguen visibles en la sección "Interactuar
como" (que solo lista los APPROVED, con su estado).

#### Scenario: persona con dos roles

- **WHEN** abre `/perfil` con 2 `roleStates`
- **THEN** ve ambos badges bajo su correo (con estado si no es APPROVED)

#### Scenario: persona con tres o más roles

- **WHEN** abre `/perfil` con ≥3 `roleStates`
- **THEN** no hay badges de rol bajo el correo; los roles aparecen en
  "Interactuar como"
