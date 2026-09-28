## Purpose

Garantiza que ninguna suscripción creada en la pasarela quede cobrando sin
reflejo local: el id remoto se persiste a la primera oportunidad y un barrido
de reconciliación detecta y cancela las suscripciones huérfanas.

## ADDED Requirements

### Requirement: Persistencia temprana del id remoto de suscripción

El sistema SHALL persistir el `flowSubscriptionId` en la fila local de la
suscripción en una escritura propia, inmediatamente después de que la pasarela
confirme la creación de la suscripción remota y antes de cualquier transición
de estado posterior.

#### Scenario: Creación remota exitosa

- **WHEN** la pasarela responde `subscription/create` exitoso para una sub en
  `ACTIVATING`
- **THEN** la fila local registra `flowSubscriptionId` antes de la transición
  `ACTIVATING → ACTIVE|CANCELED`

#### Scenario: La fila cambió de estado entre el create y la persistencia

- **WHEN** la suscripción local ya no está en `ACTIVATING` cuando retorna la
  respuesta de creación remota (cancel concurrente, crash+retry)
- **THEN** el `flowSubscriptionId` se persiste igual sobre la fila para que el
  barrido de huérfanas pueda rastrearla, y la suscripción remota se cancela de
  forma inmediata como compensación

### Requirement: Barrido de suscripciones huérfanas

El sistema SHALL comparar, en cada barrido de reconciliación, las creaciones de
suscripción exitosas registradas en la auditoría de la pasarela contra las
suscripciones locales vivas, y cancelar de forma inmediata en la pasarela toda
suscripción remota activa que no tenga cobertura local viva.

#### Scenario: Crash entre create remoto y persistencia local

- **WHEN** existe en la auditoría un `subscription/create` exitoso cuyo
  `subscriptionId` no está referenciado por ninguna suscripción local
- **AND** la suscripción remota sigue activa en la pasarela
- **THEN** el barrido la cancela de forma inmediata y deja evidencia (log y
  auditoría) sin abortar el resto del barrido

#### Scenario: Activación que quedó pegada

- **WHEN** una suscripción local lleva en `ACTIVATING` más tiempo que el TTL
  del intento y su `flowSubscriptionId` remoto sigue activo
- **THEN** el barrido cancela la suscripción remota de forma inmediata y marca
  la local como `CANCELED`

#### Scenario: Suscripción remota ya cancelada o con cobertura local viva

- **WHEN** el `subscriptionId` auditado pertenece a una suscripción local en
  `ACTIVE`/`CANCEL_PENDING`, o la remota ya está cancelada
- **THEN** el barrido no ejecuta cancelación alguna para esa suscripción
