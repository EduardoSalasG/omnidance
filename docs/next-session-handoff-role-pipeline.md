# Handoff; role-registration-pipeline (implementación pendiente)

Branch: dev. Stack levantado (api:4000, web:3000, db docker 5433, redis 6379).
Git sin PATH: usar /c/Program Files/Git/cmd/git.exe.

## Change aprobado
`openspec/changes/role-registration-pipeline` (validado, commiteado).
Decisiones del usuario:
- Landings `/para-academias`+`/para-productores` CTA → `/login?role=ACADEMY_OWNER|PRODUCER`;
  en primer login se crea PersonRole PENDING. Esos roles dejan de ser requestable en /perfil.
- PENDING (solo esos 2 roles) = consola completa, INVISIBLE al público (directorio
  /academias, listados eventos, búsqueda de actores/lineups) hasta APPROVED.
- SANDBOX se elimina del enum + código (migración: SANDBOX→PENDING). refs: roles.guard,
  roles.decorator(AllowSandbox), academies.controller, payments/gateway-accounts,
  admin.controller, support.controller, user-intel.controller; web: academy-gate,
  academia/nueva, usuarios/[personId], perfil, soporte, i18n parts (admin/support/analytics).
- `/admin/perfiles-por-validar`: página dedicada; cola PENDING owner/producer con
  checklist (nombre, email verificado, teléfono, datos del actor) → aprobar (409 si
  incompleto) / rechazar (quita rol).
- `effectivePro` += APPROVED (PENDING no compra ni usa Pro).

## Orden sugerido
1. Web+API aditivos: login ?role= → PersonRole PENDING; validation-queue endpoints+page;
   visibilidad APPROVED en públicos; guard permite PENDING p/2 roles; effectivePro check.
2. Luego limpieza SANDBOX + migración (último paso, rompe hasta migrar).
3. QA: registrar owner via landing, crear academia invisible, completar perfil,
   aprobar desde cola, verificar visibilidad.

## Estado previo commiteado
74ded51 paginación users, 97369d5 expand+contadores, 891005d academia nueva,
(catalogos) nuevo+editar+delete-zona d62fed3, openspec pipeline (último commit).
