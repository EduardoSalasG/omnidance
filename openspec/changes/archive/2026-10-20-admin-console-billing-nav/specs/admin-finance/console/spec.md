# admin-finance/console — delta admin-console-billing-nav

## ADDED Requirements

### Requirement: Página Transacciones

El sistema SHALL exponer a `admin.access` la página
`/admin/facturacion/transacciones` con el patrón de consola (KPI cards
del mes + insight + listado): KPIs del período corriente de
`GET /admin/finance/summary` (ingreso plataforma, GMV transaccional,
costo de pasarela, por transferir), un desglose por segmento
(social/academia/SaaS/métodos propios), `FilterBar` con la EntityDef
`payments` del catálogo ADMIN y el listado de
`GET /admin/browse/payments` (default status PAID, cap del browse).

#### Scenario: KPIs del mes al abrir

- **WHEN** el admin abre Transacciones
- **THEN** las cards muestran los agregados del mes calendario en curso
  (hora Chile) y el listado arranca en PAID

#### Scenario: filtros auto-aplicados

- **WHEN** el admin cambia status, orderType o rango de fechas
- **THEN** el listado se recarga con los params whitelisted del browse;
  los KPIs del mes no cambian (son del período, no del filtro)

### Requirement: Página Suscripciones

El sistema SHALL exponer a `admin.access` la página
`/admin/facturacion/suscripciones` con KPI cards de
`GET /admin/finance/mrr` (MRR, ARR, suscripciones ACTIVE, contratos a
convenir), desglose por tier (`byTier`), funnel de estados no-CANCELED
clickeable como filtro del listado, y la lista de suscripciones
(kind, actor, tier, ciclo, status, monto mensual equivalente y próximo
cobro).

#### Scenario: filtro por estado

- **WHEN** el admin toca un estado del funnel (p.ej. PAST_DUE)
- **THEN** el listado muestra solo suscripciones de ese estado; volver
  a tocarlo limpia el filtro

### Requirement: Estados y navegación de las nuevas páginas

Ambas páginas SHALL cumplir el patrón de consola: gate `admin.access`
(loading skeleton / unauth / forbidden explícitos), loading con
`SkeletonList`/cards en `.page-loading`, error `role="alert"` con
reintento, empty states con mensaje, y figuran como destinos raíz del
drawer/sidebar (sin back de ConsoleHeader — la navegación es el
chrome).

#### Scenario: deep link directo

- **WHEN** el admin entra por URL directa a
  `/admin/facturacion/suscripciones`
- **THEN** la página carga datos propios sin depender de la navegación
  previa y el ítem "Suscripciones" se marca activo en el chrome
