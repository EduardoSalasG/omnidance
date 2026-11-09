# admin/home-insights Specification

## Purpose
TBD - created by archiving change admin-console-billing-nav. Update Purpose after archive.

## Requirements

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

### Requirement: Panel de trials de plataforma en el inicio

El inicio del admin SHALL mostrar una sección de trials de plataforma
con tres KPIs: `trialsActive` (academias con `trialEndsAt` futuro más
personas con `proTrialEndsAt` futuro), `trialsExpiring` (los que
vencen en los próximos 7 días) y `trialsExpired` (trial vencido sin
suscripción viva del actor); y una lista con nombre, rol, email, tier
del trial, fecha fin y días restantes, navegable a la ficha del
actor. Sin trials activos ni por vencer la sección no se renderiza.

#### Scenario: KPIs separan activos, por vencer y vencidos

- **GIVEN** 3 academias en trial (una vence en 3 días), 2 productores
  en trial y 1 academia con trial vencido sin suscripción
- **THEN** `trialsActive` vale 5, `trialsExpiring` vale 1 y
  `trialsExpired` vale 1

#### Scenario: fila navega a la ficha del actor

- **WHEN** el admin toca una academia de la lista de trials
- **THEN** llega a su ficha `/admin/academias/:id` (o la ficha de la
  persona si es productor)

### Requirement: Tour de primera visita del inicio admin

En `/inicio` con lente ADMIN la app SHALL correr un tour de primera
visita (`onboarding["admin"]`, marcado una vez por persona vía
`POST /me/onboarding`) con pasos sobre las secciones del home (KPIs
agrupados de la plataforma, la cola "Leads por revisar" cuando existe)
y la navegación del chrome visible: la hamburguesa/drawer en `<lg` y la
sidebar en `≥lg`, además de la campana. Los pasos cuyo target no exista
(cola de leads vacía) SHALL omitirse sin bloquear el tour.

#### Scenario: tour en el home del admin

- **GIVEN** un admin que nunca vio el tour
- **WHEN** abre `/inicio` con lente ADMIN
- **THEN** el tour recorre los KPIs, la cola de leads si hay pendientes,
  la navegación del chrome y la campana, y al cerrarse marca
  `onboarding["admin"]`

#### Scenario: sin leads pendientes

- **GIVEN** un admin sin leads en status NEW
- **WHEN** corre el tour
- **THEN** el paso de la cola de leads se omite y el tour completa el
  resto
