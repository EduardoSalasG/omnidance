# Design — auth-email-otp

## Approach

Híbrido en un solo email: el mail de acceso lleva link + código de 6
dígitos. Link = un toque en browser; código = tipeo en la app instalada o en
otro dispositivo. Ambos caminos convergen en el mismo desenlace
(upsertByEmail → consent → sesión + cookie → bienvenida si cuenta nueva).

## Componentes

### Modelo `AuthOtp` (Prisma, migración versionada)

```
model AuthOtp {
  id         String   @id @default(cuid())
  email      String
  codeHash   String   // sha256(code + pepper) — nunca el código en claro
  consent    Boolean  @default(false)
  expiresAt  DateTime
  attempts   Int      @default(0)
  consumedAt DateTime?
  createdAt  DateTime @default(now())
  @@index([email])
}
```

DB (no Redis): la duración es minutos y el volumen es mínimo; un modelo
evita un segundo store para auth. Generación: `crypto.randomInt(0,1e6)`
formateado a 6 dígitos. Hash: sha256 con `JWT_SECRET` como pepper (mismo
patrón de secreto que ya inyecta `auth.module`).

### API

- `AuthService`: `createOtp(email, consent)` (invalida activos previos del
  email → `consumedAt=now`), `verifyOtp(email, code)` →
  `{email, consent} | throws`. Verify: último `AuthOtp` activo del email →
  consumed/expired/attempts≥5 → 401; compara hash con `timingSafeEqual`;
  fallo → `attempts++`; éxito → `consumedAt`.
- `AuthController.sendMagicLink` → emite también el OTP y pasa
  `{link, code}` a `magicLinkEmailHtml`.
- `POST /auth/otp/verify` — body `{email, code}` (class-validator:
  `IsEmail`, `Matches(/^\d{6}$/)`); `@Throttle(AUTH_THROTTLE)`; misma lógica
  de verify magic-link pero responde `{ok:true, isNew}` sin redirect. El
  front decide `/bienvenida` vs `/inicio` con `isNew`.

### Email

`magicLinkEmailHtml(link, code)`: código grande arriba (mono, tracking
amplio), texto "o abre este link" debajo. Mismo sender/asunto.

### Front (login)

Tras `POST /auth/magic-link` → vista "Revisa tu correo": input de 6 dígitos
(paste-friendly, `inputMode=numeric`, `autocomplete=one-time-code`) +
"¿No tienes la app abierta? Abre el link del correo". Submit →
`POST /api/auth/otp/verify` → router a `/bienvenida` (isNew) o `/inicio`.
i18n en el catálogo `es-CL` existente.

## Decisiones

- **No JWT para el OTP**: el magic token es stateless porque el link ya es
  single-use por UX; el código corto necesita contador de intentos y
  consumo real → fila en DB.
- **Un `AuthOtp` activo por email**: nueva solicitud consume los
  anteriores (evita ambigüedad de "cuál código").
- **401 uniforme**: no revela si el email existe, si expiró o si falló el
  código (misma doctrina que `/auth/login`).
- **Invitaciones multi-día** (`createMagicToken` con ttl largo, spec
  academy-staff-roles) siguen siendo solo-link: un OTP de 6 dígitos no es
  apto para ventanas de días. Solo el flujo de acceso propio emite OTP.
