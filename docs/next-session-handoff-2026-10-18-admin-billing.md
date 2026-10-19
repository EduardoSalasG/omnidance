# Handoff — admin console: drawer-only móvil + home con KPIs + sección Facturación

**Rama**: `dev` · **Fecha**: 2026-10-18 · **Change**: `openspec/changes/admin-console-billing-nav` (validado, sin archivar — falta QA funcional)

## Qué quedó hecho (sin commit)

- **Admin drawer-only en móvil**: `"ADMIN"` → `MOBILE_DRAWER_ONLY` en `BottomNav.tsx`. Sin tab bar; el drawer es la única nav (patrón owner/productor). `data-notabbar` quita el padding.
- **Drawer/sidebar admin completo**: `MOBILE_HOME_GROUP()` (Inicio primero) + grupo Admin (Panel `/admin` `exact` + roles/params/usuarios/datos/academias/campanas/jobs/auditoria/catalogos — antes academias/campanas/jobs/hub eran inalcanzables) + **grupo Facturación** nuevo (transacciones, suscripciones, documentos `/admin/facturacion` `exact`, finanzas). En ≥lg el grupo de tabs queda solo Inicio.
- **Home admin (`/inicio`)**: `adminStats()` en `home.service.ts` suma `leadsNew`, `txRevenueMonth` (fees neto+IVA PAID no-PLATFORM_SUB, mes CL) y `subRevenueMonth` (PLATFORM_SUB PAID mes) + `pendingLeads{count,items}` (NEW asc, 6). `leadsNew` entra a `ATTENTION_KEYS` del KpiGrid. HomeHub renderiza sección "Leads por revisar" → `/admin/datos?entity=leads&status=NEW`.
- **`clMonthStart` extraído** a `apps/api/src/common/cl-time.ts` (finance.controller lo importa; home.service lo reusa — mismo mes calendario Chile).
- **`/admin/datos` deep-link**: `?entity=<e>&<filterKey>=<v>` siembra entidad+filtros declarados tras cargar el catálogo (vía `window.location.search`, la página es client-only).
- **Páginas nuevas**: `admin/facturacion/transacciones` (KPIs `finance/summary` + FilterBar payments + `browse/payments` default PAID) y `admin/facturacion/suscripciones` (KPIs `finance/mrr` + byTier + funnel clickeable client-side + lista). `KpiCard` extraído a `components/admin/kpi-card.tsx` (finanzas lo adopta).
- **i18n**: `home.kpi.*` + `home.leads*` en `messages/es-CL.json`; `admin.modules.panel|transactions|subscriptions|documents`, `navGroups.billing`, `tx.*`, `subs.*` en `parts/admin.json`.
- **QA inventory** actualizado (sección 9 admin).

## Verificación (evidencia)

- `pnpm --filter @omnidance/api typecheck` → limpio · `npx tsc --noEmit` web → limpio · `node scripts/i18n-audit.cjs` → `ALL_KEYS_OK` · eslint archivos tocados → 0 errores (6 warnings preexistentes) · `openspec validate --changes` → verde para este change (`fix-hydration-localstorage` falla preexistente, no es de esta sesión).

## Pendiente

- **Smoke manual sin hacer**: el dev server API estaba apagado (handoff anterior). Verificar en vivo: drawer admin móvil completo, home con KPIs+leads, deep-link datos, ambas páginas nuevas con seed.
- `impeccable detect --json` **no corrió** — el CLI no está instalado (`npx impeccable` falta). Instalarlo o correr la regla del skill a mano sobre las 2 páginas nuevas.
- Commit + archivar el change OpenSpec cuando QA pase.
- `skills-lock.json` quedó untracked de antes — no es de esta sesión.
