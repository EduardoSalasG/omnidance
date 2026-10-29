# Design; admin-console-billing-nav

## Decisiones

- **Drawer-only por `MOBILE_DRAWER_ONLY`**: agregar `"ADMIN"` al set
  existente. `showTabBar=false` → sin tab bar, `data-notabbar` quita el
  padding, `hasDrawerItems` mantiene la hamburguesa. Mismo mecanismo
  probado de owner/productor; cero código nuevo de chrome.
- **Drawer admin completo**: `DRAWER_BY_ROLE.ADMIN` =
  `MOBILE_HOME_GROUP()` (Inicio primero, mobileOnly) + grupo Admin
  (hub `/admin` `exact` + roles/parametros/usuarios/datos/academias/
  campanas/jobs/auditoria/catalogos) + grupo Facturación
  (transacciones, suscripciones, `/admin/facturacion` `exact`,
  `/admin/finanzas`) + CRM + Analítica + Social. `/admin` y
  `/admin/facturacion` llevan `exact: true` porque su prefijo cubre
  sub-páginas. En `≥lg` el grupo de tabs queda solo con Inicio
  (el resto se deduplica contra drawerHrefs); mismo resultado que
  producer/owner.
- **Home admin = `/home/stats` extendido, no endpoint nuevo**:
  `adminStats()` suma `leadsNew`, `txRevenueMonth` (clp),
  `subRevenueMonth` (clp) y `pendingLeads{count,items}` (NEW, asc,
  take 6). HomeStats ya es el contrato por-lente; KpiGrid renderiza
  labels por `home.kpi.<key>` y `leadsNew` entra a `ATTENTION_KEYS`.
- **`clMonthStart` extraído a `apps/api/src/common/cl-time.ts`**:
  finance.controller lo importa (hoy es función local); home.service
  lo reusa para el mismo mes calendario Chile que la consola.
  txRevenueMonth = Σ(net+vat) de PAID no-PLATFORM_SUB; subRevenueMonth =
  Σamount de PAID PLATFORM_SUB; misma semántica que
  `platformRevenue.net/vat` y `gmv.saas` del summary.
- **`/admin/datos` seed por URL**: un efecto one-shot lee
  `useSearchParams` al montar (tras cargar el catálogo): `entity`
  válido → `setEntity`, y cada key de `entityDef.filters` presente en
  la URL → `filters`. Invalid → default actual. `useSearchParams`
  requiere Suspense boundary; la page es client component dentro del
  shell que ya provee boundaries (verificar; si Next exige, envolver
  en `<Suspense>`).
- **Nuevas páginas reusando endpoints**:
  - `transacciones/page.tsx`: `GET /admin/finance/summary?from=<mes>&to=<hoy>`
    para KPIs + desglose; `GET /admin/browse/payments?status=PAID` +
    FilterBar con `entityDef("ADMIN","payments")` para la lista
    (misma query que el tab payments de finanzas).
  - `suscripciones/page.tsx`: `GET /admin/finance/mrr`; KPIs, byTier,
    funnel (chips filtran client-side) y lista de subscriptions.
  - Ambas: `AdminGate`, `ConsoleHeader` (se auto-oculta por
    isSidebarRoute), skeleton `.page-loading`, `role="alert"` + retry,
    empty states.
- **Kpi compartido**: el `<Kpi label value hint>` vive local en
  finanzas/page.tsx; se extrae a `components/admin/kpi-card.tsx` y lo
  consumen las dos páginas nuevas (finanzas lo adopta para no
  duplicar).
- **i18n**: keys nuevas en `messages/es-CL.json` → `home.kpi.leadsNew`,
  `home.kpi.txRevenueMonth`, `home.kpi.subRevenueMonth`,
  `home.leads*`; en `parts/admin.json` → `modules.panel`,
  `modules.transactions`, `modules.subscriptions`, `modules.documents`,
  `navGroups.billing`, `tx.*`, `subs.*`, `leadsSection` si aplica.

## Riesgos

- `useSearchParams` en datos/page: ya es `"use client"`; el shell monta
  la page bajo su propio árbol; si el build exige Suspense se envuelve
  el panel.
- `adminStats` corre para cualquier admin en cada carga de /inicio:
  dos agregados extra sobre `Payment` + `Lead` indexados por
  createdAt/status; barato.
- El KPI `txRevenueMonth` excluye PLATFORM_SUB para no doble-contar:
  las subs de plataforma no llevan platformFee (su monto ES el ingreso).

## Verificación

- `pnpm --filter @omnidance/web typecheck` + `pnpm lint` web.
- `node scripts/i18n-audit.cjs` → ALL_KEYS_OK.
- `pnpm --filter @omnidance/api typecheck` + tests de admin si existen
  (finance.controller.spec).
- `impeccable detect --json` sobre las nuevas páginas.
- Smoke manual: admin móvil sin tab bar; drawer completo; home con
  KPIs+leads; deep link datos?entity=leads&status=NEW; ambas páginas
  con datos del seed.
- `docs/qa-flows-inventory.md` actualizado (sección admin).
