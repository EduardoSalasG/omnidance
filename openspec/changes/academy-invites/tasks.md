# tasks: academy-invites

## 1. Datos

- [ ] Migración: `AcademyInvite` (academyId, email, name, invitedById, personId?, consumedAt, createdAt) + `AuthOtp.next`
- [ ] Índice/unique de pendiente por (academyId, email)

## 2. API

- [ ] `POST /academies/:id/invites` (cap students): crea invite, magic token con `next=/academias/:id`, correo de invitación; push si Person existe; idempotente por pendiente
- [ ] `GET /academies/:id/invites`: listado pendientes primero
- [ ] `AuthOtp.next`: createMagicToken/verify lo transportan; verify valida path interno y lo preserva en redirect
- [ ] Consumo en verify: `consumedAt`/`personId`, `Referral` (INVITE, referrer=invitedById), ActivityEvent `invite.registered`
- [ ] Plantilla correo invitación de academia (variante de studentInviteEmailHtml sin enrollment)
- [ ] Tests: invite nuevo, existente con push, dedup, consumo, next externo ignorado

## 3. Web

- [ ] Acción "Invitar" + página de form (email, nombre, apellido) en `/academia/alumnos`
- [ ] Sección listado de invitados (pendientes primero, estado)
- [ ] `/bienvenida` continúa a `?next=` al finalizar onboarding
- [ ] i18n es-CL

## 4. Gates y docs (actualización completa de documentación relacionada)

- [ ] `openspec validate --changes` verde; archivar change sin `--skip-specs`
- [ ] `omni-dance.md`: invitación de academia (modelo AcademyInvite, flujo)
- [ ] `docs/qa-flows-inventory.md`: flujo invitación academia (envío, push, consumo, lista)
- [ ] `docs/architecture.md`: modelo `AcademyInvite`, endpoints, `AuthOtp.next`
- [ ] `docs/flows.md`: secuencia invitación (enviar→verify→consumo+Referral)
- [ ] `docs/openapi.json` + postman (`export-api-docs.cjs`) por endpoints nuevos
- [ ] `pnpm typecheck`, `pnpm lint`, tests afectados
