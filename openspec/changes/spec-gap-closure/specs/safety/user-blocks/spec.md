# user-blocks

## Purpose

Cualquier bailarín puede bloquear a otra persona para que no pueda volver a invitarlo a bailar ni escanearlo — mecanismo de safety especialmente crítico para followers que reciben invitaciones no deseadas (spec §4).

## ADDED Requirements

### Requirement: Bloquear a una persona

El sistema SHALL permitir a una persona autenticada bloquear a otra persona registrada. El bloqueo es unidireccional (A bloquea a B) y silencioso: B no es notificado ni puede descubrir que fue bloqueado.

#### Scenario: bloqueo exitoso

- **WHEN** una persona autenticada envía `POST /blocks` con `personId` de otra persona existente
- **THEN** el sistema crea el registro de bloqueo y responde 201

#### Scenario: auto-bloqueo rechazado

- **WHEN** una persona intenta bloquearse a sí misma
- **THEN** el sistema responde 400 y no crea el bloqueo

#### Scenario: bloqueo idempotente

- **WHEN** la persona ya tiene bloqueada a la misma persona
- **THEN** el sistema responde 200 sin duplicar el registro

### Requirement: Desbloquear y listar bloqueos

El sistema SHALL permitir eliminar un bloqueo propio y listar los bloqueos activos del usuario autenticado.

#### Scenario: desbloquear

- **WHEN** una persona envía `DELETE /blocks/:personId` sobre un bloqueo propio existente
- **THEN** el bloqueo se elimina y la otra persona vuelve a poder invitarla

#### Scenario: listar

- **WHEN** una persona envía `GET /blocks`
- **THEN** recibe la lista de personas que tiene bloqueadas (sin exponer bloqueos de terceros)

### Requirement: Enforcement en invitaciones de sesión

Si el invitee tiene bloqueado al inviter, el sistema SHALL rechazar la creación de la invitación de forma silenciosa — sin revelar la existencia del bloqueo.

#### Scenario: invitación bloqueada

- **WHEN** A intenta invitar a B y B tiene bloqueado a A
- **THEN** la API responde con un error genérico de "no se puede enviar la invitación" (no "te bloqueó") y no se crea la sesión ni se notifica a B

#### Scenario: dirección correcta del bloqueo

- **WHEN** A tiene bloqueado a B pero B no tiene bloqueado a A
- **THEN** B puede invitar a A normalmente (el bloqueo solo impide invitar a quien bloqueó)
