# people-profile - deltas

## ADDED Requirements

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
