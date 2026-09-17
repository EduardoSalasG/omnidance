# friendships

## Purpose

Amistades entre bailarines: solicitud, aceptación y lista — habilita "qué amigos van", historial de sesiones por amigo y la futura competencia social segura (spec §8).

## ADDED Requirements

### Requirement: Solicitar amistad

El sistema SHALL permitir a una persona autenticada enviar una solicitud de amistad a otra persona. La solicitud queda pendiente hasta que la contraparte la acepta o rechaza.

#### Scenario: solicitud enviada

- **WHEN** una persona autenticada envía `POST /friends` con `personId` de otra persona
- **THEN** se crea la solicitud en estado pendiente y se notifica a la contraparte

#### Scenario: solicitud duplicada

- **WHEN** ya existe una solicitud pendiente o una amistad entre el mismo par (en cualquier dirección)
- **THEN** el sistema responde 409 sin duplicar

#### Scenario: auto-solicitud rechazada

- **WHEN** una persona intenta agregarse a sí misma
- **THEN** el sistema responde 400

### Requirement: Aceptar o rechazar

La contraparte SHALL poder aceptar o rechazar la solicitud. Al aceptar, la amistad es bidireccional para ambos.

#### Scenario: aceptar

- **WHEN** el destinatario envía `POST /friends/:id/accept`
- **THEN** la amistad queda activa y ambos la ven en su lista

#### Scenario: solo el destinatario decide

- **WHEN** quien envió la solicitud intenta aceptarla
- **THEN** el sistema responde 403

#### Scenario: rechazar elimina

- **WHEN** el destinatario envía `POST /friends/:id/decline` o `DELETE /friends/:id`
- **THEN** la solicitud se elimina sin exponer el rechazo al solicitante más allá de su desaparición

### Requirement: Lista de amigos

El sistema SHALL exponer la lista de amigos activos del usuario autenticado y las solicitudes pendientes (enviadas y recibidas).

#### Scenario: lista

- **WHEN** una persona envía `GET /friends`
- **THEN** recibe sus amigos activos con datos básicos (id, nombre, foto) — nunca amistades de terceros
