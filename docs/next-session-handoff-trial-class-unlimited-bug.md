# Handoff: bug "clase de prueba" ilimitada → change `trial-class-quota`

Sesión 2026-11-09 noche. El trabajo de `onboarding-tours-pass` quedó
CERRADO (`c1b97e8c` + `296d0c1b`, archivado con specs aplicadas) - ver
`next-session-handoff-tours-copy-viewport.md`.

## Bug reportado y Causa raíz CONFIRMADA

- Al registrar `salas.eduardo.cl+prueba@gmail.com` desde la invitación
  de **Mambo Madness** eligiendo "clase de prueba", el alumno ve su
  plan como **ilimitado** en `/academia/alumnos/[personId]`.
- El dato en DB es CORRECTO: `Enrollment` status `TRIAL`, plan
  "Clase de prueba" (type TRIAL, price 0), `endsAt` 2026-11-09 15:00.
  Person: `cmw9ou8xr00dosinvgext4mtq`.
- Causa raíz (dos puntos):
  1. Todos los planes TRIAL del seed (`seed-dev.ts`, helper `plan()`,
     5 academias: muvet l.629, tumbao l.660, loop l.1241, mambo l.1572,
     adrianLeo l.1840) se crean SIN `classCount` → NULL = ilimitado.
  2. El resolvedor de cuota `resolveQuota()` en
     `apps/api/src/academies/infrastructure/classes.controller.ts`
     (~l.214) solo aplica `classCount` cuando `plan.type ===
     "CLASS_PACK"`; una inscripción TRIAL siempre cae en el bucket
     `unlimited` (~l.235) aunque el plan tuviera `classCount`.

## Decisión del dueño (confirmada)

"Clase de prueba = 1 clase solamente, no es recurrente. Se agenda y
se agota." Sin backfill de planes TRIAL viejos (`classCount = null`
sigue ilimitado).

## Change `trial-class-quota` (validado, NO implementado)

`openspec/changes/trial-class-quota/` completo: proposal, design,
tasks, delta `academies/class-credits` (MODIFIED: `classCount` aplica
a cualquier tipo que lo defina, no solo CLASS_PACK; orden de
resolución semanal → conteo → ilimitado se conserva; `myCredits`
reporta `kind:"PACK"` para TRIAL con cupo).

Implementación pendiente (task list del change):
- Test rojo: TRIAL + `classCount=1` + 1 reserva consumida → book 409.
- `classes.controller.ts` `resolveQuota()`: condición `plan.type ===
  "CLASS_PACK" && plan.classCount != null` → `plan.classCount != null`.
- `seed-dev.ts`: `classCount: 1` en los 5 llamados TRIAL.
- Verificar display de la ficha (el "ilimitado" sale de `classCount
  = null`; con 1 se corrige solo, revisar si hay literal adicional).
- `docs/qa-flows-inventory.md` + archive.

## Stack (quedó corriendo para prueba del usuario)

- Web `next dev` :3000 (maté un node zombie PID 36424 que ocupaba el
  puerto - mismo patrón de `.next` zombie documentado en AGENTS.md).
- API :4000 nest watch con `PAYMENT_GATEWAY=stub` (sesión anterior).
- Docker `omnidance-db`/`omnidance-redis` healthy.
- DB dev: `omnidance:omnidance@localhost:5433/omnidance` (del
  `apps/api/.env`; `.env` raíz dice :5432 - el que funciona es :5433).
  Query: `docker exec omnidance-db psql -U omnidance -d omnidance`.

## Otros pendientes acumulados

- Validación en prod: params de seed + grant trial Producer Pro.
- Flake residual `dancer-eventos` mobile.
- Drift i18n preexistente: `academyPay.report.*`,
  `academy.levelsConfig.backToGlobalBody`.
- `.openspec-archive.lock` stale reapareció 2 veces esta sesión; fix:
  `rm openspec/changes/archive/.openspec-archive.lock` y re-correr.
