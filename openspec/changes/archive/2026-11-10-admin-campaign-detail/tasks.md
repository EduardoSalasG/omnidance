# Tasks: admin-campaign-detail

- [x] 1. i18n: claves `admin.campaigns.detail.*` y
  `admin.campaigns.runs.*` en `apps/web/src/i18n/parts/admin.json` +
  `en/`, `fr/`, `pt-PT/`
- [x] 2. Ficha `apps/web/src/app/[locale]/(app)/admin/campanas/[id]/page.tsx`:
  fetch paralelo `GET :id` + `GET :id/runs`; header desnudo (Link a
  editar solo si DRAFT/SCHEDULED); `<dl>` de datos; preview iframe
  sandbox; historial con `LIST_PREVIEW` + `SeeAllRow`; acciones
  test/run/cancel con `ConfirmSheet` + `ActionNotice`; estados
  loading/error/404
- [x] 3. Listado `campanas/page.tsx`: card → `Link` a ficha
  (`hover:border-neon/60` + `ChevronRightIcon`), retirar acciones
  inline y el `ConfirmSheet`/`act`/`busy`/`pending` locales
- [x] 4. Test `campanas/[id]/page.test.tsx`: render detalle + runs,
  acciones (test sin confirm, run/cancel con ConfirmSheet), 404
- [x] 5. `docs/qa-flows-inventory.md`: entrada de campañas admin con
  la ficha y el nuevo flujo card → ficha
- [x] 6. Verificación: `pnpm --filter @omnidance/web build` o
  typecheck web, test del archivo, `node scripts/i18n-audit.cjs`
