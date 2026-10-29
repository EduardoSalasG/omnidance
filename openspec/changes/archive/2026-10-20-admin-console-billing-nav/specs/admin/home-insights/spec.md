# admin/home-insights; delta admin-console-billing-nav

## ADDED Requirements

### Requirement: KPIs de plataforma en el inicio del admin

El `GET /home/stats` de la lente ADMIN SHALL devolver, además de los
KPIs operativos existentes (solicitudes de rol, usuarios, eventos
activos, liquidaciones pendientes), tres KPIs de conversión y
monetización: `leadsNew` (cantidad de `Lead` en status `NEW`),
`txRevenueMonth` (suma de `platformFeeNetClp + platformFeeVatClp` de
pagos `PAID` del mes calendario en hora Chile, excluyendo
`PLATFORM_SUB`) y `subRevenueMonth` (suma de `amount` de pagos `PAID`
`PLATFORM_SUB` del mismo período), ambos con `format: "clp"`.

#### Scenario: KPI de leads por revisar

- **WHEN** existen 3 leads en status NEW y 2 CONTACTED
- **THEN** `leadsNew` vale 3 (CONTACTED/CONVERTED/DISCARDED no cuentan)

#### Scenario: ingreso del mes por transacciones

- **WHEN** en el mes corriente (hora Chile) hay pagos PAID con fees y un
  pago PLATFORM_SUB PAID
- **THEN** `txRevenueMonth` suma solo los fees de los pagos
  no-PLATFORM_SUB y `subRevenueMonth` suma el monto del PLATFORM_SUB

#### Scenario: highlight accionable

- **WHEN** `leadsNew` > 0
- **THEN** la card del KPI se destaca con borde de acento (mismo
  tratamiento que solicitudes de rol / liquidaciones pendientes)

### Requirement: Cola "Leads por revisar" en el inicio

El inicio del admin SHALL mostrar una sección con los leads en status
`NEW` (más antiguos primero, tope ~6 filas: nombre, email, intent y
fecha) que navega a la entidad `leads` de `/admin/datos`; con más
pendientes que filas, el footer "Ver todos" indica el total y lleva a
`/admin/datos?entity=leads&status=NEW`. Sin leads NEW la sección no se
renderiza.

#### Scenario: fila navega a la revisión

- **WHEN** el admin toca un lead de la lista
- **THEN** llega a `/admin/datos` con la entidad `leads` y el filtro
  `status=NEW` precargados

### Requirement: `/admin/datos` lee entidad y filtros desde la URL

`/admin/datos` SHALL inicializar la entidad activa y los filtros desde
`?entity=<entity>&<filterKey>=<value>` cuando el query param está
presente y la entidad existe en el catálogo ADMIN; valores inválidos se
ignoran y caen al default actual.

#### Scenario: deep link desde el home

- **WHEN** el admin entra a `/admin/datos?entity=leads&status=NEW`
- **THEN** la página carga la entidad leads filtrada por status NEW sin
  interacción adicional
