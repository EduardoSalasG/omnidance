# tasks: academy-invites

## 1. Datos

- [x] Migración: `AcademyInvite` (academyId, email, name, invitedById, personId?, consumedAt, createdAt) + `AuthOtp.next`
- [x] Índice/unique de pendiente por (academyId, email)

## 2. API

- [x] `POST /academies/:id/invites` (cap students): crea invite, magic token con `next=/academias/:id`, correo de invitación; push si Person existe; idempotente por pendiente
- [x] `GET /academies/:id/invites`: listado pendientes primero
- [x] `AuthOtp.next`: createMagicToken/verify lo transportan; verify valida path interno y lo preserva en redirect
- [x] Consumo en verify: `consumedAt`/`personId`, `Referral` (INVITE, referrer=invitedById), ActivityEvent `invite.registered`
- [x] Plantilla correo invitación de academia (variante de studentInviteEmailHtml sin enrollment)
- [x] Tests: invite nuevo, existente con push, dedup, consumo, next externo ignorado

## 3. Web

- [x] Acción "Invitar" + página de form (email, nombre, apellido) en `/academia/alumnos`
- [x] Sección listado de invitados (pendientes primero, estado)
- [x] `/bienvenida` continúa a `?next=` al finalizar onboarding
- [x] i18n es-CL

## 4. Gates y docs (actualización completa de documentación relacionada)

- [x] `openspec validate --changes` verde; archivar change sin `--skip-specs`
- [x] `omni-dance.md`: invitación de academia (modelo AcademyInvite, flujo)
- [x] `docs/qa-flows-inventory.md`: flujo invitación academia (envío, push, consumo, lista)
- [x] `docs/architecture.md`: modelo `AcademyInvite`, endpoints, `AuthOtp.next`
- [x] `docs/flows.md`: secuencia invitación (enviar→verify→consumo+Referral)
- [x] `docs/openapi.json` + postman (`export-api-docs.cjs`) por endpoints nuevos
- [x] `pnpm typecheck`, `pnpm lint`, tests afectados
