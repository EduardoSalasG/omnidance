# Tasks

## Infra (slice 1)

- [x] 1. `e2e/flow-map.json`: reglas path→tags según diseño §6 con
  prefijos reales del repo + `defaultTags: ["@smoke"]`.
- [x] 2. `scripts/e2e-which.mjs` + `test:e2e:which` en package.json:
  diff→tags→comando sugerido.
- [x] 3. `playwright.config.ts`: `grepInvert` excluye
  `@visual|@destructive` salvo `PW_ALL=1`.
- [x] 4. `e2e/helpers.ts`: `profe` en `USERS`, `dismissTours`,
  `acceptConsent`, `apiRequest` (wrapper webhook pagos).
- [x] 5. Reorden con tags: `notice-smoke` → `flows/transversal-notices`
  (`@transversal @notices`), `states-check` → `flows/transversal-states`
  (`@transversal @states`), `video-ficha` → `flows/academia-videos`
  (`@academia @videos`), `polish-visual` → `visual/` (`@visual`),
  `@smoke` en describes de `smoke.spec.ts`.
- [x] 6. `flows/public-login.spec.ts` (`@public @login`): password
  login → /inicio; `?next=` round-trip; 401 credenciales; logout.
- [x] 7. `flows/transversal-gates.spec.ts` (`@transversal @gates`):
  dancer → /academia sin-acceso; anon → /eventos bounce `?next=`;
  profe → /academia/particulares.
- [x] 8. Verificar: `pnpm test:e2e --project=chromium` verde en el
  slice + `e2e-which.mjs` con diff de prueba + actualizar
  `docs/qa-flows-inventory.md` §0 con la convención de tags/map.
  Resultado: 46/46 verdes en 2.1min. El run completo exige build de
  producción en :3000 (`next build`+`next start`) - `next dev`
  corrompe `.next` bajo carga paralela (JSON.parse fijo, 2x en la
  sesión) - y API con `PAYMENT_GATEWAY=stub` +
  `THROTTLE_AUTH_LIMIT=120`. Fixes de robustez encontrados en la
  corrida: planes se busca por `q` (paginación pageSize 12), chip de
  niveles fijado por índice (locator por aria-pressed re-resuelve),
  tours marcados por API en auth.setup (overlay tardío ~8s).

## Backlog (siguientes slices, en orden del diseño §8)

- [x] 9. `dancer-eventos` (cartelera, `?view=mios`, `?a=`, empty).
- [x] 10. `dancer-checkout` (stub:// → webhook PAID/FAILED): verde -
  la corrida e2e va con API en `PAYMENT_GATEWAY=stub` (la env del
  proceso gana sobre `.env`, que trae flow+credenciales); documentado
  en inventory §0.
- [x] 11. `academia-cobros` (claims approve/reject, error-retry):
  claims PENDING creados por API (multipart receipt.png) por test -
  aprobar/rechazar consume el claim y no se deshace.
- [x] 12. `academia-alumnos` (lista → ficha, alta 409 con mismo
  personId+planId, levels editor PATCH). Sin KPIs: muvet es STUDIO y
  insights es feature PRO.
- [x] 13. `academia-series` (taller one-off QA → slot ficha → clase
  materializada → cancel instancia → borrado lógico de la serie).
- [x] 14. `academia-clases` (roster profe, marcar ±30min + fuera de
  ventana Sin confirmar): taller one-off con profe instructor + book
  del dancer por API - el clock del seed era timing-dependiente.
- [x] 15. `dancer-membresia` (TRANSFER multi-actor): plan QA por API
  → checkout `mode=sub` vía TRANSFER → orden MANUAL + comprobante →
  aprobación en order-claims → sub ACTIVE vía `/subscriptions/mine`.
- [x] 16. `productor-eventos` (absorbe smoke crear→publicar + copiar
  link público con permisos de clipboard en el contexto).
- [x] 17. `productor-colaboradores` (alta por búsqueda + cupo lleno →
  403 `staff_quota`/"sube de tier" vía ActionNotice role=alert).
- [x] 18. `staff-puerta` (boot manifest → check-in manual verde →
  dup rojo; EntryPass LIST por guest-list admin - sin gateway).
- [x] 19. `soporte-buscar` (búsqueda ≥2c, ficha read-only, volver).
- [x] 20. `dancer-qr` (canvas `role="img"`, mint 500 → alert + retry;
  filtrar el announcer de Next que también es role=alert).
- [x] 21. `academia-planes` (crear → ficha → desactivar/reactivar).
