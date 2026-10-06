# Delta: mail-campaigns (platform-polish-gaps)

## ADDED Requirements

### Requirement: opt-out de campañas por destinatario

Toda campaña SHALL agregar al HTML un footer con enlace de baja
`GET /api/mail/unsubscribe?p=<personId>&t=<firma>` donde la firma es
HMAC-SHA256 del personId con `JWT_SECRET`. El endpoint MUST ser público
(sin sesión), validar la firma (rechazar firmas inválidas con 400) y
marcar `Person.mailOptOutAt`. La resolución de audiencias y el loop de
envío MUST excluir personas con `mailOptOutAt` no nulo. El opt-out solo
afecta correos de campañas — los correos transaccionales (magic link,
recibos) NO se ven afectados.

#### Scenario: baja con firma válida

- **WHEN** una persona sigue el link de unsubscribe de su correo
- **THEN** `mailOptOutAt` queda marcado y ninguna resolución de
  audiencia posterior la incluye

#### Scenario: firma inválida

- **WHEN** se llama `/api/mail/unsubscribe` con firma adulterada
- **THEN** responde 400 y no modifica nada

#### Scenario: transaccional no afectado

- **WHEN** una persona con opt-out pide magic link o le llega un
  correo transaccional
- **THEN** el envío procede normalmente (el filtro solo vive en el
  pipeline de campañas)

### Requirement: recipient por contexto en audiencias de ciclo

Una corrida SHALL crear un `MailCampaignRecipient` por cada entrada
resuelta distinguida por `dedupKey` — `@@unique(runId, personId,
dedupKey)` con dedupKey vacío por omisión. En audiencias con contexto
una persona con N ciclos activos recibe N recipients (cada uno con su
propio ctx); en audiencias genéricas el comportamiento se conserva
(una fila por persona).

#### Scenario: dos planes por vencer, dos avisos

- **WHEN** un alumno tiene dos inscripciones por vencer y corre una
  campaña ENROLLMENTS_EXPIRING
- **THEN** recibe dos correos, cada uno con `{{plan}}`/`{{endsAt}}` de
  su propia inscripción

#### Scenario: audiencia genérica sin duplicar

- **WHEN** corre una campaña con audiencia ALL y la persona aparece
  una sola vez
- **THEN** existe exactamente un recipient por persona en el run

### Requirement: audiencia CLAIMS_PENDING para owners de academia

La campaña SHALL admitir `CLAIMS_PENDING {days}` (días enteros 1-365):
resuelve los owners de academias que tienen `PaymentClaim` PENDING con
`createdAt < now - days`, con vars `{{academy}}` y `{{count}}`. El
dedupKey es `claims:<academyId>:<fecha es-CL>` — máximo un recordatorio
por academia por día mientras sigan existiendo comprobantes sin
validar.

#### Scenario: owner con comprobante viejo recibe recordatorio

- **WHEN** una academia tiene un claim PENDING de hace más de `days`
  días y corre la campaña
- **THEN** su owner recibe el mail con `{{academy}}` y `{{count}}`

#### Scenario: máximo uno por día por academia

- **WHEN** la campaña CLAIMS_PENDING corre dos veces el mismo día
  sobre la misma academia con pendientes
- **THEN** la segunda corrida marca el recipient SKIPPED por dedup

### Requirement: selector de eventos con búsqueda

El formulario de campañas SHALL permitir elegir como audiencia
cualquier evento buscable por nombre (endpoint browse con `q`),
listando status y fecha en cada opción — no solo los PUBLISHED
recientes.

#### Scenario: evento pasado seleccionable

- **WHEN** el admin busca un evento FINISHED por nombre en el
  selector de audiencia EVENT
- **THEN** aparece en los resultados y puede elegirse (audiencia =
  asistentes con ticket ACTIVE)

## MODIFIED Requirements

### Requirement: audiencias con contexto por ciclo de vida

La campaña SHALL admitir audiencias parametrizadas que resuelven
destinatarios según el ciclo de vida del pago, cada uno con su propio
conjunto de variables:

- `ENROLLMENTS_EXPIRING {days}`: inscripciones ACTIVE/ONLINE con
  `endsAt ∈ [now, now+days)` → `{{academy}}`, `{{plan}}`, `{{endsAt}}`.
- `ENROLLMENTS_EXPIRED {days}`: inscripciones ACTIVE/ONLINE con
  `endsAt ∈ [now-days, now)` (gracia) → mismas variables.
- `PLATFORM_SUB_EXPIRING {days}`: suscripciones de plataforma con
  `nextInvoiceAt ∈ [now, now+days)` → `{{plan}}` (tier),
  `{{nextInvoiceAt}}`.
- `CLAIMS_PENDING {days}`: owners con claims PENDING > `days` →
  `{{academy}}`, `{{count}}`.

Cada destinatario de ciclo lleva `dedupKey` — una corrida posterior
lo marca SKIPPED si el ciclo ya fue recordado en `MailCampaignSent`.
Toda persona con `mailOptOutAt` queda excluida de la resolución.

#### Scenario: opt-out excluido del ciclo

- **WHEN** un alumno con `mailOptOutAt` tiene una inscripción por
  vencer y corre una campaña ENROLLMENTS_EXPIRING
- **THEN** no aparece como destinatario de la corrida
