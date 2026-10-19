# Tasks — academy-approval-gate

## 1. Schema + migración
- [ ] `Academy.reviewStatus RoleStatus @default(PENDING)` y
      `Academy.photoUrl String?` en `schema.prisma`
- [ ] `pnpm db:migrate` con backfill: `UPDATE "Academy" SET
      "reviewStatus"='APPROVED'` para filas existentes

## 2. Checklist compartido (API)
- [ ] Helper `academyChecks(academyIds)` en módulo academies (o shared
      service): batch groupBy de series activas, clases futuras, planes,
      y PersonRole APPROVED de owners → mapa id → checks
- [ ] `POST /academies` nace con `reviewStatus: "PENDING"` (default
      ya lo da el schema — actualizar comentario)
- [ ] `GET /academies` + `GET /academies/public`: filtrar por
      visibilidad (APPROVED, o PENDING con checklist completo →
      persist APPROVED best-effort). Mantener `active` +
      `billingBlockedAt: null` + owner APPROVED
- [ ] `GET /academies/:id/profile`: 404 si no visible y viewer no es
      manager (requireManage ya resuelve privilegio — reusar)
- [ ] `GET /classes/browse`: mismo filtro por academia
- [ ] `GET /academies/:id` + `GET /academies/mine`: incluir
      `reviewStatus` + `checks`
- [ ] `PATCH /academies/:id/settings` acepta `photoUrl` (validar URL
      http(s), "" limpia)

## 3. Cola admin (API)
- [ ] `GET /admin/academy-review-queue`: PENDING/REJECTED con checks,
      owner + estado de rol
- [ ] `POST /admin/academy-review-queue/:academyId/approve` → APPROVED
      (override, audit ACADEMY_APPROVE)
- [ ] `POST /admin/academy-review-queue/:academyId/reject` → REJECTED
      (audit ACADEMY_REJECT)

## 4. Web
- [ ] `/admin/perfiles-por-validar`: sección "Academias" con la cola —
      badges por check, aprobar (override), rechazar
- [ ] `/academia`: card de visibilidad (estado + ítems faltantes con
      links a la sección que los resuelve)
- [ ] `/academia/configuracion/perfil`: campo `photoUrl`
- [ ] i18n keys nuevas (es-CL + paridad en/fr/pt-PT)

## 5. Docs + datos
- [ ] `docs/qa-flows-inventory.md`: flujo nuevo (auto-aprobación, cola
      override, checklist visible al owner)
- [ ] Regenerar `docs/openapi.json` + postman
- [ ] `docs/architecture.md`/`docs/flows.md` si aplica
- [ ] Data op: academias "Latin Dancing" y "The Real Mambo" de muvet →
      PENDING para QA manual

## 6. Verificación
- [ ] `pnpm --filter @omnidance/api build` + `pnpm --filter
      @omnidance/web typecheck` + lint
- [ ] QA manual: crear academia (owner APPROVED) → invisible; ir
      completando checklist → se publica sola; admin rechaza → se
      oculta; admin aprueba override → visible
