# legal-consent — delta pilot-real-users

## ADDED Requirements

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
- **THEN** emite la sesión (cookie) sobre esa Person — sin crear
  duplicado ni pisar el nombre — y no envía correo

#### Scenario: cuenta sin password recibe link de reclamo

- **WHEN** register llega sobre una Person existente sin
  `passwordHash`
- **THEN** se envía un magic link a su correo y la respuesta es 409;
  al verificar el link la sesión queda sobre esa Person con toda su
  data

#### Scenario: password incorrecto no da acceso

- **WHEN** register llega con password que no coincide con el
  `passwordHash` de la Person existente
- **THEN** se envía magic link al correo real y responde 409 — el
  password incorrecto nunca emite sesión ni cambia la contraseña
