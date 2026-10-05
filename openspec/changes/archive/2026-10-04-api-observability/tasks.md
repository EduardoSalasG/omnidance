# Tasks — api-observability

## S1 — Winston + contexto

- [x] Deps: `winston` + `nest-winston` (pinned, `pnpm --filter
      @omnidance/api add`)
- [x] `src/common/logging/logger.factory.ts` — instancia winston:
      nivel por `LOG_LEVEL`/`NODE_ENV`, formato nestLike dev / JSON
      prod con timestamp+stack, formato ALS que inyecta `requestId`,
      formato redactor de claves sensibles
- [x] `src/common/logging/log-context.ts` — `AsyncLocalStorage` +
      helper `getLogContext()`

## S2 — Request logging

- [x] `src/common/logging/request-logger.middleware.ts` — asigna/
      hereda `x-request-id`, corre el handler dentro del ALS, y en
      `res.finish` emite la línea resumen (method, path sin query,
      status, durationMs, requestId, personId si la sesión quedó
      poblada). Nivel: info <400 / warn 4xx / error ≥500.
      Excluye health/docs.
- [x] `main.ts`: `WinstonModule.createLogger` como logger de Nest +
      `app.use(middleware)` antes de listen

## S3 — Cierre

- [x] Tests: redactor (claves enmascaradas a todo nivel, incl. top del
      record), middleware (requestId echo/generado, niveles por status,
      exclusiones, propagación ALS) — 11/11 verde
- [x] `docs/architecture.md`: sección logging/observabilidad + envs
- [x] Handoff actualizado
