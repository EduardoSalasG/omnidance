# notifications/push-copy Specification

## Purpose
TBD - created by archiving change push-copy-precision. Update Purpose after archive.

## Requirements

### Requirement: Títulos de notificación concisos

El sistema SHALL emitir `title` como frase de outcome corta - sin prefijos
de categoría ("Pago confirmado -"), sin punto final, y que comunique el
estado en ~40 chars o menos tras interpolar valores típicos.

#### Scenario: confirmación de pago

- **WHEN** se liquida un pago PAID de ticket
- **THEN** el `title` de la notificación es `Ticket listo` - no
  `Pago confirmado - tu ticket está listo`

#### Scenario: outcome sin boilerplate

- **WHEN** se emiten notificaciones de compra de clase suelta
- **THEN** los titles son `Cupo reservado` (BOOKED) o `En lista de espera`
  (WAITLIST), nunca con prefijo `Pago confirmado -`

### Requirement: Body = hechos clave

El `body` SHALL contener solo los hechos variables que desambigúan la
notificación (nombre del objeto, monto, fecha) separados por ` · `, con la
acción pendiente al final tras `-` cuando exista. Sin oraciones que
repitan el title.

#### Scenario: pago con contexto

- **WHEN** se confirma la compra de un plan
- **THEN** el body es `${plan.name} · ${academy.name} · ${clp}`

#### Scenario: acción pendiente

- **WHEN** el owner recibe `academy.private_lesson.sold`
- **THEN** el body termina con `- asigna fecha e instructor`

### Requirement: Copy verbatim por tipo

Los literales `title`/`body` SHALL coincidir con la tabla de
`design.md` "Tabla verbatim" para los tipos cubiertos; los `type`,
`category` y `data` no cambian.

#### Scenario: suscripción fallida

- **WHEN** Flow reporta mora en una suscripción
- **THEN** el title es `Cobro fallido` y el body
  `${plan.name} · ${academy.name} - reintentaremos; revisa tu tarjeta`

### Requirement: Copy de aviso de venta al productor

La notificación `ticket.sale` SHALL usar title `Nueva venta` y body
`${comprador} · ${cantidad} entrada(s) · ${evento} · ${monto CLP}` -
title de outcome corto y body con los hechos separados por ` · `, en la
misma convención del resto de notificaciones transaccionales.

#### Scenario: venta confirmada

- **WHEN** se liquida una orden de tickets de un evento con productor
- **THEN** el productor recibe `ticket.sale` con title `Nueva venta` y
  el body con comprador, cantidad, evento y monto
