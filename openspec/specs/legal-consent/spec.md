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
