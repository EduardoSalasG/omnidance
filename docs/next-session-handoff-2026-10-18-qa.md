# Handoff; QA: inventario de flujos + pirámide de tests + fix /admin/datos

**Rama**: `dev` · **Fecha**: 2026-10-18

## Qué quedó hecho

### 1. Inventario de flujos para QA
- `docs/qa-flows-inventory.md`; mapa completo de flujos por rol (public/auth, dancer, productor, CRM, analítica, academia, admin, soporte, staff, venue) con endpoints, gates, estados terminales, edge paths y Anexo A de gaps (sin data-testid, filtros no-URL, destructivos sin confirm, timers, pagos stub, privacidad).
- **Regla viva nueva en AGENTS.md §Documentación**: todo cambio de flujo debe actualizar ese doc en el mismo commit.

### 2. Bug real encontrado y corregido: `/admin/datos` RangeError "Invalid time value"
- Causa raíz: render stale al cambiar de entidad; frame intermedio con rows de la entidad anterior bajo `renderRow` de la nueva (`new Date(undefined)`). Datos del API verificados OK.
- Fix en `apps/web/src/app/[locale]/(app)/admin/datos/page.tsx`: `result = {entity, rows}` etiquetado; render solo si `result.entity === entity`.
- `/analitica` es inmune (limpia result síncrono + celdas genéricas).
- Registrado como caso regresión #11 en el Anexo A del inventario.

