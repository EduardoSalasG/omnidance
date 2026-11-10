# Tasks: fix-mail-campaigns-audience-dto

## API

- [x] 1.1 `mail-campaigns.controller.ts`: `CampaignDto.audience` con
  `@IsDefined() @ValidateNested() @Type(() => AudienceDto)`; DTOs
  exportados para el spec.
- [x] 1.2 `mail-campaigns.controller.spec.ts`: regresión corriendo
  `CampaignDto` y `CampaignPatchDto` por `ValidationPipe` con la
  config global (whitelist+transform).

## Cierre

- [x] 2.1 Verificación: spec verde, typecheck api, QA vivo POST 201 +
  PATCH 200 desde `/admin/campanas/nueva`.
