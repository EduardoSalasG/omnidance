# Handoff 2026-11-06 - selector de academia en la nav del owner

## Estado

Branch `dev` pusheada a origin: `0eac24a2`. Tag `v1.15.5` creado y
pusheado. Working tree limpio.

## Release y deploy (v1.15.5, en producción)

- **Promoción**: merge `dev`→`main` + bump a `1.15.5` en los 3
  `package.json` (raíz, api, web), commit `release: 1.15.5` →
  `main` = `8f1624ab`. Recordar: los bumps de versión se hacen SOLO
  en `main` al promover; en `dev` quedan atrasados (1.14.0) y el
  merge los reconcilia.
- **Deploy workflow** (`deploy-api-docker.yml`, corre solo sobre
  `main` con cualquier push, no necesita commit "release:"): run
  42295114288 success en 8m2s - tests, build, docker push GHCR,
  migraciones Neon, seed prod, health check y probe Nginx verdes.
- **Verificación prod**: `api.omnidance.eduardosalasg.dev/api/health`
  200, `/api/me` 401.
- Ojo: `dev` y `main` vuelven a divergir tras la promoción (merge
  commit + release en main); al próximo ciclo repetir merge
  dev→main.

## Hecho esta sesión

- **AcademySwitcher** (`apps/web/src/components/academy/
  academy-switcher.tsx`): selector de academia en el drawer móvil
  (SideDrawer, prop `header`) y la sidebar desktop (AppSidebar, prop
  `header`, solo modo expandido - el riel w-16 no tiene ancho). Montado
  en BottomNav cuando `meChecked && activeRole === "ACADEMY_OWNER"`.
  - Visibilidad: `owned.length > 1 || canAddAcademy` (owned =
  `a.ownerId === me.id`; canAddAcademy = rol ACADEMY_OWNER
  APPROVED/PENDING + (admin || 0 propias || multiAcademy en alguna
  propia)). Membresías de instructor/staff NO habilitan el selector.
  - Opciones: universo `/academies/mine` con el mismo dedup del gate
  (id + nombre normalizado) + "＋ Nueva academia" → `/academia/nueva`.
- **Propagación sin recarga** (`apps/web/src/lib/academy-selection.ts`):
  `ACADEMY_STORAGE_KEY` + `ACADEMY_CHANGED_EVENT` +
  `selectStoredAcademy(id)` (escribe storage + dispatch) +
  `useStoredAcademyId()` (useSyncExternalStore sobre el evento +
  `storage` nativo para otras pestañas). shared.ts re-exporta las
  constantes por compatibilidad.
  - Consumidores: AcademyGate (listener → selectedId + dispatch en
  selectAcademy), useActorEntitlements (stored reactivo → re-filtro
  del drawer por feature), crm-context (actor memo depende de
  `stored`), /academia/nueva (selectStoredAcademy post-crear).
  - El switcher refetchea `/academies/mine` UNA vez si el id
  persistido no está en su lista (academia recién creada,
  `retriedFor` ref).
- **Docs sincronizadas**: qa-flows-inventory (§0 gates + §8 Hub +
  invite de alumno en Alumnos), omni-dance.md (fila "Selector de
  academia" + invite en Alumnos + export en Cobros),
  architecture.md (enrollments email+name invite, billing-report
  csv/pdf, cascada dependsOn levelId→seriesId→slotId→instructorId +
  academyLevels en QueryModule). openapi.json + postman regenerados
  (371 paths).
- **OpenSpec**: change `academy-sidebar-switcher` archivado como
  `2026-11-06-academy-sidebar-switcher`; requirement nuevo en
  `openspec/specs/academies/console-lists`.

## Verificación (evidencia)

- `pnpm --filter @omnidance/web typecheck`: exit 0.
- eslint sobre los 10 archivos tocados: 0 errores (3 warnings
  preexistentes: getNumFmt/ClassSlot en shared.ts, Me en BottomNav).
- `pnpm --filter @omnidance/web test` (vitest): 9 files, 32/32 tests.
  Los IntlError `query.saved.delete*` en el log son artefacto del
  harness (tests montan messages parciales), preexistente.
- impeccable `detect --json` sobre los 4 archivos UI: `[]`.
- `openspec validate --changes`: 2/2 verde antes de archivar.

## Gap de prueba pendiente

- Smoke visual real del switcher (el dev server web no estaba vivo;
  API :4000 sí). Verificar en navegador: owner con 2 academias ve el
  select en sidebar + drawer, cambia y la página refetchea sola;
  owner mono-academia sin PRO no ve nada.

## Deferido por el usuario (sigue pendiente)

- Modelo de video (categorías/selects, videos como add-on cobrado).
- Tracking de campañas (funnel enviados→tap→acción; `campaignId` en
  push + evento de apertura).
- Ads/conversión en Explorar + disponibilidad de instructores.
