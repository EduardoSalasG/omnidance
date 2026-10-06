# Tasks - academy-payment-claims

- [x] `schema.prisma`: `AcademyPaymentMethod`, `PaymentClaim` (+enum
  status, relaciones Academy/Person/Enrollment/MembershipPlan) +
  migración.
- [x] `src/storage`: puerto + `LocalDiskStorage` (`UPLOADS_DIR`, key
  `claims/<academyId>/<uuid>.<ext>`, whitelist imagen/PDF) + módulo.
- [x] `academy-claims.controller.ts` + `academy-claims.service.ts`:
  métodos CRUD (admin) + listado sesión; claims POST multipart, GET
  cola admin, GET mine, approve/reject (tx Payment MANUAL +
  membershipBase/EndsAt + notify), GET receipt autenticado.
- [x] Tests: service spec (approve extiende, reject, 409 doble) +
  e2e flujo completo (métodos, claim, cola, approve → endsAt/Payment,
  receipt 403/401).
- [x] Web `/academia/cobros`: CRUD medios + cola "Pagos por validar"
  (ver comprobante, aprobar/rechazar) + i18n.
- [x] Web `/academias/[id]`: sección "Pagar a la academia" (métodos +
  upload comprobante + mis claims) + i18n.
- [x] Ops: `UPLOADS_DIR` en `.env.example` + workflow deploy +
  docker-compose volumen + `docs/ci-cd.md` (disco VM) + `docs/flows.md`.
- [x] Verificación: tests API, builds, i18n audit, openspec validate.
