# Proposal: `audience` sobrevive al pipe global en mail-campaigns

## Resumen

Bug encontrado en QA manual (2026-11-10) probando el flujo nuevo de
`/admin/campanas/nueva`: `POST /admin/mail-campaigns` respondía 500
`Cannot read properties of undefined (reading 'kind')`. Causa raíz:
`CampaignDto.audience` no tenía decoradores y el `ValidationPipe`
global (`whitelist:true, transform:true` en `main.ts`) recorta toda
propiedad sin decoradores → `dto.audience === undefined` →
`toSpec(undefined)` lanza.

El endpoint estuvo roto desde que existe (el form del admin se movió
verbatim a página dedicada - no es regresión del refactor). Los specs
no lo vieron porque instancian el controller sin el pipe.

## Fix

- `CampaignDto.audience`: `@IsDefined() @ValidateNested()
  @Type(() => AudienceDto)` - preserva y valida el nested; sin
  audience en el body → 400, no 500.
- `CampaignPatchDto.audience` ya sobrevivía (`@IsOptional` cuenta
  como decorador) - sin cambio necesario, cubierto por test.
- Spec: test de regresión corriendo ambos DTOs por un
  `ValidationPipe` con la misma config que `main.ts`.
- Export de `AudienceDto`/`CampaignDto`/`CampaignPatchDto` para el
  spec.

Sin delta de spec: la spec `admin-jobs-mail-campaigns` ya exige el
alta de campañas - esto es un bug de implementación, no un cambio de
contrato.
