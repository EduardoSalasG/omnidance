# Delta: mail-campaigns (admin-jobs-mail-campaigns)

## ADDED Requirements

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
