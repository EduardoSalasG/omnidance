# Tasks - mail-campaign-context-audiences

- [x] Schema `MailCampaignSent` (campaignId+dedupKey unique) + migración.
- [x] Service: `resolveAudience` devuelve `{personId, ctx, dedupKey?}`;
  audiencias ENROLLMENTS_EXPIRING/EXPIRED + PLATFORM_SUB_EXPIRING con
  `days`; `applyTemplate` (`{{var}}`); validación de vars conocidas al
  crear/editar; sendRun marca SKIPPED a dedupKey ya enviada y registra
  sent por dedupKey; testSend con ctx real. Specs.
- [x] Controller: AudienceDto kinds nuevos + `days` (default 7).
- [x] Front `/admin/campanas`: opciones de audiencia nuevas, input
  `days`, hint de `{{vars}}` por audiencia. i18n.
- [x] Docs: architecture.md + omni-dance.md (sección campañas),
  openapi/postman regen.
- [ ] Verificación: specs, suite API, tsc api+web, build, i18n,
  openspec validate. Commit + push dev + handoff.
