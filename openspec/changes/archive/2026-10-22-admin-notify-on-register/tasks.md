# Tasks; admin-notify-on-register

- [x] 1. `NotificationsModule` → `@Global()` (mismo patrón que
  `JobsModule`); verificar que los módulos que lo importan siguen
  compilando (import explícito redundante pero válido).
- [x] 2. `AuthController`: inyectar `NotificationsService` +
  `PrismaService`; `notifyAdminsNewUser` best-effort tras crear la
  Person en `register`, y tras `upsertByEmail` cuando `!existed` en
  `verify` y `otp/verify` (type `user.registered`, category
  OPERATIONAL, body con email + rol pedido si viene).
- [x] 3. Specs vitest: controller spec; registro nuevo notifica a
  admins APPROVED; claim de existente / verify de cuenta existente NO
  notifica; fallo del centro no rompe el alta.
- [x] 4. Docs: `docs/architecture.md` (módulo notifications global) +
  qa-inventory (flujo admin recibe aviso de registro); validate +
  archive.
