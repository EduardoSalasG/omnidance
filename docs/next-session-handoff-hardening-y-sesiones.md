# Handoff: auditoría seguridad + 4 changes de hardening implementados

Sesión 2026-11-10 (noche). Se corta por margen de contexto con trabajo
IMPLEMENTADO pero SIN COMMITEAR en el worktree — el commit es el primer
paso de la próxima sesión.

## Estado del worktree (TODO sin commitear en dev)

5 changes implementados por subagentes en paralelo:

| Change | Estado | Verificación reportada |
|---|---|---|
| `security-event-scope` | implementado | api 2689 tests verdes, tsc limpio en sus archivos |
| `api-edge-hardening` | implementado | api 2700 tests verdes, typecheck limpio, migración `20261130000000_magic_token_consumed` aplicada |
| `web-edge-hardening` | implementado | web 104 tests verdes, typecheck limpio, openspec valid |
| `auth-sessions` (telemetría) | implementado | track endpoint + `app.launch` + entidad `dispositivos`; 28 tests verdes |
| `auth-sessions` (core) | **CORRIENDO al cortar** (subagente 432a62c9) | AuthSession + revocación + PushToken UA |

`openspec validate --changes`: **5/5 passed** (los 4 anteriores +
multipais-foundation).

## Pendiente inmediato (próxima sesión)

1. Leer el resultado del subagente 432a62c9 (auth-sessions core) — sus
   ediciones aterrizaron en el worktree sin commit.
2. Verificación consolidada del worktree completo: `pnpm typecheck`,
   `pnpm test`, `pnpm --filter @omnidance/web build` (recomendado por el
   agente web: browserslist + expireTime solo se validan en build real),
   `openspec validate --changes`.
3. Commits por change (convención del repo, identidad EduardoSalasG, sin
   trailers), archivar los 4 changes completados
   (`openspec archive <change>` sin --skip-specs).
4. Regenerar `docs/openapi.json` + postman con API viva (`node
   apps/api/scripts/export-api-docs.cjs` — ojo: requiere
   `API_DOCS_ENABLED=true` en el proceso desde api-edge-hardening).
5. Push + evaluar release (el árbol ya tiene 1.18.0 en main).

## Qué se implementó (resumen)

- **security-event-scope**: cierra familia BOLA cross-tenant (checkins,
  guest lists, entry-passes, discounts) con `requireEventActor`
  (apps/api/src/common/event-access.ts). Staff/productor ajeno → 403;
  codes ajenos → 404 en detail/redemptions.
- **api-edge-hardening**: health sin DB (`/api/health/db` aparte),
  cooldown 60s en reconcile sweeps, `@Throttle` en webhooks (30/min) y
  exports (10/min), cap magic-link por email (5/h), Swagger gate
  `API_DOCS_ENABLED`, magic token consumible (`MagicTokenUse`, grace
  prefetcher), settle conservador ante underpay (`PENDING_REVIEW`),
  `internalNext` rechaza `/%`, xlsx→exceljs, vhost nginx versionado en
  `deploy/nginx/omnidance-api.conf`.
- **web-edge-hardening**: `cleanHttpUrl`/`sanitizeMethodDetails` en
  writes de API (payment links, videos, evidenceUrl), `safeExternalHref`
  en ~12 sinks, SW notificationclick con whitelist, connect-src acotada,
  logout limpia cache staff, serverApiUrl loopback-only, browserslist,
  `expireTime: 3600` en next.config, `data-clarity-mask` en superficies
  sensibles.
- **auth-sessions telemetría**: `POST /analytics/track` público,
  `AppLaunchTracker` en layout, entidad `dispositivos` en /analitica
  ADMIN.
- **auth-sessions core** (en curso): AuthSession persistida + jti en JWT
  + SessionGuard revoca + endpoints self/admin + UI mis dispositivos +
  PushToken.userAgent.

## Hallazgos NO implementados (backlog documentado)

- Pasada BOLA a módulos restantes (crm, gamification, classes, trip,
  mail-campaigns, academy-*, payouts, producer-pro, practices) — ver
  docs/security-audit-2026-11-10-backend.md "Verificado OK" final.
- Magic token: el grace prefetcher exige sesión válida misma Person;
  scanner-consume cerrado a propósito (decisión en design.md).
- `.xls` BIFF sin soporte tras exceljs → 400 guía a re-guardar.
- Sentry, `pnpm audit` en CI, Lighthouse con sesión en app autenticada,
  Cloudflare/nginx/VM/monitoring = tareas del owner en
  `docs/security-hardening-owner-tasks.md` (+ propuesta Grafana
  evaluada: viable; recolector Neon pendiente de escribir).

## Notas de entorno

- Hook del usuario `herdr-agent-state.ps1` falla con exit 127
  (powershell no en PATH del shell de hooks) — cosmético; fix = ruta
  absoluta a powershell.exe en `Roaming/devin/config.json`.
- `lh-mobile.json`/`lh-desktop.json` en raíz = artefactos Lighthouse
  (~500KB); decidir si commitear a docs/perf/ o gitignore.
- Migración auth-sessions (AuthSession) probablemente pendiente de
  aplicar: verificar `pnpm db:migrate`/`migrate deploy` contra docker.
- El commit-msg hook rechaza trailers de agente; pre-push corre suite
  API completa (~60-70s por push).
