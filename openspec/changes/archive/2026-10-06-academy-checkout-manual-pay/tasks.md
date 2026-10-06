# Tasks - academy-checkout-manual-pay

- [x] Schema: `ClaimStatus + AWAITING` (después de REJECTED para que
  `status asc` ordene PENDING primero) + `receiptKey` nullable +
  `methodId`. Migración versionada.
- [x] Service (TDD): `createIntent` (idempotente por person+plan,
  snapshot amount/method, link enrollment), `attachReceipt` (AWAITING→
  PENDING, valida archivo + ownership), `cancel` (solo AWAITING propio,
  hard delete), `listMyClaims` + `planId`/`methodId`/`methodType`,
  `loadClaimForReceipt` tolerante a null. 11 specs.
- [x] Controller: `POST :id/claims/intent`, `POST :id/claims/:claimId/receipt`,
  `POST :id/claims/:claimId/cancel`. Ownership checks.
- [x] Front checkout: selector de medio (Flow vs métodos activos,
  solo en mode=once), panel manual con instrucciones por tipo,
  copyboard de transferencia (6 campos + copiar todo con monto),
  upload de comprobante, estados AWAITING/PENDING/REJECTED, reanudación
  por `claims/mine`.
- [x] Ficha: sección de pago fuera → `AcademyClaimsMine` read-only.
  Cola del owner: sección AWAITING separada.
- [x] i18n (es-CL) + docs (architecture.md, omni-dance.md) +
  openapi/postman regen (251 paths).
- [x] Verificación: specs, suite API (1728 + e2e aislado), tsc api+web,
  build web 71/71, i18n ALL_KEYS_OK, impeccable detect [],
  openspec validate. Commit + push dev + handoff.
