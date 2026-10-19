# Tasks — role-registration-pipeline

## 1. Schema + migración
- [ ] Drop SANDBOX de RoleStatus; migrar filas SANDBOX → PENDING.

## 2. API
- [ ] Guard: PENDING ACADEMY_OWNER/PRODUCER → acceso a consolas
      propias; otros roles PENDING sin acceso. Eliminar AllowSandbox.
- [ ] Login `?role=` persiste pendRole en magic-link/session; al
      verificar, crea PersonRole PENDING (idempotente).
- [ ] people.controller: quitar requestable ACADEMY_OWNER/PRODUCER.
- [ ] Visibilidad pública filtra APPROVED (directorio academias,
      eventos, búsqueda de actores).
- [ ] GET /admin/validation-queue: PENDING owner/producer + checklist
      completo (name, emailVerified, phone, datos de actor: ≥1 academia
      o productor con datos); POST approve (409 si incompleto) / reject.

## 3. Web
- [ ] CTAs landings → /login?role=...; login persiste y envía role.
- [ ] /perfil: quitar request para esos roles; banner "cuenta en
      validación" si PENDING.
- [ ] /admin/perfiles-por-validar: cola + checklist visual + aprobar/
      rechazar; nav admin.
- [ ] Borrar refs SANDBOX (academy-gate canCreate, nueva page, fichas,
      i18n status labels).

## 4. Docs + verificación
- [ ] qa-flows-inventory, openapi/postman, architecture.md RBAC.
- [ ] typecheck, tests (guard, queue), i18n-audit, e2e smoke.
