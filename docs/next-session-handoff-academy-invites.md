# Handoff: academy-invites implementado + fix espacio editor niveles

Sesión 2026-11-09 noche. Dos commits en dev:

- `8d511358` fix(web): el `legend` del fieldset del editor de niveles
  (`/academia/alumnos/[personId]`) no participa del flex `gap`
  (verificado con Playwright: gap medido 0 en Chromium y WebKit);
  `margin-bottom` sí aplica -> `mb-2` en el legend, gap-1.5 muerto
  removido. Mismo quirk latente en TODOS los `fieldset flex flex-col
  gap-*` del repo (staff-form, series-form, FilterBar...): si se
  reporta aire faltante entre legend y contenido en otra superficie,
  el fix es el mismo.
- `62a334b0` feat(academies): change `academy-invites` completo,
  archivado como `2026-11-09-academy-invites` (specs canónicas
  aplicadas: academies/student-invites nuevo, auth/email-otp updated).

## Qué quedó implementado

- Migración `20261125000000_academy_invites`: tabla `AcademyInvite`
  (academyId, email, name, invitedById, personId?, consumedAt) +
  `AuthOtp.next`.
- `AcademyInvitesController`: `POST /academies/:id/invites` (cap
  students, Write) crea invite + magic link 7d con
  `next=/academias/:id` + correo `academyInviteEmailHtml` (sin
  enrollment); idempotente por pendiente (`resent:true` reenvía sin
  duplicar); cuenta existente -> push `academy.invite` (notifySafe).
  `GET /academies/:id/invites` (cap students) pendientes primero.
- `createMagicToken(email, consent, ttl, {role, next})` y
  `createOtp(email, consent, {role, next})` - firma a objeto (callers
  actualizados). `verifyMagicToken`/`verifyOtp` devuelven `next`.
- Verify: `internalNext` sanitiza (`/…` sin `//` ni `/\`); consume
  invite por academyId parseado del next -> consumedAt+personId +
  `Referral` INVITE (referrer=invitedById, dedup findFirst) +
  `invite.registered`. Redirect: cuenta nueva -> `/bienvenida?next=`
  (ya lo consume), existente -> `next` directo (o /inicio).
  `POST /auth/otp/verify` devuelve `next` y login-form lo prioriza.
- Web: `/academia/alumnos/invitar` (email*, nombre*, apellido) con
  ConsoleHeader; CTA "Invitar" secundario junto a "+ Agregar alumno"
  (`canInvite=manages`: owner/ADMIN o staff cap students - aunque el
  alta siga owner/ADMIN); sección "Invitados" en la página
  (AcademyInvitesSection). i18n es-CL + en/fr/pt-PT.
- Docs: omni-dance.md, qa-flows-inventory.md (truco alias `+` de Gmail
  para correos reales únicos en QA), architecture.md, flows.md,
  openapi.json + postman regenerados (376 paths).

## Verificación citada

- `tsc --noEmit` api + web: limpio. eslint web archivos tocados: limpio.
- i18n-audit: `ALL_KEYS_OK`. impeccable detect --json: `[]`.
- vitest: 42/42 (invites spec 5 + auth.service 15 + auth.controller 22).
- openspec validate --changes: verde; archive con specs aplicadas.
- Smoke E2E real (API :4000, personas QA correo real): login
  salas.eduardo.cl@gmail.com -> POST invite a salas.eduardo03@gmail.com
  -> token firmado con JWT_SECRET -> GET /auth/verify redirige a
  `localhost:3000/academias/<id>` -> DB: consumedAt+personId,
  Referral INVITE, invite.sent + invite.registered.
- Usuario probó invite con `salas.eduardo.cl+prueba@gmail.com`
  (alias + de Gmail): funcionó - correo real llega a la misma casilla.

## Pendiente / notas

- Decisión tomada: cuenta existente con `next` redirige DIRECTO a next
  (no `/inicio?next=` como sugiere la letra de la spec) - /inicio no
  consume next y el scenario exige terminar en el perfil.
- El correo de invite NO incluye código OTP (TTL 10min vs link 7d):
  `AuthOtp.next`/`verifyOtp` transportan next por spec pero invites no
  crean OTP hoy.
- API dev `nest start --watch` con PAYMENT_GATEWAY=stub quedó viva en
  :4000 (la levanté para el export de docs y el smoke).
- Sigue pendiente del handoff anterior: validar en prod params de seed
  + grant trial Producer Pro; flake residual dancer-eventos mobile.
