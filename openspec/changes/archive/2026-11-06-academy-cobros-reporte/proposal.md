# Proposal: academy-cobros-reporte

## Why

La revisión UX de la consola del owner
(`docs/academy-console-ux-review-2026-11-05.md`, slice "Cobros +
métodos de pago + suscripción" y bugs confirmados 5-9) encontró en el
módulo de cobros:

- `/academia/cobros/reporte` existe pero solo se entra por un botón
  dentro de Cobros; como destino propio del owner debe vivir en el
  drawer/sidebar como ítem "Reporte" bajo "Cobros".
- La página de cobros mezcla cola operativa (pagos por validar) con el
  historial completo y dos bloques de filtros redundantes: el historial
  lo cubre el reporte, los filtros de cola buscaban en resueltos.
- Terminología inconsistente: "Cobros por revisar" (inicio) vs "pagos
  por validar" (cobros); "Suscripciones por validar" para lo que en
  realidad son inscripciones/renovaciones por transferencia; "medio de
  pago" vs "método de pago".
- Valores crudos de pasarela (`credit_card`, `FLOW`, `bank_transfer`)
  visibles en historial, colas y detalle de cobro.
- "Ver todos" de "planes que vencen esta semana" navega a alumnos en
  vez de expandir la lista en el lugar (patrón SeeAllRow).
- El back de la ficha de claim siempre vuelve a `/academia/cobros`
  aunque el click vino del reporte (breadcrumb roto; `?from=` ya existe
  en clases/horarios).
- `/cobros/reporte` tiene títulos de KPI cortados, filas densas
  ilegibles y sin agregado por método de pago.
- Métodos de pago: el form pide un "orden" que el owner no entiende
  (el orden es el de llegada) y el CTA de alta no tiene jerarquía
  primaria.
- Suscripción: el historial de cobros no es navegable al detalle del
  cobro y falta aire entre "Ciclo de facturación" y sus opciones.

## What Changes

- **Nav owner**: nuevo ítem "Reporte" (`/academia/cobros/reporte`) en
  el grupo Administración, debajo de Cobros; el ítem Cobros pasa a
  match `exact` para no robarle el activo.
- **`/academia/cobros`**: queda con KPIs + planes que vencen + colas
  (pagos por validar + inscripciones por validar). Sale el historial
  unificado (lo cubre el reporte) y los dos FilterBar de las colas
  (búsqueda histórica vive en el reporte).
- **Terminología unificada**: "por validar" en toda la superficie
  (incluye el KPI del inicio), "Inscripciones por validar" para la cola
  de órdenes MEMBERSHIP manuales (cubre alta y renovación), "método de
  pago" en toda la superficie y el checkout del alumno.
- **Métodos crudos normalizados**: mapa i18n `payments.media.*` /
  `payments.gateways.*` aplicado en reporte, historial y detalle de
  cobro.
- **"Ver todos" in-place**: `ExpiringList` expande con
  `SeeAllRow`+preview en vez de navegar a alumnos.
- **`?from=` en fichas de cobro**: claim/orden/pago vuelven al origen
  (cola o reporte) vía `useSearchParams` + `safeInternalPath`, y la
  navegación post-aprobar/rechazar respeta el origen.
- **Rediseño `/cobros/reporte`**: KPIs solo "Facturado" y "Alumnos";
  nueva sección "Métodos de pago" con un KPI por método y su total
  (agregado `byMethod` nuevo en `GET /academies/:id/billing-report`);
  filas → cards de 4 líneas (nombre, plan, método, fecha) + monto +
  chip de estado; paginación 20 desktop / 10 mobile (hook
  `useConsolePageSize`, regla nueva del proyecto).
- **Métodos de pago**: sale el campo "orden" del alta y la edición
  (el orden es el de llegada); CTA "+ Agregar" primario a la derecha
  del título encima de la descripción.
- **Suscripción**: invoices clickeables → `/academia/cobros/pago/[id]`
  (el endpoint acepta refs `platsub_` de la academia y devuelve
  tier/ciclo como contexto traducible); separación visible entre
  "Ciclo de facturación" y las opciones Mensual/Semestral/Anual.

## Impact

- Affected specs: `academies/payment-claims`, `academies/console-lists`,
  `academy-console`, `academy-billing`.
- Affected code:
  - `apps/web/src/components/layout/BottomNav.tsx` (ítem Reporte,
    exact de Cobros).
  - `apps/web/src/app/[locale]/(app)/academia/cobros/page.tsx`,
    `cobros/reporte/page.tsx`, `cobros/claim/[id]/page.tsx`,
    `cobros/orden/[id]/page.tsx`, `cobros/pago/[id]/page.tsx`.
  - `apps/web/src/components/academy/{claims-queue,
    order-claims-queue, cobros-expiring, payment-methods-admin,
    academy-billing}.tsx`, `academy-dashboard.tsx` (`ExpiringList`),
    borrado de `cobros-history.tsx`.
  - `apps/web/src/app/[locale]/(app)/academia/configuracion/
    metodos-de-pago/{nuevo,[methodId]}/page.tsx`.
  - `apps/web/src/lib/console-page-size.ts` (nuevo),
    `components/payments/shared.ts` (labels de método).
  - i18n: `parts/academyPay.json`, `parts/academyExtras.json`,
    `parts/payments.json`, `parts/tours.json` (es-CL).
  - API: `academy-claims.service.ts` (`byMethod`),
    `academies.controller.ts` (`platsub_` en detalle de pago).
  - `docs/qa-flows-inventory.md` (secciones cobros, métodos,
    suscripción) en el mismo cambio.
