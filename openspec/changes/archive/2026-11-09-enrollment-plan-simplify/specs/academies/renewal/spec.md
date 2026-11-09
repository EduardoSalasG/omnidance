# Delta: renewal

## MODIFIED Requirements

### Requirement: Recordatorio de plan por vencer

El sistema SHALL enviar un email al alumno cuando su inscripción
ACTIVE con plan por tiempo (MONTHLY, QUARTERLY, SEMIANNUAL o PERIOD)
tenga `endsAt` dentro de `academy.renewal.first_notice_days` días
(default 5), una vez por ciclo de vigencia. El email incluye el nombre
de la academia, el plan, la fecha de vencimiento y un CTA a la ficha de
la academia.

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

- **WHEN** el enrollment es INACTIVE, tiene `endsAt` null o su plan no
  es por tiempo (CLASS_PACK, SINGLE)
- **THEN** no se envía ningún recordatorio (un pack no "renueva")
