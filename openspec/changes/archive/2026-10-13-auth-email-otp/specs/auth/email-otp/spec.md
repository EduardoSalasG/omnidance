## Purpose

Acceso por código OTP de un solo uso enviado por email, complementario al
magic link: resuelve el login cuando el link abre un navegador distinto al
de la app instalada (PWA) y el caso cross-device.

## ADDED Requirements

### Requirement: Emisión híbrida link + código

El email de acceso SHALL incluir el magic link existente Y un código de 6
dígitos legible. El código se genera por solicitud de acceso (`POST
/auth/magic-link` y el reenvío de claim en `POST /auth/register`), se
persiste hasheado con `expiresAt` (~10 min) y MUST NUNCA aparecer en logs
ni respuestas. Pedir un nuevo acceso invalida el código anterior del mismo
email.

#### Scenario: solicitud de acceso emite ambos

- **WHEN** un usuario solicita acceso por email
- **THEN** el correo contiene el link de verificación y un código de 6
  dígitos, ambos válidos y equivalentes para iniciar sesión

#### Scenario: nueva solicitud invalida la anterior

- **WHEN** el mismo email solicita acceso dos veces
- **THEN** solo el código de la solicitud más reciente es válido

### Requirement: Verificación del código

`POST /auth/otp/verify {email, code}` SHALL, ante un código válido y
vigente: consumirlo (no reutilizable), resolver la cuenta como hace el
magic link (`upsertByEmail`; si no existía se crea y se envía bienvenida),
estampar el `consent` registrado al pedir el acceso, emitir sesión y
responder `{ok:true}` con la cookie de sesión seteada en el origen web.
Ante código inválido, expirado, ya consumido o email sin solicitud vigente
responde 401 uniforme ("Código inválido o expirado") sin revelar cuál caso
fue, y marca el intento.

#### Scenario: código correcto crea sesión

- **WHEN** se verifica un código válido dentro de su ventana
- **THEN** responde 200 `{ok:true}`, la cookie `omnidance_session` queda
  seteada y el código queda consumido

#### Scenario: reuso rechazado

- **WHEN** se intenta verificar un código ya consumido
- **THEN** responde 401 uniforme y no emite sesión

#### Scenario: código expirado

- **WHEN** se verifica un código tras su `expiresAt`
- **THEN** responde 401 uniforme

### Requirement: Límite de intentos

La verificación SHALL rechazar con 401 uniforme tras ~5 intentos fallidos
consecutivos sobre el mismo código, y el acceso queda bloqueado hasta pedir
uno nuevo. La emisión conserva el rate limit estricto de auth vigente.

#### Scenario: fuerza bruta acotada

- **WHEN** se superan los intentos fallidos permitidos sobre un código
- **THEN** verificaciones posteriores responden 401 aunque el código sea
  correcto

### Requirement: Alta de cuenta vía código

Cuando el código verifica un email sin cuenta, el sistema SHALL crear la
cuenta (`upsertByEmail`), enviar la bienvenida y dirigir al paso de perfil
post-registro; mismo resultado observable que el magic link.

#### Scenario: primer acceso por código

- **WHEN** un email sin cuenta verifica un código válido
- **THEN** la cuenta se crea, se estampa el consent si venía marcado, y la
  respuesta permite a la app llevar al onboarding de perfil
