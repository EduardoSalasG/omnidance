# Tasks

1. [x] API: extender `CampaignSegment`, `parseSegment` (validación ACADEMY
   + pertenencia plan/serie), `resolveSegment` (allStudents /
   enrollmentStatus / planId / seriesId), y `CrmService.previewCampaign`
   → `{count}`; endpoint `POST /crm/campaigns/preview` en
   `crm.controller.ts` (mismo `assertActorAccess`).
2. [x] Specs API: unidad del service (resolución OR, validaciones 400) y
   e2e del endpoint preview si existe patrón en `apps/api/test`.
3. [x] Web: `types.ts` (nuevos campos), `campaign-form.tsx` — sección
   "Alumnos" para ACADEMY (todos/estados/plan/serie + picker de personas
   + preview debounced ~300ms), i18n `parts/crm.json`.
4. [x] `tsc --noEmit` api + web; specs API del módulo crm; regen
   openapi/postman (`node apps/api/scripts/export-api-docs.cjs`).
