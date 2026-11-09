# Handoff: bug "clase de prueba" quedó con plan ilimitado

Sesión 2026-11-09 noche (continuación). El trabajo de
`onboarding-tours-pass` quedó CERRADO y commiteado (`c1b97e8c` +
`296d0c1b`, archive con specs aplicadas) - ver
`next-session-handoff-tours-copy-viewport.md`.

## Bug reportado por el usuario (SIN investigar aún)

- Al registrar `salas.eduardo.cl+prueba@gmail.com` desde la invitación
  de la academia **Mambo Madness**, el usuario escogió "clase de
  prueba" pero quedó con **plan ilimitado** (debería haber quedado con
  la clase/entrada de prueba, no una inscripción ilimitada).
- Sospecha: el flujo invite → `/bienvenida` → alta → elección de plan
  está creando el enrollment equivocado. Revisar el change
  `2026-11-09-academy-invites` (verify consume invite, crea
  `Referral` INVITE y `invite.registered`) y el endpoint de alta de
  enrollment: qué `kind`/`planId` se pasa cuando se elige "clase de
  prueba" vs ilimitado.

## Cómo reproducir / dónde mirar

1. DB dev (docker `omnidance-db`, Postgres 16):
   `docker exec omnidance-db psql -U <user> -d <db>` — sacar
   credenciales reales de `apps/api/.env` (`DATABASE_URL`) o
   `docker-compose.yml` (mi intento `postgres/omnidance` falló).
   Buscar `Person` por email `salas.eduardo.cl+prueba@gmail.com`,
   su `Enrollment` (kind, plan, academyId) y la `AcademyInvite` /
   `Referral` asociadas. Mambo Madness está en el seed demo.
2. Código: `apps/api/src/academies/` (invites + enrollments),
   `POST /academies/:id/invites`, `verify` consume invite;
   `apps/web/src/app/[locale]/(app)/bienvenida` + ficha pública de
   academia donde se elige plan/clase de prueba.
3. Stack: API :4000 viva (nest watch, `PAYMENT_GATEWAY=stub`), DB+Redis
   docker healthy; web :3000 colgada al momento del cierre (posible
   `next start` zombie - matar PID + `rm -rf apps/web/.next` si sigue).

## Estado del repo al cierre

- dev limpio tras los 2 commits de tours; working tree limpio.
- Pendiente de siempre: validación prod params + trial Producer Pro;
  flake residual dancer-eventos mobile; drift i18n preexistente
  `academyPay.report.*`/`academy.levelsConfig.*`.
