# Tasks — admin-user-soft-delete

- [x] 1. Schema `Person.deletedAt` + migración
- [x] 2. `deleteUser` → soft + `reactivateUser` (audited)
- [x] 3. Auth bloqueada: SessionGuard, upsertByEmail, login password
- [x] 4. Filtros `deletedAt: null` en superficies públicas (people, friends, guest-lists, entry-passes, practices)
- [x] 5. Admin UI: badge + reactivar + copy; selects con deletedAt
- [x] 6. e2e actualizado (soft delete + 409 re-registro + reactivate)
- [x] 7. i18n 4 locales + typecheck + specs + release
