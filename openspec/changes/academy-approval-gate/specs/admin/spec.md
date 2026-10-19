# admin — delta academy-approval-gate

## ADDED Requirements

### Requirement: cola de academias con checklist preprocesado

`GET /admin/academy-review-queue` SHALL devolver academias
PENDING/REJECTED con el checklist ya evaluado por el servidor
(`academyChecks`), el owner y su estado de rol. `/admin/perfiles-por-validar`
SHALL ganar una segunda sección "Academias" que lista esa cola con los
checks como badges — sin trabajo manual: la mayoría se auto-aprueba al
completar datos.

`POST /admin/academy-review-queue/:academyId/approve` SHALL forzar
`reviewStatus = APPROVED` aunque el checklist esté incompleto
(override explícito, auditable). `POST .../reject` SHALL ponerla en
REJECTED (oculta aunque completa).

#### Scenario: admin ve faltantes sin evaluar a mano

- **WHEN** el admin abre `/admin/perfiles-por-validar`
- **THEN** la sección Academias muestra cada PENDING con los checks
  en rojo/verde ya evaluados — no hay que abrir la ficha para saber
  qué falta

#### Scenario: override de aprobación

- **GIVEN** una academia PENDING con checklist incompleto
- **WHEN** el admin aprueba igualmente
- **THEN** queda APPROVED y aparece en público; audit log registra
  ACADEMY_APPROVE con el id

#### Scenario: rechazo oculta aun completa

- **GIVEN** una academia con checklist completo (auto-visible)
- **WHEN** el admin la rechaza
- **THEN** queda REJECTED y desaparece de público hasta re-aprobación
