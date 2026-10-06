# mail-campaigns Specification

## Purpose
TBD - created by archiving change admin-jobs-mail-campaigns. Update Purpose after archive.

## Requirements

### Requirement: campañas de mail programadas por el admin

El admin SHALL poder crear campañas de mail con nombre, asunto y
cuerpo HTML, dirigidas a una audiencia (todos los usuarios con email |
un roleKey APPROVED | dueños de tickets ACTIVE de un evento) y con
programación única (`runAt`) o recurrente (`cronExpr` + `timezone`).
La campaña nace DRAFT o SCHEDULED; una campaña SCHEDULED con
`nextRunAt` vencido es despachada por el job del sistema
`mail.campaign_dispatch` (visible y pausable en la consola de jobs).

#### Scenario: programar envío único

- **WHEN** se crea una campaña ONCE con `runAt` futuro y status
  SCHEDULED
- **THEN** al llegar `runAt` el dispatcher la envía y queda DONE

#### Scenario: campaña recurrente

- **WHEN** se crea una campaña CRON con `cronExpr` válido
- **THEN** corre en cada ocurrencia del horario y `nextRunAt` se
  recalcula tras cada corrida; una expr inválida responde 400

### Requirement: corrida por lotes con dedup y reanudación

Cada corrida SHALL crear un `MailCampaignRun` con un
`MailCampaignRecipient` por persona de la audiencia resuelta en ese
momento (dedup `@@unique(runId, personId)`), enviando secuencialmente
(~150ms entre envíos) y marcando cada recipient PENDING→SENT|FAILED
con contadores agregados en el run y la campaña.

#### Scenario: audiencia re-anclada por corrida

- **WHEN** una campaña recurrente corre por segunda vez y la
  audiencia cambió (nuevos usuarios/tickets)
- **THEN** el nuevo run refleja la audiencia actual, no un snapshot

#### Scenario: cancelación mid-send

- **WHEN** la campaña pasa a CANCELLED mientras un run envía
- **THEN** el envío se detiene entre destinatarios, los PENDING
  restantes quedan SKIPPED y el run cierra CANCELLED

#### Scenario: fallo parcial no aborta el envío

- **WHEN** el mailer falla para un destinatario
- **THEN** ese recipient queda FAILED con su error y el envío
  continúa con el siguiente

### Requirement: edición, prueba y control de la campaña

El admin MUST poder editar campañas DRAFT o SCHEDULED (una campaña
SENDING/DONE/FAILED/CANCELLED es inmutable salvo cancelación), enviar
una copia de prueba a su propio email, disparar una corrida manual,
cancelar, y ver los runs con contadores. Todo bajo `admin.access` y
auditado.

#### Scenario: test-send al admin

- **WHEN** `POST /admin/mail-campaigns/:id/test`
- **THEN** se envía el subject+htmlBody al email del admin autenticado
  sin crear run ni recipients

#### Scenario: editar una campaña en envío

- **WHEN** `PATCH` sobre una campaña SENDING
- **THEN** responde 409 - primero debe cancelarse

#### Scenario: preview de audiencia

- **WHEN** `GET /admin/mail-campaigns/audience-count?kind=EVENT&eventId=…`
- **THEN** devuelve el número de destinatarios actuales para esa
  audiencia sin crear nada

### Requirement: variables de plantilla por destinatario

El asunto y el cuerpo HTML de una campaña SHALL admitir marcadores
`{{variable}}` que se interpolan por destinatario al enviar. Toda
audiencia aporta `{{name}}` y `{{email}}`; las audiencias con contexto
aportan variables adicionales según su tipo. Guardar una campaña cuyo
texto use variables que la audiencia no aporta MUST responder 400
nombrando las variables no soportadas.

#### Scenario: interpolación al enviar

- **WHEN** una campaña con `subject` "Tu plan {{plan}} vence" corre
  sobre una audiencia ENROLLMENTS_EXPIRING
- **THEN** cada destinatario recibe el asunto con el nombre de SU plan

#### Scenario: variable no soportada

- **WHEN** se guarda una campaña con audiencia ALL cuyo cuerpo usa
  `{{academy}}`
- **THEN** responde 400 indicando que `academy` no está disponible
  para esa audiencia

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

#### Scenario: recordatorio de vencimiento de inscripción

- **WHEN** una campaña CRON diaria con audiencia
  `ENROLLMENTS_EXPIRING {days:5}` corre
- **THEN** solo recibe el mail quien tiene una inscripción por vencer
  dentro de 5 días, con `{{academy}}`, `{{plan}}` y `{{endsAt}}` de su
  propia inscripción

#### Scenario: opt-out excluido del ciclo

- **WHEN** un alumno con `mailOptOutAt` tiene una inscripción por
  vencer y corre una campaña ENROLLMENTS_EXPIRING
- **THEN** no aparece como destinatario de la corrida

### Requirement: dedup por ciclo entre corridas

Una audiencia con contexto SHALL asignar a cada destinatario un
`dedupKey` que identifica el ciclo recordado (`enr:<enrollmentId>:
<endsAt>`, `psub:<subId>:<nextInvoiceAt>`). Al enviar, un destinatario
cuyo `dedupKey` ya figura en `MailCampaignSent` de esa campaña queda
SKIPPED; solo un envío SENT registra la marca. Las audiencias
genéricas (ALL/ROLE/EVENT) no tienen dedupKey: cada corrida envía a
toda la audiencia.

#### Scenario: cron diario no spamea

- **WHEN** una campaña diaria ENROLLMENTS_EXPIRING corre y el alumno
  ya recibió el recordatorio de su `endsAt` actual
- **THEN** queda SKIPPED en corridas siguientes; si renueva (endsAt
  nuevo) vuelve a entrar al recordatorio del nuevo ciclo

#### Scenario: fallo de envío no quema la dedup

- **WHEN** el mailer falla para un destinatario con dedupKey
- **THEN** el recipient queda FAILED, NO se registra MailCampaignSent,
  y el próximo run lo reintenta

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
