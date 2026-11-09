# Tasks - flow-production-enable

- [x] `flow.gateway.spec.ts`: describe `resolveGateway` — endpoint prod
      aceptado, URL desconocida fail-fast, default sandbox intacto
- [x] `payments.module.ts`: guard → whitelist de endpoints oficiales
      (sandbox + `https://www.flow.cl/api`) y docblock actualizado
- [x] Docs: `docs/ci-cd.md` (checklist `.env` VM: sandbox → prod URL),
      `docs/qa-flows-inventory.md` §0 (palancas dev: nota sandbox→prod),
      `.env.example` (comentario de credenciales por ambiente)
- [x] Verificación: spec payments verde (718/718),
      `pnpm --filter @omnidance/api typecheck` exit 0,
      `openspec validate --changes` 2/2
- [ ] Post-deploy (fuera del commit): contenedor bootea sin el error
      del guard + smoke de checkout real en Flow producción
