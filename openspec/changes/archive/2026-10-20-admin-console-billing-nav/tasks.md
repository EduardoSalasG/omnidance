# Tasks — admin-console-billing-nav

## 1. API

- [x] Extraer `clMonthStart` de `admin/infrastructure/finance.controller.ts`
      a `src/common/cl-time.ts` e importarlo en ambos.
- [x] `home.service.ts` `adminStats()`: sumar KPIs `leadsNew`,
      `txRevenueMonth` (clp), `subRevenueMonth` (clp) y
      `pendingLeads {count, items[6]}` (status NEW, createdAt asc) al
      `HomeStats` de la lente ADMIN (type `HomeStats` + type en web).

## 2. Navegación (BottomNav.tsx)

- [x] `"ADMIN"` → `MOBILE_DRAWER_ONLY` (+ comentario actualizado).
- [x] `DRAWER_BY_ROLE.ADMIN`: prepend `MOBILE_HOME_GROUP()`; grupo Admin
      agrega `/admin` (exact, icon admin) + academias/campanas/jobs;
      nuevo grupo "Facturación" (labelKey `modules.facturacion`) con
      transacciones, suscripciones, `/admin/facturacion` (exact,
      Documentos) y `/admin/finanzas`.
- [x] i18n: `admin.modules.panel|transactions|subscriptions|documents`,
      `admin.navGroups.billing` en `parts/admin.json`.

## 3. Home admin (HomeHub + kpi-grid)

- [x] `kpi-grid.tsx`: `leadsNew` en `ATTENTION_KEYS`.
- [x] `HomeHub.tsx`: tipo `pendingLeads` en HomeStats + sección "Leads
      por revisar" para ADMIN (lista + Ver todos →
      `/admin/datos?entity=leads&status=NEW`), patrón listCls/rowLink.
- [x] i18n: `home.kpi.leadsNew`, `home.kpi.txRevenueMonth`,
      `home.kpi.subRevenueMonth`, `home.leads*` en
      `messages/es-CL.json`.

## 4. `/admin/datos` deep-link

- [x] Seed de `entity`+`filters` desde `useSearchParams` al resolver
      el catálogo (one-shot; inválido → default).

## 5. Páginas nuevas

- [x] `components/admin/kpi-card.tsx`: `<Kpi>` extraído de
      finanzas/page.tsx (finanzas adopta el import).
- [x] `admin/facturacion/transacciones/page.tsx`: AdminGate +
      ConsoleHeader + KPIs (summary mes) + desglose por segmento +
      FilterBar(PAYMENTS_DEF) + lista browse/payments (default PAID).
- [x] `admin/facturacion/suscripciones/page.tsx`: AdminGate +
      ConsoleHeader + KPIs (mrr/arr/activas/custom) + byTier + funnel
      clickeable (filtro client-side) + lista subscriptions.
- [x] i18n `admin.tx.*` / `admin.subs.*` en `parts/admin.json`.

## 6. Cierre

- [x] `docs/qa-flows-inventory.md`: flujos nuevos/actualizados (admin
      drawer-only, home admin, datos?entity=, ambas páginas).
- [x] Verificación: typecheck web+api, lint web, i18n-audit,
      impeccable detect, smoke manual móvil+desktop.
- [x] `openspec validate --changes` verde.
