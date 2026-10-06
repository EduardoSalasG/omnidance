# checkins/offline Specification

## Purpose
TBD - created by archiving change staff-offline-checkin. Update Purpose after archive.

## Requirements

### Requirement: Manifiesto de puerta por evento

El sistema MUST exponer `GET /api/events/:id/door-manifest` a staff con
permiso `checkins.write` (o admin/productor del evento, igual que el
listado de check-ins), devolviendo en una sola respuesta el estado
necesario para validar ingresos sin red.

#### Scenario: Contenido del manifiesto

- **WHEN** staff autorizado consulta `GET /events/:id/door-manifest`
- **THEN** recibe `{event:{id,seriesId,status,...}, tickets:[{personId,name,photoUrl}], entryPasses:[{personId,type}], seriesPasses:[{personId}], checkins:[{personId,inAt}], generatedAt}` — solo pases ACTIVE y check-ins abiertos (sin `outAt`), personas resueltas

#### Scenario: Autorización

- **WHEN** una persona sin `checkins.write`, sin asignación de staff del
  evento y sin ser productor/admin consulta el endpoint
- **THEN** 403

### Requirement: Sincronización de check-ins encolados

El sistema MUST exponer `POST /api/checkins/sync` (`checkins.write`)
que procese un batch de escaneos hechos sin red, preservando la hora
real de puerta y la idempotencia exacta por `clientRef`.

#### Scenario: Item válido

- **WHEN** el batch incluye `{clientRef, qrToken, eventId, scannedAt}`
  con un JWT de QR válido del asistente
- **THEN** el server verifica la firma, ejecuta el mismo `register()`
  del flujo online (resuelve pase, marca USED, dedup por abierto),
  persiste `inAt=scannedAt`, `method:"OFFLINE"`, `syncedAt=ahora`,
  `clientRef`, y responde `{clientRef, result:"synced", checkin}`

#### Scenario: Resultado por ítem, nunca 500 de lote

- **WHEN** un ítem tiene JWT inválido/expirado o el registro falla
- **THEN** ese ítem responde `{clientRef, result:"invalid_token"|"error", detail?}` y el resto del batch se procesa igual (el lote completo responde 200 con resultados por ítem; solo falla el request entero si el evento no existe o el caller no tiene permiso)

#### Scenario: Idempotencia de retry

- **WHEN** el mismo `clientRef` se re-sincroniza (retry del cliente o
  duplicado de red)
- **THEN** la segunda entrega responde `{clientRef, result:"duplicate"}`
  sin crear un segundo check-in

#### Scenario: Conflicto por doble ingreso

- **WHEN** dos dispositivos offline registran a la misma persona en el
  mismo evento y ambos sincronizan
- **THEN** el segundo ítem responde `{clientRef, result:"duplicate"}`
  (la dedup por check-in abierto lo resuelve por timestamp); ambos
  quedan auditables — la resolución humana usa el `POST /checkins/:id/void`
  existente

### Requirement: Registro local del staff sin señal

La pantalla de staff MUST admitir personas sin conexión: al escanear
offline, decodifica el payload del JWT (persona legible sin firma),
valida contra el manifiesto cacheado y registra el ingreso en pantalla
de inmediato encolándolo para sincronización.

#### Scenario: Escaneo offline con pase en manifiesto

- **WHEN** el staff escanea un QR cuyo personId tiene ticket/entry pass/
  series pass en el manifiesto cacheado y no tiene check-in local ni
  remoto
- **THEN** la pantalla muestra el resultado equivalente al online
  (tono verde/ámbar según tipo de pase) con indicación "offline",
  encola `{clientRef, qrToken, scannedAt}` y lo muestra en la lista
  local como pendiente de sincronizar

#### Scenario: Persona no encontrada en manifiesto

- **WHEN** el personId decodificado no está en el manifiesto (pase
  emitido tras el preload o persona sin pase)
- **THEN** el resultado es ámbar-revisar (nunca rojo-duro — el
  manifiesto puede estar stale) y el escaneo se encola igual

#### Scenario: Duplicado local

- **WHEN** el mismo personId ya tiene check-in local pendiente o
  sincronizado del mismo evento
- **THEN** la pantalla muestra "ya registrado" sin encolar de nuevo

#### Scenario: Flush al volver señal

- **WHEN** el dispositivo recupera conexión (evento `online`, poll
  exitoso o intervalo ~30s)
- **THEN** envía los pendientes en batch a `/checkins/sync`;
  `synced` desaparece de la cola y entra a la lista confirmada,
  `duplicate` queda marcado conflicto para decisión del staff, y
  `invalid_token`/`error` quedan marcados como fallidos persistentes

### Requirement: App shell usable sin señal

La pantalla de staff MUST sobrevivir un reload sin conexión una vez
visitada online.

#### Scenario: Reload offline

- **WHEN** el staff recarga `/staff/[eventId]` sin conexión tras
  haberla visitado online
- **THEN** el service worker sirve el documento y los assets cacheados
  y la pantalla opera contra el manifiesto/cola persistidos en
  IndexedDB
