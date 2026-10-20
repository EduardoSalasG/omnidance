# auth/email-verification Specification

## Purpose

Prueba de posesión del correo para cuentas creadas con contraseña. Las
cuentas nacidas por magic link/OTP ya prueban el correo al verificar;
las de password no tenían vía — y el checklist de aprobación de actores
exige `emailVerified`.

## ADDED Requirements

### Requirement: Emisión de verificación en el registro con password

`POST /auth/register` SHALL emitir, además de la bienvenida, el correo
de acceso (magic link + código OTP) a la cuenta recién creada — ese
correo actúa como verificación de posesión. El registro y el login con
password SHALL NOT estampar `verifiedAt` por sí solos.

#### Scenario: cuenta nueva recibe correo de verificación

- **WHEN** un usuario se registra con email+password
- **THEN** la cuenta se crea con sesión activa y recibe dos correos:
  bienvenida y acceso (link + código) usable para verificar el correo

#### Scenario: password no prueba posesión

- **WHEN** un usuario se registra o loguea solo con password
- **THEN** `verifiedAt` queda null — solo verify/otp/verify lo estampan

### Requirement: Reenvío de verificación con sesión

`POST /auth/resend-verification` (sesión activa, rate limit de auth)
SHALL reenviar el correo de acceso (link + código) al email de la
persona cuando `verifiedAt` es null. Si el correo ya está verificado
SHALL responder éxito sin reenviar (idempotente).

#### Scenario: reenvío a correo sin verificar

- **WHEN** una persona con `verifiedAt` null pide el reenvío
- **THEN** recibe el correo con link + código y puede completar la
  verificación por cualquiera de las dos vías

#### Scenario: ya verificado no reenvía

- **WHEN** una persona con `verifiedAt` estampado pide el reenvío
- **THEN** responde éxito sin enviar correo nuevo

#### Scenario: sin sesión

- **WHEN** se llama sin cookie de sesión
- **THEN** responde 401

### Requirement: Aviso de correo sin verificar en la app

Mientras `me.verifiedAt` sea null la app SHALL mostrar un aviso
accionable (dentro de la card de rol pendiente) con CTA para reenviar
el correo e ingresar el código OTP inline — sin obligar a salir de la
app ni a cerrar sesión.

#### Scenario: verificación inline

- **WHEN** el usuario pide reenvío e ingresa el código recibido
- **THEN** `POST /auth/otp/verify` lo valida, `verifiedAt` queda
  estampado y el ítem del checklist se marca resuelto sin recargar
