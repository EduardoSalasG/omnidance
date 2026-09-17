# Plan: RBAC global + parámetros de plataforma + panel admin

**Contexto:** Los fees viven hardcodeados (`SERVICE_FEE.*` en shared / `SERVICE_FEE_CLP` env) y los role-checks son guards ad-hoc por módulo que **ignoran `PersonRole.status`** — cualquiera que solicita un rol (PENDING/SANDBOX) pasa los guards. Pedido del usuario: fees parametrizables, panel de administración para parámetros y usuarios, RBAC a nivel global.

## Decisiones

- **`PlatformParam`** (nuevo modelo): `key @id`, `value Json`, `description?`, `updatedById?`, `updatedAt`. Key-value genérico — cualquier parámetro futuro sin migración.
- **Semántica de estados** (canónica global): `APPROVED` = acceso completo · `SANDBOX` = acceso solo donde el endpoint lo declare · `PENDING` = sin acceso privilegiado.
- **`@RequireRoles(...roles)`** + `RolesGuard` compartido en `src/common/rbac/` — reemplaza los 5 guards ad-hoc (ProducerGuard, ProducerStaffGuard, AdminGuard, AcademyOwnerGuard, StaffGuard). Rutas sandbox-friendly opt-in con `{ allowSandbox: true }` (p.ej. POST /academies).
- `req.person.roles` pasa a ser **solo APPROVED**; `req.person.roleStates` expone `{role,status}[]` completo. `/me` devuelve ambos.
- **ParamsService** (en `src/params/`): `get(key)`, `getNumber(key, fallback)`, `set(key,value,updatedBy)` con cache in-memory 30s. Defaults viven en código (shared).
- Admin panel web: tabs Solicitudes / Usuarios / Parámetros en `/admin`.

## Tasks

### T1 — Schema: `PlatformParam` + seed de parámetros
Modelo + `prisma db push` + seed: `service_fee.presale_clp=500`, `service_fee.door_app_clp=700`, `service_fee.door_cash_clp=0`, `session.cooldown_minutes=4`, `qr.rotation_seconds=60`, `prime_time.window_minutes=30`, `prime_time.threshold_pct=0.2`.

### T2 — RBAC global (`src/common/rbac/`)
- `roles.decorator.ts`: `RequireRoles(...roles)` + `AllowSandbox()` (metadata).
- `roles.guard.ts`: `RolesGuard` (Reflector) — sin metadata → allow; metadata → `req.person.roles` (APPROVED) ∩ required ≠ ∅, o `AllowSandbox` y rol SANDBOX presente. 403 si falla.
- `session.guard.ts`: `roles` solo APPROVED + `roleStates` completo. `findById` select `{role,status}`.
- `people.controller.ts` `/me`: incluir `roleStates`.
- Migrar controllers: checkins, discounts, social (guest-lists), admin, academies → `@RequireRoles`, borrar guards viejos.
- Tests: dominio del RolesGuard (unit) + ajustar e2e que asuman acceso con rol no-APPROVED.

### T3 — `params` module
`ParamsService` + admin endpoints `GET /admin/params`, `PUT /admin/params/:key` + público `GET /params/public` (whitelist: fees, prime_time, cooldown). Wire `PricingService` callers (checkout+webhook) → `params.getNumber("service_fee.presale_clp", 500)`; sessions cooldown → `session.cooldown_minutes` si es trivial, si no queda documentado.

### T4 — Admin people endpoints
`GET /admin/people?q=&take=` (lista con roles+status), `GET /admin/people/:id`, `PATCH /admin/people/:id/roles/:role {status}` (PENDING↔APPROVED; SANDBOX→APPROVED = el approve actual). Reusar AdminGuard→`@RequireRoles(ADMIN)`.

### T5 — Web `/admin` tabs
Solicitudes (existente) + **Usuarios** (búsqueda, tabla con roles, PATCH status inline) + **Parámetros** (editor key→value para los params seedeados, inputs numéricos). i18n `admin.params.*`, `admin.people.*`.

## Verificación
- `npx vitest run` API (suites e2e ajustadas por semántica APPROVED).
- `tsc` ambos, `next build`.
- Smoke real: cambiar fee en `/admin` → nuevo checkout refleja el valor.
