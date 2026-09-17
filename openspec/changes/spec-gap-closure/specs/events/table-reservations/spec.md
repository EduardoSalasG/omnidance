# table-reservations

## Purpose

Reserva de mesa por evento: nombre del solicitante + cantidad de personas, con ciclo solicitada→confirmada/cancelada gestionado por productor o venue — mesa como proxy de consumo, sin competir con el POS del local (spec §8, §13).

## ADDED Requirements

### Requirement: Solicitar reserva

El sistema SHALL permitir a una persona autenticada solicitar una reserva de mesa para un evento publicado, indicando cantidad de personas. El nombre del solicitante se toma de su cuenta.

#### Scenario: solicitud creada

- **WHEN** una persona autenticada envía `POST /events/:id/table-reservations` con `partySize`
- **THEN** se crea la reserva en estado `REQUESTED` asociada a su cuenta y evento

#### Scenario: una reserva activa por persona por evento

- **WHEN** la persona ya tiene una reserva `REQUESTED` o `CONFIRMED` en el mismo evento
- **THEN** el sistema responde 409

#### Scenario: evento no reservable

- **WHEN** el evento no existe o está en estado `DRAFT`/`CANCELLED`
- **THEN** el sistema responde 404 o 409 según corresponda

### Requirement: Gestión por productor/venue

El productor del evento (o admin) SHALL poder listar las reservas y cambiar su estado a `CONFIRMED` o `CANCELLED`. El solicitante SHALL poder cancelar la suya.

#### Scenario: confirmar

- **WHEN** el productor del evento envía `PATCH /table-reservations/:id` con `status: CONFIRMED`
- **THEN** la reserva queda confirmada y el solicitante puede verla

#### Scenario: solo productor/admin gestiona

- **WHEN** un bailarín sin relación con el evento intenta cambiar el estado de una reserva ajena
- **THEN** el sistema responde 403

#### Scenario: cancelación por el solicitante

- **WHEN** el solicitante envía `DELETE /table-reservations/:id` sobre su propia reserva
- **THEN** la reserva pasa a `CANCELLED` y libera el cupo

### Requirement: Visibilidad para amigos

Los asistentes al evento SHALL poder ver qué reservas confirmadas existen (nombre + cantidad), para organizar el punto de encuentro — sin exponer datos sensibles.

#### Scenario: listado del evento

- **WHEN** un asistente consulta `GET /events/:id/table-reservations`
- **THEN** recibe las reservas `CONFIRMED` con nombre del solicitante y cantidad de personas
