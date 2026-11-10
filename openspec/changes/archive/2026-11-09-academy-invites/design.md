# design: academy-invites

## Context

Ver proposal.md. Piezas reutilizables: `sendInvite` de
academy-staff (patrón magic token + MAILER), `studentInviteEmailHtml`,
`Referral` (source INVITE), push vía `PUSH_PORT`, y `AuthOtp` que ya
lleva extras (`consent`, `role`) del token al verify.

## Goals / Non-Goals

**Goals:** invitación de registro con seguimiento (pendiente /
registrado), atribución por Referral y ActivityEvent, landing
post-onboarding en la academia.

**Non-Goals:** invitación por link compartible/whatsapp genérico,
enrollment automático al registrarse, import masivo (ya cubierto por
bulk-import).

## Decisions

**1. `AcademyInvite` como entidad, no stub Person.** A diferencia del
alta de alumno, acá no se crea Person hasta que se registra: el
estado pendiente vive en la invitación. `personId`/`consumedAt` se
rellenan al consumir. Única pendiente por (academyId,email): re-invite
reenvía correo (TTL fresco) sin duplicar fila.

**2. `next` viaja en `AuthOtp` como `role`/`consent` ya lo hacen.**
Nuevo campo `next String?`; `createMagicToken(email, consent, ttl, {role, next})`.
El verify valida que sea path interno (`/…` sin `//` inicial) y lo
preserva en la redirect de `/bienvenida`/`/inicio` como query; el
front lo consume al cerrar onboarding. Alternativa descartada:
redirect directo al perfil saltando bienvenida (rompe el paso de
perfil post-registro).

**3. Push solo a cuentas existentes** vía `notifySafe` (el sender
web-push ya es best-effort y calla sin VAPID). Nuevas cuentas no
pueden recibir push: no tienen tokens.

**4. Consumo en el verify, no por cron.** `verifyMagicToken` devuelve
email; el controller marca `AcademyInvite.consumedAt`+`personId`,
crea `Referral` (referrer = invitedById) y emite ActivityEvent
`invite.registered`. Match por email + pendiente.

**5. UI en `/academia/alumnos`.** Acción secundaria "Invitar" junto a
"Agregar alumno" (patrón console: CTA a página de form). La lista de
invitados va como sección en la misma página (pendientes primero),
siguiendo `console-patterns`/`ui-lists`.

## Risks / Trade-offs

- [Magic link de login a cuenta existente = OTP reutilizable] → mismo
  riesgo aceptado del magic link actual (7d TTL, single-use del OTP).
- [Staff spamea invites] → idempotencia por pendiente + límite por
  academia si hiciera falta (sin límite v1, auditable por invitedById).
- [Referral con referrer=staff y no owner] → aceptado: atribuye al
  ejecutor real de la invitación.

## Migration Plan

1. `pnpm db:migrate`: `AcademyInvite` + `AuthOtp.next`.
2. Deploy API + web. Invites nuevos funcionan de inmediato; no hay
   backfill (feature nuevo).
3. Rollback: revertir código; tabla y columna quedan inertes.