### 3. Pirámide QA (decisión del usuario: "pirámide completa por fases")
Estado por capa:
- **Estática**: ✅ `apps/web/eslint.config.mjs` (flat, next/core-web-vitals + typescript, ignora scripts/**). Lint limpio tras fixes: `<a>`→`Link` (ProLeadForm, academy-billing), `rules-of-hooks` en BottomNav (hook movido antes de early returns; **bug real**), display-name. `.npmrc` nuevo con `public-hoist-pattern[]=*eslint*` (pnpm no expone plugins transitivos). Scripts `lint`/`typecheck` en web, `typecheck` en api+shared, agregadores en root.
- **Unit**: API 98 specs (existente); web 1 + el nuevo test de componente.
- **Componente**: harness instalado (testing-library + @vitejs/plugin-react@4 + vitest.config.ts con alias @). Primer test: `apps/web/src/app/[locale]/(app)/admin/datos/entity-switch.test.tsx`; mockea apiFetch + gates, monta la page real, conmuta tickets→membership-subscriptions.
- **API e2e**: ~30 specs existentes en `apps/api/test/` (sin tocar).
- **Browser e2e**: scaffold `playwright.config.ts` + `e2e/auth.setup.ts` (storageState por rol, password omnidance123) + `e2e/smoke.spec.ts` (descubrimiento, checkout stub, entity-switch admin, lifecycle productor). `@playwright/test@1.64.1` en root devDeps.
- **CI**: `.github/workflows/qa.yml` nuevo; typecheck + lint + unit en push/PR a dev/main.

## ✅ Update sesión 2 (mismo día, tarde); pirámide e2e VERDE

**`pnpm test:e2e` = 14/14** (6 setup logins + 4 specs × chromium + mobile/WebKit, ~55s). Cerrado todo lo pendiente:

- **Stack**: dev servers corrían pero el web era un proceso zombie del 16-10 (pre-reinstall) + 4 `nest --watch` huérfanos del 15-10 comían ~12GB RAM → OOM del dev server (`RangeError: Array buffer allocation failed`) y V8 `out of memory` en workers de Playwright. Matados; 16.7GB libres.
- **`500 Internal Server Error` en todas las páginas (app)**: no era código ni data; era el **fetch-cache de `.next` corrupto** tras los crashes OOM (`SyntaxError: JSON at position 1455`, entradas concatenadas). Fix: `rm -rf apps/web/.next` + restart. Se suma al patrón conocido de cache stale en AGENTS.md.
- **`ECONNREFUSED` intermitente en proxy /api/**: `API_PROXY_TARGET` default era `http://localhost:4000` y `localhost` resuelve a veces `::1` en Windows mientras Nest solo escucha IPv4 → login fallaba ~1 de N veces. Fix: default `127.0.0.1` en `next.config.mjs`.
- **`429` throttle en logins del setup**: `/api/auth/login` tiene `THROTTLE_AUTH_LIMIT` default 8/min por IP; 6 logins × re-runs seguidos lo pisan → genericError en UI. Dev: `THROTTLE_AUTH_LIMIT=120` en `apps/api/.env` (no aplica a prod). Además `auth.setup.ts` reintenta una vez tras ~65s si ve `#login-error`.
- **`test file should not import test file`**: `smoke.spec.ts` importaba `statePath` de `auth.setup.ts` → helpers movidos a `e2e/helpers.ts`.
- **`timeout` 30s < `navigationTimeout` 90s** en playwright.config → goto cortado mid-compile (ERR_ABORTED). Test timeout ahora 120s.
- **Selectores corregidos contra la app real**: label "Tu correo" (no "email"); password por `input[type=password]` (el radio "Contraseña" viola strict mode); pills de /admin/datos son `role=tab` (PillTabs), no "todos los buttons"; `ul li` → `main ul li` (nav off-canvas hidden en mobile); checkout determinístico: evento PUBLISHED+futuro+con precio vía `/api/events` → `goto /eventos/<id>/checkout` → "Ir a pagar" → "Simular aprobado" → "Pago confirmado"; productor: click en la card-link por nombre + esperar notice "Evento publicado" antes de navegar (un goto mid-POST cancelaba el publish en mobile).
- `webkit` instalado (`playwright install webkit`) para el project mobile.
- **Verificación**: lint 0 errors (91 warnings preexistentes, mayoría imports `locale`/`useNumFmt` huérfanos de la migración i18n; backlog de limpieza) · typecheck limpio · `pnpm test`: api 1932 + web 4 · e2e 14/14.

## ⚠️ Estado pendiente / roto al cerrar

1. **`pnpm install` corrió con `.npmrc` nuevo → reinstalación total.** Falló EPERM por DLL de Prisma bloqueada; se mató el dev server :4000 (PID 44996) y reinstall OK (821 pkgs). **`pnpm dev:api` quedó APAGADO; reiniciar.** `prisma generate` ya corrido.
2. **Test de componente VERDE**: `entity-switch.test.tsx` pasa (368ms) con `happy-dom` (jsdom@30 traía undici@8.12.2 roto). Mocks: apiFetch, AdminGate, ConsoleHeader, navigation (next-intl/next no resuelven en vitest; Link/Link-mocks inline porque vi.mock se hoista). Warning cosmético: `MISSING_MESSAGE` para keys no mockeadas.
3. **Playwright parcialmente verificado**: `playwright install chromium` OK. `pnpm dev` levantado (api :4000 + web :3000 responden). Al correr `--project=setup` (logins) **los 6 fallaron en `page.goto("/login")`**: la ruta no responde (`curl /login` >120s colgado, `/` responde 0.5s, API OK) → dev server Next colgado compilando tras el reinstall; caso documentado en AGENTS.md: **matar dev → `rm -rf apps/web/.next` → reiniciar → reintentar `pnpm test:e2e --project=setup`**. Fix ya aplicado: setup serial (`workers:1`) + `navigationTimeout:90s` en playwright.config.ts (los 6 workers paralelos esperaban el mismo compile). Selectores de smoke.spec.ts siguen heurísticos; iterar sobre app real.
4. ~~gitignore + script `test:e2e`~~; hecho.
5. CI e2e (Playwright con Postgres efímero + seed + stack) NO escrito aún; solo qa.yml estático.
6. No se commiteó nada esta sesión.

## Comandos verificados
- `eslint .` web: 0 errores · `tsc --noEmit` web: limpio · vitest web pre-harness: 3/3
- API en vivo respondía con datos válidos (login admin@omnidance.dev/omnidance123, browse entities OK).

## Próximo slice sugerido
1. Terminar happy-dom swap → test verde.
2. `playwright install` + iterar smoke specs hasta verdes.
3. Decide: ¿component tests para checkout-client/door después? ¿CI e2e job?
