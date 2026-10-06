# Delta: tickets (wallet-passes)

## ADDED Requirements

### Requirement: notificación day-of por entrada activa

El sistema SHALL notificar (`ticket.day_of`, categoría SOCIAL) a cada
dueño de ticket ACTIVE de un evento PUBLISHED/LIVE que empieza el día
en curso según America/Santiago, una sola vez por persona/evento/día.

#### Scenario: evento de hoy con tickets activos

- **WHEN** corre el barrido day-of y un evento PUBLISHED inicia hoy
- **THEN** cada dueño de ticket ACTIVE recibe la notificación con
  `data.eventId`; un segundo barrido el mismo día no duplica (dedup por
  notification existente del tipo+evento en el día)

#### Scenario: ticket de evento cancelado o de otro día

- **WHEN** el evento está CANCELLED o inicia otro día
- **THEN** no se emite notificación

### Requirement: órdenes pendientes visibles en la vista de entradas

La vista "Mis entradas" SHALL mostrar las órdenes PENDING de tipo
TICKET/SERIES_PASS como "pago en validación", visualmente distintas de
un ticket válido y sin acceso al QR - el QR solo existe cuando hay
ticket ACTIVE.

#### Scenario: orden manual en revisión

- **WHEN** la persona abre sus entradas con una orden MANUAL PENDING
- **THEN** ve la card ámbar "pago en validación" con el nombre del
  evento/serie, sin link a /qr ni sello de entrada válida

### Requirement: pase Google Wallet como lanzador del QR personal

El sistema SHALL exponer `GET /wallet/google` que devuelve un saveUrl
de Google Wallet (GenericPass firmado JWT RS256 por la service account)
cuyo único contenido accionable es el link a `/qr` - sin barcode propio.
Sin credenciales configuradas responde 503 `wallet.not_configured`.

#### Scenario: credenciales configuradas

- **WHEN** el autenticado consulta /wallet/google
- **THEN** recibe saveUrl válido cuyo pase incluye su nombre y el link a
  /qr como destino

#### Scenario: sin credenciales

- **WHEN** faltan GOOGLE_WALLET_ISSUER_ID o la service account
- **THEN** responde 503 y el front oculta el botón
