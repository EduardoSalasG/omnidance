# Handoff — Release v1.0.0 + seed prod

**Rama**: `dev` (sincronizada con `main` en `6da125b`) · **Tag**: `v1.0.0`

## Qué quedó hecho

- **Release v1.0.0 promovido `dev → main`** (fast-forward, 27 commits: 26
  de features + commit de release). Bump de versión en root/web/api,
  entrada 1.0.0 en CHANGELOG, tag anotado `v1.0.0`.
- **Deploy CI verde** (run 38918426792, 5m51s): imagen GHCR → VM →
  `prisma migrate deploy` aplicó las 4 migraciones nuevas
  (`relationship_score_breakdown`, `crm_dynamic_segments`,
  `campaign_scheduled_at`, `person_language`) → health gate OK.
  El seed automático se omitió: "DB completa (9 roles, 2 admin)".
- **API prod verificada**: `GET https://api.omnidance.eduardosalasg.dev/api/health`
  → `{"status":"ok"}`.
- **Seed prod corrido manualmente** contra Neon (endpoint directo):
  `SEED_ENV=prod pnpm exec tsx prisma/seed.ts` desde `apps/api`,
  ~19.5min, dataset piloto completo idempotente. Sin `SEED_ADMIN_EMAIL`
  (los 2 admin existentes no se tocaron; seedDev asegura
  `admin@omnidance.dev`).

## Verificación (G3)

- `pnpm test`: api 98 archivos / 1932 tests, web 3/3 — todo verde.
- `tsc --noEmit` web: limpio (`tsc-errors.txt` untracked es artifact
  viejo de la migración i18n, ignorar/borrar).
- `pnpm build`: shared + api + web (367 páginas × 4 locales) — verde.

## Notas

- La URL de Neon prod la pasó el usuario por chat; no queda en el repo.
- Untracked acumulados en working tree (`.agents/`, `.claude/`,
  `brag-output*/`, `docs/lighthouse/*.json` nuevos, `skills-lock.json`,
  `tsc-errors.txt`) — candidatos a `.gitignore` o limpieza.
- Frontend: push a main no gatilla deploy del front acá — Netlify
  construye desde el repo conectado; verificar que el build de Netlify
  haya corrido para `main`/`v1.0.0`.
- Annotations del workflow (no bloqueantes): acciones en Node 20
  forzadas a 24; `ubuntu-latest` migra a Ubuntu 26 el 19-oct.

## Próximos pasos posibles

- QA funcional post-release: selector de idioma con sesión real,
  consolas CRM nuevas en prod, tours actualizados.
- Decidir cuándo terminar el piloto del seed (`SEED_ENV=prod` →
  restaurar dispatch a `baseline`, `seed-prod-baseline.ts` preservado).
- Crear GitHub Release desde el tag `v1.0.0` con el changelog como body.

---

## Update: hotfix v1.0.1 (mismo dia)

- Crash prod "Application error" en /inicio lente academia: `formatDelta` (academy-kpi-strip) llamaba `useNumFmt` en helper condicional (React #310) + `useViewMode`/`useActiveRole`/`useSidebarState` leian localStorage en render (#418 hydration). Fix = useSyncExternalStore con server snapshot; `relativeTime` (/notificaciones) y shell de /perfil igual. Reproducido con puppeteer-core+Chrome emulando iPhone contra prod (login muvet@omnidance.dev); verificado post-fix en prod: dashboard renderiza con deltas, sin Application error.
- main=v1.0.1 (tag, `59ebb2e`), dev sincronizada (merge `3ce804d`). CI verde 6m0s.
- **Residual**: quedan 2 warnings #418 no-fatales en prod (pagina renderiza igual) - fuente menor por investigar (candidato: otro read divergente SSR/cliente en el chrome). Repro assets: `%TEMP%/repro/repro-academy.mjs`.
- Gap conocido: `rtf` en notificaciones hardcodea locale "es".
