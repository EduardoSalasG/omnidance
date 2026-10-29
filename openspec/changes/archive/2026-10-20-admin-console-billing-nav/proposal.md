# Proposal; admin-console-billing-nav

## Why

La consola del admin de sistema tiene tres problemas de navegación y
superficie: (1) en móvil mantiene un bottom tab bar de 4 destinos que no
cubre sus ~11 módulos; owner y productor ya resolvieron esto siendo
consoles "drawer-only"; (2) el drawer/sidebar no lista todas las páginas
de admin: `/admin` (hub), `/admin/finanzas`, `/admin/facturacion`,
`/admin/jobs`, `/admin/campanas` y `/admin/academias` son inalcanzables
por navegación; (3) el inicio del rol admin solo muestra 4 KPIs
operativos y la superficie de monetización (transacciones y
suscripciones) vive embutida como tabs de `/admin/finanzas`, sin página
dedicada con el patrón de insights del resto de consolas.

## What Changes

- **Admin pasa a ser consola drawer-only en móvil**: `ADMIN` entra a
  `MOBILE_DRAWER_ONLY`; sin bottom tab bar, el drawer lateral es la
  navegación (mismo patrón que ACADEMY_OWNER y PRODUCER). En desktop no
  cambia nada (la sidebar ya existía).
- **Cobertura completa del drawer/sidebar admin**: el grupo Admin gana
  el hub `/admin`, `/admin/academias`, `/admin/campanas` y `/admin/jobs`;
  el grupo home móvil (Inicio, primero) se agrega para drawer-only.
- **Sección "Facturación" en el drawer/sidebar** con 4 destinos:
  Transacciones (`/admin/facturacion/transacciones`, nueva),
  Suscripciones (`/admin/facturacion/suscripciones`, nueva),
  Documentos (`/admin/facturacion`, existente, match exacto) y Finanzas
  (`/admin/finanzas`, existente).
- **Inicio del rol admin enriquecido**: `/home/stats` (lente ADMIN) suma
  KPIs "Leads por revisar" (Lead status NEW), "Ingreso por transacciones
  del mes" (fee neto + IVA de pagos PAID no-PLATFORM_SUB, mes calendario
  Chile) e "Ingreso por suscripciones del mes" (cobros PLATFORM_SUB PAID
  del mes) + sección "Leads por revisar" con lista accionable hacia
  `/admin/datos`.
- **`/admin/datos` acepta `?entity=` + filtros por URL**: deep-link
  desde el home (`?entity=leads&status=NEW`) precarga entidad y filtros.
- **Página Transacciones**: KPI cards del mes vía
  `GET /admin/finance/summary` (ingreso plataforma, GMV transaccional,
  costo pasarela, por transferir) + desglose por segmento + `FilterBar`
  + lista de pagos vía `/admin/browse/payments`.
- **Página Suscripciones**: KPI cards vía `GET /admin/finance/mrr`
  (MRR, ARR, activas, contratos a convenir) + desglose por tier y funnel
  de estados (clickeable como filtro) + lista de suscripciones.
- Sin cambios de schema ni endpoints nuevos: se reusa
  `/admin/finance/*` y `/admin/browse/*`; `adminStats()` se extiende en
  `HomeService`.

## Capabilities

- **New Capabilities**: `admin/home-insights`; KPIs e insights de la
  página de inicio del rol ADMIN.
- **Modified Capabilities**:
  - `responsive-app-shell`; ADMIN se suma a las consolas drawer-only
    en móvil y su drawer cubre todos los destinos de la consola.
  - `admin-finance/console`; la superficie de monetización gana páginas
    dedicadas Transacciones y Suscripciones bajo `/admin/facturacion/*`
    dentro de la sección Facturación.

## Impact

- `apps/web/src/components/layout/BottomNav.tsx`; drawer-only admin,
  grupos del drawer (nuevos ítems + sección Facturación).
- `apps/web/src/components/home/HomeHub.tsx` + `kpi-grid.tsx`; KPIs y
  sección de leads para la lente ADMIN.
- `apps/api/src/home/home.service.ts`; `adminStats()` extendido
  (KPIs de facturación del mes + cola de leads NEW).
- `apps/api/src/admin/infrastructure/finance.controller.ts`; extrae
  `clMonthStart` a `src/common/cl-time.ts` para reusarlo en home.
- Páginas nuevas: `admin/facturacion/transacciones/page.tsx`,
  `admin/facturacion/suscripciones/page.tsx`; `/admin/datos` gana seed
  de estado desde query params.
- i18n: keys nuevas en `messages/es-CL.json` (home) y
  `src/i18n/parts/admin.json` (módulos + páginas).
- `docs/qa-flows-inventory.md`; actualización del inventario de flujos
  admin (regla viva del repo).
