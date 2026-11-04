# Proposal: videos-ficha-edit

## Why

Completa el scope `impl-videos` de `console-audit-fixes` (archivado): la
ficha `/academia/videos/[id]` quedó solo lectura porque no existían
`GET`/`PATCH` por id. Esos endpoints ya están en HEAD (commit
`86b810ee`); sin este cambio la ficha sigue escaneando el listado
paginado y la edición no es accesible desde la UI.

## What Changes

- La ficha resuelve el video con `GET /academies/:id/videos/:videoId`
  (fuera el scan paginado).
- `VideoForm` gana modo edición (prop `video`): PATCH
  `/academies/:id/videos/:videoId`, `classId` vacío desvincula con
  `null`; el modo create queda intacto.
- La ficha pasa a ser la página de edición dedicada (console-crud-flows)
  conservando el link externo y la zona destructiva con delete.
- i18n: `academyExtras.videos.editTitle` + `saved` (4 locales);
  inventario QA de Videos actualizado.

## Capabilities

- **New Capabilities**: `academies/videos` - detalle por id con máscara
  locked, actualización con gate de mutación, ficha como página de
  edición.

## Impact

- Web: `components/academy/video-form.tsx`,
  `app/[locale]/(app)/academia/videos/[id]/page.tsx`,
  `components/academy/videos.tsx` (doc), parts i18n, e2e smoke nuevo.
- API: sin cambios (endpoints ya en HEAD).
- Docs: `docs/qa-flows-inventory.md` sección Videos.
