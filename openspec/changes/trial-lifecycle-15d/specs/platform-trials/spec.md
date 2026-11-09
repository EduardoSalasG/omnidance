# platform-trials

## Purpose

Ciclo de vida del trial de los actores de plataforma (academia y
productor): otorgamiento, correos transaccionales de bienvenida y de
último día, oferta de conversión, corte de acceso al vencer y contacto
de Customer Experience.

## ADDED Requirements

### Requirement: Trial del productor al aprobar su rol

Toda transición de `PersonRole(PRODUCER)` a `APPROVED` (cola de
validación o grant directo de admin) SHALL setear
`Person.proTrialEndsAt = now + producer_pro.trial_days` días cuando la
persona no tenga suscripción Pro viva ni trial vigente.
`producer_pro.trial_days` SHALL ser un `PlatformParam` con default 15.
El trial SHALL operar a nivel PRO_STARTER, igual que el trial de
lanzamiento.

#### Scenario: productor aprobado recibe trial

- **GIVEN** una persona con `PersonRole(PRODUCER)` PENDING y sin
  suscripción Pro
- **WHEN** admin aprueba la solicitud
- **THEN** `proTrialEndsAt` queda a +15d y su tier efectivo es
  PRO_STARTER

#### Scenario: no reinicia trial vigente ni sub viva

- **WHEN** se aprueba el rol PRODUCER de una persona con
  `proTrialEndsAt` futuro o suscripción Pro viva
- **THEN** `proTrialEndsAt` no se modifica

### Requirement: Correo de bienvenida del trial

Al iniciarse el trial (academia: creación de la academia; productor:
aprobación del rol) el sistema SHALL enviar un correo transaccional
personalizado con el nombre y rol del registrado: bienvenida a la
plataforma, features clave de TODOS los tiers de su dominio con el
plan en prueba marcado, fecha de término del trial y presentación de
su contacto de Customer Experience. SHALL enviar además una ficha con
los datos del registro (nombre, email, teléfono, rol, tier del trial,
fecha fin) a la dirección del param `cx.notify_email`.

#### Scenario: academia nueva recibe bienvenida

- **GIVEN** una academia creada hoy por owner con email
- **THEN** el owner recibe el correo de bienvenida con los tiers de
  academia y "plan STUDIO" marcado como en prueba, y `cx.notify_email`
  recibe la ficha con sus datos

#### Scenario: persona sin email solo genera ficha admin

- **WHEN** el registrado no tiene email
- **THEN** no se envía el correo de bienvenida y la ficha llega igual
  a `cx.notify_email`

### Requirement: Correo de último día con oferta de conversión

Un barrido diario SHALL detectar trials que vencen en las próximas 24
horas (`Academy.trialEndsAt`, `Person.proTrialEndsAt`) sin marca de
avisado y enviar el correo de último día: invitación a suscribirse
con oferta del 50% del primer mes válida solo ese día. La oferta
SHALL materializarse como `PlatformPromo` del sistema
(`percentOff: 50`, `maxCycles: 1`, whitelist al actor) vigente hasta
el fin del día del envío. El barrido SHALL marcar
`Academy.trialEndNotifiedAt` / `Person.proTrialEndNotifiedAt` para
deduplicar.

#### Scenario: correo y promo el día del vencimiento

- **GIVEN** una academia cuyo `trialEndsAt` cae dentro de las próximas
  24h
- **WHEN** corre el barrido
- **THEN** el owner recibe el correo de último día y la academia queda
  en la whitelist de la promo 50% vigente hoy

#### Scenario: barrido idempotente

- **WHEN** el barrido corre dos veces sobre la misma academia
- **THEN** solo el primer paso envía correo (la marca de avisado
  excluye el segundo)

#### Scenario: suscripción tardía paga precio lleno

- **GIVEN** una academia que recibió la oferta ayer y no se suscribió
- **WHEN** se suscribe hoy
- **THEN** el cargo resuelve precio lleno (la promo venció)

### Requirement: Corte de la academia al vencer el trial

Una academia con `trialEndsAt` vencido y sin suscripción viva SHALL
quedar con features de consola vacías: la consola muestra solo
Inicio, Suscripción y Perfil, y en Inicio SHALL verse un aviso de
trial terminado con enlace a Suscripción. La academia SHALL
deslistarse de las superficies del dancer (explorar, directorio,
clases), sus clases SHALL dejar de ser reservables y su checkout
SHALL rechazar compras. Los endpoints de suscripción y facturación
SHALL seguir respondiendo (son la salida del estado). Al suscribirse,
todo vuelve sin intervención admin.

#### Scenario: módulo gated tras el vencimiento

- **GIVEN** una academia con `trialEndsAt` vencido ayer y sin
  suscripción
- **WHEN** alguien de su equipo llama a crear clase o marcar
  asistencia
- **THEN** recibe 403 `tier.required` y la consola solo enlaza
  Inicio, Suscripción y Perfil

#### Scenario: invisibilidad y rechazo dancer-facing

- **WHEN** la academia tiene el trial vencido sin suscripción
- **THEN** no aparece en explorar ni directorio, `POST
  /classes/:id/book` de sus clases responde que la academia no está
  disponible y su checkout rechaza nuevas compras

#### Scenario: suscripción restaura

- **WHEN** la academia sin acceso suscribe y el pago se liquida
- **THEN** su tier vuelve, reaparece en las superficies del dancer y
  sus clases vuelven a ser reservables

### Requirement: Corte unificado al terminar la suscripción

Cuando una `PlatformSubscription` queda `CANCELED` al fin del período
pagado (sin swap de plan pendiente ni reprice en curso), el sistema
SHALL limpiar la proyección de entitlements del actor:
`Academy.tier`/`Academy.billingCycle` a null y `Person.proTier` a
FREE, siempre que el actor no tenga otra suscripción viva. A partir de
ahí rige la misma postura que el trial vencido: academia con features
vacías y deslistada del dancer, productor sin features Pro. El corte
SHALL emitir un aviso al actor (`academy.access_ended` /
`producer.pro_access_ended`) que además alimenta su línea de vida en
admin. El despliegue SHALL incluir un backfill que limpie
entitlements de actores con suscripción ya CANCELED y ninguna viva.

#### Scenario: academia cancelada al fin de período

- **GIVEN** una academia STUDIO que canceló y su remota quedó
  CANCELED al fin del ciclo pagado
- **WHEN** corre el reconcile
- **THEN** `Academy.tier` queda null, su consola muestra solo
  Inicio/Suscripción/Perfil, desaparece del dancer y el owner recibe
  el aviso de acceso terminado

#### Scenario: productor churned pierde Pro

- **GIVEN** un productor PRO_GROWTH cuya suscripción quedó CANCELED
- **THEN** `proTier` vuelve a FREE y sus features Pro se apagan

#### Scenario: swap de plan no corta

- **WHEN** la remota queda CANCELED porque el sistema la canceló a
  fin de período para materializar un cambio de plan o reprice
- **THEN** el entitlement no se limpia (el swap lo re-proyecta)

### Requirement: Contacto Customer Experience en perfil

El perfil de personas con rol ACADEMY_OWNER o PRODUCER SHALL mostrar
una card con el nombre, email y teléfono de su contacto de Customer
Experience, resueltos desde los params `cx.contact.name`,
`cx.contact.email` y `cx.contact.phone`. Los demás roles no la ven.

#### Scenario: owner ve su contacto

- **WHEN** un owner de academia abre `/perfil`
- **THEN** ve la card "Customer Experience" con nombre, mailto y
  teléfono configurados en los params
