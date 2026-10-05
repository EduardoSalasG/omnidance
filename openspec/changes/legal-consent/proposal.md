# Proposal — legal-consent

## Why

Para cobrar y operar en Chile se requieren términos de uso y política
de privacidad alineados con la nueva Ley 21.719 (Ley sobre Protección
de los Datos Personales — modifica la 19.628, vigente dic-2026) y su
consentimiento registrado al crear cuenta.

## What Changes

- Páginas públicas `/terminos` y `/privacidad` (es-CL, legibles, dark
  theme del marketing layout) con el contenido legal completo.
- Consentimiento en el alta: checkbox obligatorio en el form de login/
  registro ("Acepto los Términos y la Política de Privacidad") → la API
  registra `Person.consentAcceptedAt` + `consentVersion` al crear la
  sesión/cuenta.
- `POST /me/consent` para que usuarios ya existentes (o con sesión
  vigente previa) acepten; banner in-app no bloqueante mientras
  `consentAcceptedAt` sea null o la versión sea anterior a la vigente.
- `GET /me` expone `consentVersion`/`consentAcceptedAt` para que el
  front decida el banner.
- Versión de consentimiento como constante (`CONSENT_VERSION =
  "2026-10"`): al publicar una versión nueva, los usuarios vuelven a
  ver el aviso.

## Out of scope

- Revisión legal profesional — el texto se entrega como base sólida
  pero se marca con puntos `[PENDIENTE]` donde falte dato societario
  (RUT, razón social, domicilio, email de contacto).
- Geolocalización: la app NO recolecta ubicación del dispositivo — la
  política lo declara explícitamente; si se agrega en el futuro exigirá
  consentimiento propio.
