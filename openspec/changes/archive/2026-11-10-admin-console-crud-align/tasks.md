# Tasks: admin-console-crud-align

## Web

- [x] 1.1 `components/admin/campaign-form.tsx`: `CampaignForm`
  extraído de `campanas/page.tsx` (mismas props/funcionalidad).
- [x] 1.2 `/admin/campanas/nueva/page.tsx`: crear + `?edit=<id>` con
  fetch `GET /admin/mail-campaigns/:id`, `ConsoleHeader` al listado,
  éxito → `showActionNotice` + vuelta al listado.
- [x] 1.3 `campanas/page.tsx`: eliminar `showForm`/`editing`/`CampaignForm`;
  "Nueva campaña" y "Editar" → navegación a la página dedicada.
- [x] 1.4 `catalogos/page.tsx`: empty state con mensaje
  (`adminCatalogs.empty` en es-CL/en/fr/pt-PT).
- [x] 1.5 `facturacion/promos/page.tsx`: `<Link><Button>` →
  `Button href` (un solo interactivo).

## Cierre

- [x] 2.1 `docs/qa-flows-inventory.md`: sección campañas admin
  documenta el flujo por páginas dedicadas.
- [x] 2.2 Verificación: `pnpm --filter @omnidance/web typecheck` OK,
  `node scripts/i18n-audit.cjs` ALL_KEYS_OK, `openspec validate
  --changes` OK.
