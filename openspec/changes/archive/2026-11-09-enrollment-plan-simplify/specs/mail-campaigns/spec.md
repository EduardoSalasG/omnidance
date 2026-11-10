# Delta: mail-campaigns

## MODIFIED Requirements

### Requirement: audiencias con contexto por ciclo de vida

La campaña SHALL admitir audiencias parametrizadas que resuelven
destinatarios según el ciclo de vida del pago, cada uno con su propio
conjunto de variables:

- `ENROLLMENTS_EXPIRING {days}`: inscripciones ACTIVE con
  `endsAt ∈ [now, now+days)` → `{{academy}}`, `{{plan}}`, `{{endsAt}}`.
- `ENROLLMENTS_EXPIRED {days}`: inscripciones ACTIVE con
  `endsAt ∈ [now-days, now)` (gracia) → mismas variables.
- `PLATFORM_SUB_EXPIRING {days}`: suscripciones de plataforma con
  `nextInvoiceAt ∈ [now, now+days)` → `{{plan}}` (tier),
  `{{nextInvoiceAt}}`.
- `CLAIMS_PENDING {days}`: owners con claims PENDING > `days` →
  `{{academy}}`, `{{count}}`.

Cada destinatario de ciclo lleva `dedupKey`; una corrida posterior
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
