# Handoff 2026-10-17c — slice `staff-offline-checkin`

## Completado (commit `1299282` en `dev`, pusheado)

Puerta sin señal: la app de staff sigue registrando gente offline y
sincroniza al volver la conectividad. La credencial sigue siendo **el
mismo QR personal rotativo** — cero fricción extra, ningún QR por
entrada (decisión de producto confirmada con el usuario).

### Backend

- `GET /events/:id/door-manifest` (`checkins.write`): evento + tickets
  ACTIVE + entry passes + series passes del mes + check-ins abiertos,
  con persona resuelta (nombre/foto) + `generatedAt`.
- `POST /checkins/sync` (`checkins.write`): batch 1–500 ítems
  `{clientRef, qrToken?, personId?, eventId, scannedAt}`. Por ítem:
  `qrToken` → verify JWT (HMAC solo en server) o `personId` directo
  (manual por nombre — mismo permiso que `/checkins/manual`) →
  `syncCheckin` → `register(inAt=scannedAt, method:"OFFLINE",
  clientRef)` (mismo camino = mismos side effects: ticket→USED, mesa,
  gamificación, notificación). Resultado por ítem:
  `synced|duplicate|invalid_token|error`. `clientRef` repetido →
  `duplicate` sin insertar (retry exacto del dispositivo).
- Schema: `Checkin.clientRef String? @unique` — migración
  `20261018010000_checkin_client_ref`. `CheckinMethod` gana `"OFFLINE"`.

### Frontend (`/staff/[eventId]`)

- `lib/door-db.ts`: IndexedDB `omnidance-door` — store `manifest`
  (key=eventId) + `queue` (keyPath=clientRef, índice eventId;
  status pending|conflict|failed).
- Manifiesto: preload al entrar, refresh con el poll (~15s), fallback
  al cache IndexedDB; banner muestra antigüedad (`padrón de las HH:MM`).
- Escaneo offline: decodifica el JWT localmente **sin verificar** (solo
  lectura de `sub`/`exp` para mostrar nombre — la firma es honestidad
  del server al sync). `exp` vencido → ámbar "QR vencido — búscalo por
  nombre". Dedup local (cola + check-ins abiertos). Sello "offline" en
  el overlay verde/ámbar.
- Cola: `crypto.randomUUID()` clientRef; flush al evento `online`,
  cada ~30s y post-mount; `synced` sale, `duplicate`→conflicto y
  `invalid_token|error`→failed visibles (badge ámbar en la lista;
  decisión humana, nunca silencio).
- Manual por nombre: búsqueda sobre el manifiesto (≤8 candidatos,
  dedup por personId); online → POST /checkins/manual, offline →
  enqueue con personId. Fallback personId crudo si nunca cargó manifest.
- Wake lock (`navigator.wakeLock`, best-effort).
- `sw.js`: cache-first `/_next/static/*`, network-first navegaciones
  `/staff/*` con fallback a cache; push + notificationclick intactos.

### Decisión clave (de la consulta del usuario)

- Orden manual = `Payment PENDING`, **sin Ticket** hasta approve (ya
  era así). En `/entradas` el pendiente aún no se muestra — gap
  anotado para el slice `wallet-passes`.
- QR offline NO es verificable criptográficamente (HS256 = secreto
  simétrico, no distribuible). El diseño asume cola "decodificada
  local + verificada al sync". Migración a EdDSA quedó **fuera de
  scope** (documentado en flows.md).

## Verificación

| Check | Resultado |
|---|---|
| API tsc | limpio |
| API vitest | **1644/1644, 77 archivos** |
| Web tsc + build | limpio, 68/68 páginas |
| i18n audit | `ALL_KEYS_OK` |
| impeccable detect | 1 warning preexistente (`<img>` remoto en Avatar — decisión documentada) |
| openspec validate | 14/14 |
| API docs | 230 paths regenerados |

## Pendiente / gaps

- QA real offline en dispositivo (DevTools offline + IndexedDB) —
  no verificado en browser, solo build + lógica.
- Próximo slice: `fintoc-gateway-adapter` (brief listo: adaptador
  fetch-confirm tipo MP, provider String sin migración, webhook con
  firma — extender ctx del puerto), luego `admin-billing-documents`,
  luego `wallet-passes` (incluye el gap "pendiente de validación" en
  `/entradas`).
