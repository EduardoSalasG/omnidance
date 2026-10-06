# Delta: mail-campaigns (mail-campaign-context-audiences)

## ADDED Requirements

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

`days` MUST ser un entero ≥ 1 (default 7) y la audiencia se re-ancla
en cada corrida como el resto.

#### Scenario: recordatorio de vencimiento de inscripción

- **WHEN** una campaña CRON diaria con audiencia
  `ENROLLMENTS_EXPIRING {days:5}` corre
- **THEN** solo recibe el mail quien tiene una inscripción por vencer
  dentro de 5 días, con `{{academy}}`, `{{plan}}` y `{{endsAt}}` de su
  propia inscripción

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
