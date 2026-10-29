# admin-finance/console Specification

## Purpose
TBD - created by archiving change admin-finance-console. Update Purpose after archive.

## Requirements

### Requirement: Consola de facturación admin

El sistema SHALL exponer a `admin.access` una consola
`/admin/finanzas` con KPIs del período y la trazabilidad completa
de la monetización: cobros por segmento, liquidaciones operables,
devengado no liquidado por actor y MRR SaaS.

#### Scenario: KPIs del período

- **WHEN** el admin abre `/admin/finanzas`
- **THEN** `GET /admin/finance/summary` devuelve GMV segmentado
  (social/academia/SaaS/métodos-propios), ingreso plataforma
  (neto + IVA + SaaS), costo real de pasarela y la cola de payouts
  PENDING/APPROVED con neto

#### Scenario: Sin permiso

- **WHEN** un actor sin `admin.access` llama `/admin/finance/*`
- **THEN** 401/403 según sesión

### Requirement: Devengado no liquidado por actor

El sistema SHALL reportar por actor los pagos PAID **sin
`PayoutLine`** atribuidos con las mismas reglas del settlement:
gross, deducción estimada y neto estimado; las comisiones
`OWN_METHOD_*` devengadas se reportan como receivable (el actor debe
a la plataforma), no como payable.

#### Scenario: Ticket sin liquidar

- **WHEN** un `Payment` PAID MANAGED de un evento del productor no
  tiene `PayoutLine`
- **THEN** aparece en el accrual del productor con
  `estimatedNet = producerNetClp` proyectado por la misma lógica
  que `computeSettlement`

#### Scenario: Orden ya liquidada no repite

- **WHEN** el pago ya tiene `PayoutLine` en un payout generado
- **THEN** no aparece en el accrual

#### Scenario: Método propio del actor

- **WHEN** el pago es `OWN_METHOD`/`OWN_GATEWAY` sin liquidar
- **THEN** no suma a `gross` ni `estimatedNet`; su comisión
  (`platformFeeNetClp+VatClp`) suma a `ownMethodReceivable`

### Requirement: Operación del ciclo de payout desde UI

El admin SHALL poder generar (actor + período), aprobar y marcar
pagado (con `evidenceUrl`) un payout desde la consola, usando los
endpoints existentes; cada línea del payout es visible agrupada por
tipo.

#### Scenario: Flujo completo

- **WHEN** el admin genera el payout de un actor desde "Por liberar"
- **THEN** queda PENDING con `lines[]`; al aprobarlo pasa a APPROVED;
  al marcar pagado con evidencia pasa a PAID con `paidAt`

### Requirement: MRR de suscripciones de plataforma

El sistema SHALL calcular MRR = Σ `monthlyAmount` de
`PlatformSubscription` ACTIVE donde `monthlyAmount = precio del tier
(PlatformParam) / meses del ciclo`; ENTERPRISE/PRO_BIG sin precio en
param se reportan como `customContracts` fuera del MRR.

#### Scenario: Normalización por ciclo

- **WHEN** una academia tiene sub ACTIVE anual de $239.760
- **THEN** su `monthlyAmount` es $19.980 y suma al MRR

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
drawer/sidebar (sin back de ConsoleHeader; la navegación es el
chrome).

#### Scenario: deep link directo

- **WHEN** el admin entra por URL directa a
  `/admin/facturacion/suscripciones`
- **THEN** la página carga datos propios sin depender de la navegación
  previa y el ítem "Suscripciones" se marca activo en el chrome
