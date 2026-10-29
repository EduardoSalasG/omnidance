# Proposal: academy-score-refine

## Why

El `RelationshipScore` para actor ACADEMY hoy es `min(100, asistencias×10 +
spend/1000 + referrals×15)` con `spend` hardcodeado a 0 (el comentario del
código dice "sin vínculo Payment↔academy"; ya existe vía `refId`
`mem_/wks_/pvt_` y `PaymentClaim` APPROVED). No captura compras de
plan/clase/taller/privada, rachas semanales ni continuidad mensual, que son
las señales que la spec de producto (`omni-dance.md` §11/§14) pide para
"score de cercanía del alumno". Además el score solo se ve en la ficha del
alumno: ni el listado `/academia/alumnos` ni el admin de plataforma lo
exponen, y el recompute es solo manual → las vistas quedan obsoletas.

## What Changes

- **Fórmula ACADEMY refinada** (sigue siendo agregada 0-100, sin ledger):
  asistencia últimas 8 semanas, racha semanal actual (semanas consecutivas
  con ≥1 asistencia), meses continuos con actividad/membresía, compras PAID
  últimos 6 meses resueltas por `refId` + claims APPROVED, antigüedad desde
  primer enrollment, referrals. Pesos configurables por `PlatformParam`.
- **Segmentos**: `AT_RISK` se refina a "sin asistir > `crm.winback_days`"
  **o** asistencia últimas 4 semanas < 50% de las 4 anteriores (detecta
  caída, no solo ausencia); `CORE` pasa a umbral de score (param) en vez
  de ≥3 asistencias. `NEW`/`BRINGS_PEOPLE` sin cambio semántico.
- **`RelationshipScore.breakdown` Json?**: nuevo campo nullable que persiste
  los componentes del score para explicabilidad en fichas (migración no
  destructiva).
- **Job diario `crm.scores`** registrado en el scheduler declarativo
  (default 06:00 America/Santiago): recompute para todos los actores.
- **Listado de alumnos**: `GET /academies/:id/students` incluye
  `score`/`segment` por ítem; la UI muestra badge de score+segmento.
- **Ficha alumno `/academia/alumnos/[personId]`**: muestra el breakdown
  de componentes además del número.
- **Admin plataforma**: `GET /admin/users/:personId` (o su detail existente)
  incluye scores por actor con breakdown; nueva vista `/admin/academias`
  con salud de alumnos por academia (distribución de segmentos, score
  medio, top-3 y en-riesgo).
- **CRM contact ficha**: muestra el breakdown cuando existe.

## Capabilities

### New Capabilities

- `crm/relationship-score`: fórmula, señales, segmentos, breakdown
  persistido y recompute (endpoint + job diario) del score de relación
  actor→person.

### Modified Capabilities

- `academies/console-lists`: `GET /academies/:id/students` agrega
  `score`/`segment` por ítem.
- `academies/owner-insights`: el módulo `/academia/alumnos` muestra badge
  de score+segmento por fila y la ficha muestra el desglose.
- `crm/contact-console`: la ficha del contacto muestra el breakdown del
  score cuando existe.
- `admin`: la ficha de usuario expone sus scores por actor y existe una
  vista agregada de salud por academia.

## Impact

- **API**: `crm/domain/crm.service.ts` (computeActivity ACADEMY + fórmula
  + breakdown), `academies/infrastructure/academies.controller.ts`
  (students list + ficha), admin (user-intel controller + nuevo endpoint
  de salud por academia), nuevo scheduler `crm` (job `crm.scores`),
  `prisma/schema.prisma` (columna `breakdown`).
- **Web**: `/academia/alumnos` (badge en lista), `/academia/alumnos/[id]`
  (desglose), `/admin/usuarios/[personId]` (sección scores), nueva página
  `/admin/academias`.
- **Datos**: migración `RelationshipScore.breakdown Json?` (nullable, no
  destructiva); params nuevos `crm.academy_score.*` con defaults (seed
  baseline idempotente).
- **Docs**: `omni-dance.md` §11/§14 (fórmula), `architecture.md`,
  `flows.md` si aplica, openapi/postman regenerados.
- **Privacidad**: sin cambios; el alumno nunca ve el número ni el
  desglose; scores privados por actor.
