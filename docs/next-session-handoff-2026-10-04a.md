# Handoff — 2026-10-04a: remove-social-blocks-invites

Sesión sobre `dev` implementando el change OpenSpec
`remove-social-blocks-invites`: bloqueo de personas, invitaciones a
bailar (invite/confirm/decline), solicitudes de pareja y toggle de
disponibilidad **eliminados** — los bailes solo se registran por escaneo
QR en pista.

## Decisión de diseño clave (no estaba en los deltas originales)

El delta eliminaba `POST /sessions/invite` — que era el **único** alta de
`DanceSession` por QR — sin reemplazo, mientras el proposal dice "los
bailes solo se registran vía escaneo QR". Se resolvió así:

- **Nuevo `POST /sessions/scan` `{qrToken, eventId}`** → crea la sesión
  directamente `CONFIRMED` (`confirmedAt` = escaneo). El QR rotativo
  TOTP acredita presencia mutua: el escaneo ES la confirmación, no hace
  falta handshake. Notifica `session.confirmed` a la persona escaneada y
  acredita `session_confirmed` + evalúa badges de ambos (mismo hook que
  tenía el confirm eliminado).
- Se añadió el requirement `ADDED` correspondiente al delta
  `specs/partner-requests/spec.md` y la línea al proposal — el change
  queda autoconsistente.
- `declare` queda creando `INVITED` **sin resolución posible** (confirm
  eliminado) — el proposal lo declara "backlog separado, sigue vivo".
  En la web las cards INVITED entrantes ya no muestran botones muertos;
  expiran solas a las 24h (effectiveStatus). ⚠️ Si el producto quiere
  que declare cuente, hace falta un follow-up (p.ej. auto-confirm o un
  mecanismo de validación distinto).

## Completado

- **Migración** `20261008000000_drop_social_blocks_invites`: DROP TABLE
  `AvailabilityToggle`, `PracticePartnerRequest`, `UserBlock`
  (**no aplicada** — la corre `migrate deploy`). Las `DanceSession`
  históricas (incl. INVITED/DECLINED) quedan intactas.
  `prisma migrate diff --from-migrations --to-schema-datamodel --script`
  → vacío.
- **Schema**: 3 modelos eliminados; `seed-dev.ts` sin el seed de
  partner-request. `prisma generate` re-corrido (cliente sin los modelos).
- **API**: borrados `blocks.controller`, `partner-requests.controller`,
  `availability.controller` + desregistro en `social.module`;
  `sessions.controller` sin invite/confirm/decline/`assertNotBlocked`
  (`declare`, `mine`, `rate`, `discard` intactos + nuevo `scan`);
  `people.controller` sin filtrado de bloqueados. 0 referencias
  residuales a userBlock/partnerRequest/availability en `src` y `test`.
- **e2e**: `gap-social` (25✓), `sessions` (22✓ — nuevo bloque scan +
  aserto 404 del ciclo eliminado), `social-endpoints` (9✓), `wiring`
  (7✓ — scan → notif session.confirmed); domain spec 39✓.
- **Web**: `DanceScanner` → `/sessions/scan` (copy "Baile registrado" /
  "Escanea el QR… para registrar el baile"); `SessionCard`/`types.ts`
  sin acciones confirm/decline; `amigos/[id]` usa `profile.datos.danceRole`;
  namespaces `partnerRequests`/`availability` fuera de `es-CL.json`;
  i18n-audit `ALL_KEYS_OK`.
- **Docs**: `openapi.json` + postman regenerados contra API nueva
  (198 paths; diff quirúrgico). `architecture.md`, `flows.md` y
  `omni-dance.md` actualizados (scan→CONFIRMED, features retiradas
  marcadas).

## Verificación (evidencia)

- `pnpm --filter @omnidance/api exec tsc --noEmit` → limpio
- `pnpm --filter @omnidance/web exec tsc --noEmit` → limpio
- `vitest run` 4 specs tocados → **63 passed**; `sessions.service.spec` → 39 passed
- `node apps/web/scripts/i18n-audit.cjs` → `ALL_KEYS_OK`
- `npx openspec validate remove-social-blocks-invites --strict` → valid
- Smoke en API viva (PORT=4100): invite/confirm/decline/blocks/
  partner-requests/availability → **404**; scan/mine/declare → 401 por
  SessionGuard (existen).
- Diff prisma vacío (shadow DB `omnidance_shadow` recreada en docker).

## Pendiente / gaps conocidos

1. **`declare` sin resolución**: crea INVITED que nadie puede confirmar.
   Backlog declarado en el proposal; el invitee ve una card pendiente sin
   acciones hasta que expira.
2. **`SessionsService.transition` aún soporta confirm/decline** en
   dominio (unit spec lo cubre) — inalcanzable vía API; se dejó para el
   follow-up de resolución de declares.
3. **Specs canónicas**: `safety/user-blocks` se remueve al **archivar**
   el change (orquestador: `openspec archive` sin `--skip-specs`).
4. Migración **sin aplicar** por diseño — verificar `migrate deploy` en
   el pipeline.
5. El seed demo siembra `DanceSession` INVITED históricas — quedan
   como pendientes eternas en `/bailes` (correcto como dato histórico).
