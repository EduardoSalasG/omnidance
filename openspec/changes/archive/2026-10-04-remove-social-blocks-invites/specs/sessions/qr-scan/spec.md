# sessions/qr-scan — deltas

## ADDED Requirements

### Requirement: Registro de baile por escaneo QR

El alta de `DanceSession` SHALL ser únicamente `POST /sessions/scan`
`{qrToken, eventId}`: el QR rotativo de la pareja acredita presencia
mutua, así que la sesión nace `CONFIRMED` (`confirmedAt = scannedAt`)
sin handshake posterior. La persona escaneada recibe notificación
`session.confirmed`; ambos participantes evalúan badges y acreditan
puntos `session_confirmed`.

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

### Requirement: Rutas de invitación eliminadas

Los endpoints `POST/GET /api/partner-requests`,
`POST /partner-requests/:id/close`, `POST/GET /api/availability`,
`POST /sessions/invite`, `POST /sessions/:id/confirm`,
`POST /sessions/:id/decline` y `POST /sessions/declare` SHALL NOT
existir (404). Las `DanceSession` históricas INVITED/DECLINED se
conservan como dato; `GET /sessions/mine`, `:id/discard` y `:id/rate`
siguen operativos.

#### Scenario: endpoints eliminados

- **WHEN** cualquier ruta del ciclo invite/confirm/decline/declare o de
  partner-requests/availability se invoca
- **THEN** responde 404 y las tablas `UserBlock`,
  `PracticePartnerRequest`, `AvailabilityToggle` ya no existen.
