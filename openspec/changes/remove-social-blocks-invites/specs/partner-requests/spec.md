# partner-requests — deltas

## ADDED Requirements

### Requirement: Registro de baile por escaneo QR

El alta de `DanceSession` en pista SHALL ser `POST /sessions/scan`
`{qrToken, eventId}`: el QR rotativo de la pareja acredita presencia
mutua, así que la sesión nace `CONFIRMED` (`confirmedAt = scannedAt`)
sin handshake posterior. La persona escaneada recibe notificación
`session.confirmed`; ambos participantes evalúan badges y acreditan
puntos `session_confirmed` en el mismo hook que tenía el confirm.

#### Scenario: escaneo válido en pista

- **WHEN** una persona autenticada postea `/api/sessions/scan` con el
  `qrToken` vigente de su pareja y un `eventId` existente
- **THEN** crea la `DanceSession` CONFIRMED y responde 201; la pareja es
  notificada.

#### Scenario: validaciones del escaneo

- **WHEN** el `qrToken` es inválido/expirado (400), la pareja es uno
  mismo (400), el evento no existe (404) o el par ya registró una sesión
  dentro del cooldown (409)
- **THEN** la API rechaza sin crear la sesión.

## REMOVED Requirements

### Requirement: Solicitudes e invitaciones a bailar por endpoint

**Reason**: decisión de producto — los bailes solo se registran por
escaneo QR en pista. Los endpoints `POST/GET /api/partner-requests`,
`POST /partner-requests/:id/close` y `POST/GET /api/availability` se
eliminan junto a los modelos `PracticePartnerRequest` y
`AvailabilityToggle`. Nunca tuvieron UI.

#### Scenario: endpoints eliminados

- **WHEN** cualquier ruta bajo `/api/partner-requests` o
  `/api/availability` se invoca
- **THEN** responde 404 y las tablas ya no existen.

### Requirement: Invitaciones de sesión (`sessions.invite`)

**Reason**: mismo retiro — `POST /sessions/invite`,
`POST /sessions/:id/confirm` y `POST /sessions/:id/decline` desaparecen.
Las `DanceSession` históricas INVITED se conservan como dato.

#### Scenario: ciclo de invitación eliminado

- **WHEN** se invoca cualquier ruta del ciclo invite/confirm/decline
- **THEN** responde 404; `GET /sessions/mine` y `rate` siguen
  funcionando.
