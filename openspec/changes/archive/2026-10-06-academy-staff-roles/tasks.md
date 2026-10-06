# Tasks - academy-staff-roles

- [x] Schema: `AcademyStaff` (7 flags `can*`, `@@unique(academyId,personId)`)
  + `Academy.staff` + `Person.reviewedClaims`/`PaymentClaim.reviewedBy`
  + migración.
- [x] Dominio: `AcademyCapability`, `AcademyContext.staff`,
  `canAcademy(person, academy, cap)` en `academy.service.ts`.
- [x] `AcademyAccess`: `requireCapability` + `requireCapabilityWrite` +
  `requireStaff` (cualquier flag u owner/ADMIN); `loadContext` incluye staff.
- [x] Remapear call sites `requireAdminister(Write)` → capacidades:
  claims/métodos→payments; enrollments+alumnos+asistencia→students;
  planes→plans; series/slots/clases/videos→schedule; settings→profile;
  instructors→team; billing→billing; dashboard→requireStaff.
- [x] Claims: relación `reviewedBy`→Person en schema, incluir
  `reviewedBy{id,name}` en `listClaims`, UI muestra revisor.
- [x] `createMagicToken(email, consent, ttlSeconds?)` (default actual).
- [x] Email `academyInviteEmailHtml` (invitación a colaborar).
- [x] `AcademyStaffController`: GET/POST/PATCH/DELETE `/:id/staff` +
  GET `/:id/access`.
- [x] Web: `/academia/equipo` (alta por email, toggles, quitar),
  columna revisor en `/academia/cobros`, gating de nav por caps.
- [x] Tests: dominio caps, access spec, e2e staff (invite/403/self-delete),
  e2e reviewer en cola, spec magic token TTL.
- [x] Docs: `flows.md` (equipo + auditoría), `architecture.md` (modelo +
  capacidades), openapi/postman si cambia contrato.
- [x] Verificación: suite API, tsc web, i18n, openspec validate.
