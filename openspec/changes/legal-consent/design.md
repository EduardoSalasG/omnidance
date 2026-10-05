# Design — legal-consent

## Contenido de `/privacidad` (estructura obligatoria)

1. **Responsable del tratamiento**: Omni Dance SpA — `[PENDIENTE: RUT,
   domicilio, email de contacto privacidad@]`.
2. **Marco legal**: Ley 19.628 sobre Protección de los Datos
   Personales, según modificada por Ley 21.719 (vigente dic-2026) y su
   reglamento.
3. **Datos que tratamos**: cuenta (nombre, email, teléfono optativo),
   perfil de baile (género optativo, estilos y roles), actividad
   (check-ins QR, sesiones de baile, valoraciones — SIEMPRE privadas y
   agregadas, k≥3), pagos (procesados por Flow — NO almacenamos datos
   de tarjeta), tokens push del dispositivo, datos técnicos (logs con
   request-id, IP).
   Declarar explícitamente: NO recolectamos geolocalización del
   dispositivo ni datos sensibles (salud, biometría, ideología).
4. **Finalidades**: operar la plataforma (identidad QR, registro de
   bailes, ticketing, gestión de academias), notificaciones
   transaccionales (push/email), seguridad y antifraude, estadísticas
   agregadas y anonimizadas, cumplimiento tributario/contable.
5. **Base legal**: consentimiento del titular + ejecución del contrato
   de uso.
6. **Encargados/destinatarios**: Flow (pagos), Resend (correo),
   proveedor de hosting, Apple/Google (push). Transferencias
   internacionales declaradas.
7. **Derechos del titular (Ley 21.719)**: acceso (gratuito al menos
   trimestralmente), rectificación, supresión, oposición, bloqueo del
   tratamiento, portabilidad — personales, intransferibles,
   irrenunciables, gratuitos. Ejercicio: solicitud escrita a
   `[PENDIENTE: email]`; canal expedito.
8. **Retención**: mientras la cuenta esté activa + plazos legales
   (registros tributarios ~6 años).
9. **Menores**: plataforma dirigida a mayores de 18 años (escena
   nightlife); menores de 16 jamás sin representante legal (Ley
   21.719).
10. **Seguridad**: medidas técnicas/organizativas; notificación de
    brechas a la Agencia de Protección de Datos Personales y afectados
    cuando corresponda.
11. **Reclamos**: Agencia de Protección de Datos Personales (órgano
    fiscalizador).
12. **Cookies/similar**: cookie de sesión, localStorage (preferencias) —
    no cookies de terceros publicitarias.
13. **Cambios**: notificación en app + nuevo consentimiento si el cambio
    es material.

## Contenido de `/terminos`

Objeto y aceptación · cuenta (una por persona, datos veraces, 18+) ·
conducta (respeto, sin acoso) · valoraciones privadas/honestas ·
tickets (sin reembolso, transferibles, política de puerta) · rol de
omni-dance como intermediario de pagos y liquidaciones · suscripciones
SaaS de academia/productor (cobro recurrente, 5 días de gracia →
suspensión por mora, reactivación al pagar) · contenido del usuario
(fotos/videos solo links externos) · propiedad intelectual ·
disponibilidad del servicio (sin garantía de continuidad) · limitación
de responsabilidad · terminación (cuenta por el usuario o por
incumplimiento) · ley chilena + tribunales de Santiago · contacto.

## Consentimiento

- `Person.consentVersion String?` + `Person.consentAcceptedAt DateTime?`
  — migración propia (DESPUÉS de `drop_social_blocks_invites`).
- `CONSENT_VERSION = "2026-10"` en shared o API.
- `MagicLinkDto`, `RegisterDto`, `PasswordLoginDto` ganan
  `consent?: boolean` — si llega `true`, al crear sesión se estampa en
  la Person (`consentAcceptedAt=now`, `consentVersion=CONSENT_VERSION`).
  Front: checkbox OBLIGATORIO en el form antes de pedir link/registrar.
- `POST /me/consent` (SessionGuard): `{version}` → estampa los campos;
  `GET /me` expone ambos.
- Front: banner dismissible-pero-persistente (no bloquea la app) cuando
  `/me` trae `consentAcceptedAt` null o `consentVersion` distinta de la
  vigente → botón "Acepto" → POST /me/consent.
