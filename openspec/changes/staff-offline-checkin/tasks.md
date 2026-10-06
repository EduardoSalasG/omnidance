# Tasks - staff-offline-checkin

- [x] Schema: `Checkin.clientRef String? @unique` (idempotencia de
  sync) + migración versionada. `CreateCheckinData` gana
  `inAt?`/`clientRef?`; `CheckinMethod` gana `"OFFLINE"`.
- [x] `register()` acepta `inAt` (persiste `Checkin.inAt=scannedAt`) y
  `clientRef`; dedup por abierto intacta.
- [x] `GET /events/:id/door-manifest` (`checkins.write`): evento +
  tickets/entry passes/series passes ACTIVE con persona resuelta +
  check-ins abiertos + `generatedAt`.
- [x] `POST /checkins/sync` (`checkins.write`): batch por ítem —
  verifica JWT, `register(inAt, method:"OFFLINE", clientRef)`, resultado
  por ítem `synced|duplicate|invalid_token|error`; `clientRef`
  existente → `duplicate` sin insertar.
- [x] Front `/staff/[eventId]`: `lib/door-db.ts` (IndexedDB
  manifest+queue), preload + refresh con el poll, decode local del
  JWT, registro local con sello offline, cola + flush
  (online/post/30s), conflictos/fallidos visibles, manual por nombre
  sobre manifest, wake lock.
- [x] `sw.js`: runtime cache — cache-first `/_next/static/**`,
  network-first con fallback para `/staff/**`; push intacto.
- [x] Specs: sync endpoint (por ítem, idempotencia clientRef, JWT
  inválido), manifest (contenido + autorización), register con
  inAt/clientRef.
- [x] i18n `staff.*` nuevas keys; docs (`architecture.md`, `flows.md`),
  openapi/postman regen, openspec validate, suite completa, commit
  en `dev`.
