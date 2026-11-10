# Tasks: auth-sessions

## 1. Modelo y guard (SERIAL — tras api-edge-hardening)

- [x] 1.1 `schema.prisma`: `AuthSession` + `PushToken.userAgent/platform`;
  migración versionada.
- [x] 1.2 `SessionGuard`: valida jti no revocado (cache 60s); lastSeenAt
  con muestreo 1/min.
- [x] 1.3 Emisión: verify magic/otp/login crean AuthSession con el jti
  del JWT (agregar claim jti al payload).

## 2. Revocación (SERIAL — misma zona que 1)

- [x] 2.1 `/me/sessions` list + `DELETE /me/sessions/:id` +
  `POST /me/sessions/revoke-others` (self, valida ownership por personId).
- [x] 2.2 `GET /admin/users/:personId/sessions`,
  `DELETE /admin/sessions/:id`, `POST /admin/users/:personId/sessions/revoke-all`.
- [x] 2.3 UI: "mis dispositivos" en `/perfil` (listar + revocar) y
  sección sesiones en ficha `/admin/usuarios/[id]` — siguiendo
  console-patterns.

## 3. Telemetría dispositivos (PARALELIZABLE)

- [x] 3.1 `POST /analytics/track` (público, throttle): persiste
  `app.launch` con `{displayMode, platform}` + UA header a
  `AnalyticsEvent` (personId de sesión si hay).
- [x] 3.2 Front: efecto en layout `(app)` que emite `app.launch` una vez
  por arranque (matchMedia display-mode; platform por userAgentData/UA).
- [x] 3.3 `PushToken` registro envía userAgent/platform (front + DTO).
- [x] 3.4 Entidad `dispositivos` en `QUERY_CATALOG.ADMIN` +
  `ADMIN_ENTITIES` handler + `ENTITY_TITLES` + i18n (modos, plataformas,
  filtros from/to + platform multi) — espejo de `acquisition`.

## 4. Tests

- [x] 4.1 AuthSession: emisión crea fila con jti; revocada → 401;
  revoke-others deja la actual; admin revoca ajenas; lastSeen muestreo.
- [x] 4.2 Track: persiste con/sin sesión, metadata correcta.
- [x] 4.3 Entidad dispositivos: agrupa modos y plataformas, filtros.

## 5. Docs

- [x] 5.1 `docs/qa-flows-inventory.md`: flujos sesiones/dispositivos.
- [x] 5.2 `docs/architecture.md`: AuthSession en modelo + flujo auth;
  endpoint `/analytics/track` en inventario.
- [ ] 5.3 Regenerar `docs/openapi.json` + postman con API viva (script).
- [ ] 5.4 `docs/flows.md` si el diagrama de auth cambia.

## 6. Verificación

- [ ] 6.1 `pnpm --filter @omnidance/api test` +
  `pnpm --filter @omnidance/web test` + typechecks + `openspec validate`.
