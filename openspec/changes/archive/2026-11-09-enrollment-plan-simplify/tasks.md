# Tasks: simplificación del modelo de inscripciones y planes

## Migración y dominio

- [x] 1.1 Spec rojo: enrollment TRIAL/ONLINE → bookable como ACTIVE;
  PAUSED/FROZEN → INACTIVE no bookable (matriz de estados).
- [x] 1.2 Spec rojo: plan TRIAL→CLASS_PACK classCount=1; resolveQuota
  aplica classCount a cualquier tipo con ventana de ciclo pagado
  (MONTHLY classCount=8 renovado → conteo del ciclo, no histórico).
- [x] 1.3 Spec rojo: `membershipEndsAt` rodante (MONTHLY +1 mes,
  QUARTERLY +3, SEMIANNUAL +6, PERIOD +periodDays, SINGLE +1d,
  CLASS_PACK null); `membershipBase` sin el +1 día calendario.
- [x] 1.4 Migración Prisma: enum EnrollmentStatus ACTIVE|INACTIVE
  (mapeo TRIAL/ONLINE→ACTIVE, PAUSED/FROZEN→INACTIVE); PlanType sin
  TRIAL (TRIAL→CLASS_PACK classCount=1); evaluar drop de `pausedAt`.

## Código

- [x] 1.5 `BOOKABLE_ENROLLMENT` → ACTIVE; todas las listas
  `["ACTIVE","TRIAL","ONLINE"]` → `["ACTIVE"]` (classes ~6 sitios,
  academies ~4, home, user-intel, platform-subscriptions, claims,
  private-lessons).
- [x] 1.6 `resolveQuota`/`myQuota`: condición `plan.classCount != null`
  + ventana `gte = max(startedAt, endsAt − duración)` (CLASS_PACK
  queda `startedAt`).
- [x] 1.7 Settlement: eliminar rama TRIAL (fila aparte); checkout:
  `price <= 0` → no vendible (cualquier tipo).
- [x] 1.8 `ENROLLMENT_TRANSITIONS` → toggle ACTIVE↔INACTIVE;
  `computeDashboard` → active/inactive; `academy-reminders` filtra por
  tipo de plan por tiempo.
- [x] 1.9 Alta staff: `endsAt` autocomputado `startedAt + duración`
  (dto explícito gana); duplicate check sin status TRIAL.
- [x] 1.10 CRM: eliminar trigger `TRIAL_EXPIRING` (tipo, form, i18n,
  tests, docs de segmentos).

## Front / i18n / seed

- [x] 1.11 Badges y filtros de status → activo/inactivo
  (students-section, alumnos/[personId], dashboard KPIs);
  `planTypeLabels` sin TRIAL; `freeTrial` → `price <= 0`.
- [x] 1.12 `seed-dev.ts`: 5 "Clase de prueba" → CLASS_PACK
  classCount:1; revisar `db:enrich`/personas QA con status TRIAL.
- [x] 1.13 i18n: labels de estados (quitar paused/frozen/online/trial,
  agregar inactive) en es-CL + parts.

## Verificación y cierre

- [x] 2.1 Vitest api verde (classes, academy.service,
  membership-vigency, checkout, settlement, crm, reminders).
- [x] 2.2 `pnpm db:seed` idempotente; repro manual: prueba comprada y
  asignada staff → pack 1 clase → agota → 409; monthly classCount
  resetea al renovar.
- [x] 2.3 `pnpm build` + typecheck + lint.
- [x] 2.4 `docs/qa-flows-inventory.md`: estados, cuota por ciclo,
  vigencia rodante, alta staff autocomputada, price≤0.
- [x] 2.5 `omni-dance.md` §11 (estados/tipos/vigencia) +
  `docs/architecture.md` + `docs/flows.md` + openapi/postman export.
- [x] 2.6 Archive del change con specs aplicadas.
