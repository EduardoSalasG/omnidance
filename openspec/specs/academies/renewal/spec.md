# academies/renewal Specification

## Purpose
TBD - created by archiving change academy-renewal-reminders. Update Purpose after archive.

## Requirements

### Requirement: Recordatorio de plan por vencer

El sistema SHALL enviar un email al alumno cuando su inscripción
ACTIVE u ONLINE tenga `endsAt` dentro de `academy.renewal.first_notice_days`
días (default 5), una vez por ciclo de vigencia. El email incluye el
nombre de la academia, el plan, la fecha de vencimiento y un CTA a la
ficha de la academia.

#### Scenario: Alumno a 5 días del vencimiento

- **WHEN** el cron diario corre y un enrollment ACTIVE tiene `endsAt` en
  4 días y `reminderExpiringFor` no coincide con ese `endsAt`
- **THEN** envía el email "por vencer" al email del alumno, registra
  `reminderExpiringFor = endsAt` y deja una notificación in-app

#### Scenario: Dedup por ciclo

- **WHEN** el cron corre dos días seguidos sobre el mismo enrollment por
  vencer
- **THEN** solo el primer run envía el email (el marcador coincide con
  `endsAt`)

#### Scenario: Renovación rearma el aviso

- **WHEN** el alumno renueva y `endsAt` se extiende a una fecha nueva
- **THEN** el próximo ciclo dentro de la ventana vuelve a recibir aviso
  (el marcador guarda el `endsAt` anterior)

#### Scenario: Excluidos del aviso

- **WHEN** el enrollment es TRIAL, PAUSED, FROZEN o tiene `endsAt` null
- **THEN** no se envía ningún recordatorio

### Requirement: Aviso de gracia tras vencimiento

El sistema SHALL enviar un segundo email cuando `endsAt` ya venció pero
aún está dentro de `academy.renewal.grace_days` días (default 5),
indicando la fecha límite de pago antes de perder la capacidad de
agendar.

#### Scenario: Primer día de gracia

- **WHEN** el cron corre y `endsAt < now <= endsAt + grace_days` con
  `reminderExpiredFor` distinto de `endsAt`
- **THEN** envía el email "en gracia" indicando `endsAt + grace_days`
  como fecha límite, marca `reminderExpiredFor` y deja notificación
  in-app

#### Scenario: Fuera de gracia no se avisa más

- **WHEN** `now > endsAt + grace_days` sin aviso previo enviado
- **THEN** no se envía el email de gracia (la ventana pasó)

### Requirement: Vigencia efectiva en reservas

El sistema SHALL impedir agendar clases cuando la inscripción ya no
cubre la fecha de la clase: la inscripción con `endsAt` vencido solo
habilita reservas para clases con fecha `<= endsAt + grace_days`.

#### Scenario: Vigente agenda libre

- **WHEN** `now <= endsAt` y el alumno agenda una clase del mes siguiente
- **THEN** la reserva procede igual que hoy (sin restricción de fecha)

#### Scenario: En gracia solo clases de la ventana

- **WHEN** `endsAt < now <= endsAt + grace_days`
- **THEN** puede reservar clases con `classDate <= endsAt + grace_days`
  y recibe `no_enrollment`/403 para clases posteriores

#### Scenario: Fuera de gracia no agenda

- **WHEN** `now > endsAt + grace_days`
- **THEN** `resolveQuota` devuelve `no_enrollment` y la reserva falla 403

#### Scenario: endsAt null nunca expira

- **WHEN** el enrollment no tiene `endsAt` (pack, legacy)
- **THEN** la regla de vencimiento no aplica - comportamiento actual

### Requirement: Notificación al owner por pago de plan

El sistema SHALL notificar al `ownerId` de la academia cuando un pago
de plan se liquida (`settleMembership` con `paidNow`), con el nombre
del alumno, el plan y el monto. Cubre compra online y renovación de
suscripción Flow (mismo settle).

#### Scenario: Compra online de plan

- **WHEN** un Payment MEMBERSHIP se marca PAID por primera vez
- **THEN** el alumno recibe `payment.membership` (actual) y el owner
  recibe una notificación con alumno + plan + monto

#### Scenario: Renovación automática de suscripción

- **WHEN** el reconcile liquida una invoice de suscripción (RENEWAL_SETTLED)
- **THEN** el owner recibe la misma notificación de pago recibido
