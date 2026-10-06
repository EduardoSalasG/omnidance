# Staff offline check-in (puerta sin señal)

## Problema

Los locales de la escena tienen mala o nula señal en pista. Hoy la
pantalla de staff (`/staff/[eventId]`) solo muestra un banner "Sin
conexión" y **cada escaneo offline es una pantalla roja de error** —
la puerta se detiene. Además la PWA no cachea el app shell: un reload
dentro del local mata la pantalla por completo.

El modelo ya fue pensado para esto (`Checkin.syncedAt` existe con
comentario "cuándo llegó al server (offline-first)") pero el contrato
no acepta la hora real de puerta ni hay cola del lado del staff.

## Restricción criptográfica (decisión aprobada)

El QR personal es **JWT HS256** firmado con `QR_SECRET` del servidor —
no verificable offline sin exportar la key (un staff que la extraiga
podría mintear QRs de cualquier persona para siempre). Este slice
implementa **cola + confirmación**: el dispositivo decodifica el JWT
localmente (payload legible), valida la persona contra un roster
cacheado del evento, registra el ingreso en pantalla al instante y
encola; el servidor **verifica la firma y confirma** al sincronizar.
La verificación criptográfica offline real (EdDSA) queda como change
posterior.

## Propuesta

- **`GET /events/:id/door-manifest`** (`checkins.write`): snapshot de
  puerta en una sola llamada — evento (`seriesId`, `status`, door
  info), tickets `ACTIVE` con persona resuelta, entry passes `ACTIVE`,
  series passes del mes vigente de la serie, check-ins abiertos, y
  `generatedAt` (watermark). Pensado para guardar en IndexedDB.
- **`POST /checkins/sync`** (`checkins.write`): batch
  `[{clientRef, qrToken, eventId, scannedAt}]` — por ítem verifica el
  JWT como hoy, llama al mismo `register()` con `inAt=scannedAt` +
  `method:"OFFLINE"` + `syncedAt=now`, y responde por ítem
  `{clientRef, result: synced|duplicate|invalid_token|error}`.
  `Checkin.clientRef` (nuevo, `String? @unique`) da idempotencia
  exacta de retry.
- **`register()`** acepta `inAt?` y `clientRef?` opcionales
  (`CreateCheckinData`); `CheckinMethod` gana `"OFFLINE"` (es union TS,
  `method` ya es String libre). La dedup por check-in abierto sigue
  siendo la red de seguridad (409 → resultado `duplicate` por ítem).
- **Front `/staff/[eventId]`**: `lib/door-db.ts` (IndexedDB sin deps
  nuevas: stores `manifest`, `queue`). Preload del manifest al entrar +
  refresh con el poll existente; escaneo offline decodifica el JWT,
  busca la persona en el manifest (ticket/pase/serie → mismo tono
  verde/ámbar) y registra en pantalla con sello "offline", encola;
  flush al evento `online` + tras cada POST exitoso + cada ~30s;
  conflictos (`duplicate`) e `invalid_token` quedan visibles en la fila
  para decisión del staff (dejar o anular via `/void` existente).
  Check-in manual offline: búsqueda por nombre sobre el manifest.
  Wake lock para que la pantalla no se apague en la fila.
- **`sw.js`**: runtime cache acotado — cache-first `/_next/static/**`,
  network-first con fallback cache para documentos `/staff/**` — para
  que la pantalla sobreviva un reload sin señal. El handler de push no
  cambia.

## Out of scope

- EdDSA para verificación criptográfica offline real (change posterior
  — toca el path crítico de puerta y requiere rotación de claves).
- Door-sale offline (crea `Person`+`Ticket` server-side).
- Check-out (`/out`) offline — puede encolarse en el mismo patrón en
  una iteración siguiente.
- `@@unique` parcial sobre `(eventId,personId)` abierto — la dedup
  aplicativa por check-in abierto + `clientRef` cubren el slice;
  queda como hardening opcional.
- Grace del QR del asistente sin señal (su token expira ~30s tras el
  último mint; el staff resuelve "QR vencido" como ámbar + manual por
  nombre, igual que hoy decide el "sin pase").
