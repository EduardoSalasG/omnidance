# Capability: checkout/ticket-purchase (delta)

## Purpose

Extensión de la compra de preventa: el comprador elige la cantidad de entradas (1–10), asigna amigos dentro de esa cantidad y el resto quedan reclamables por link. Mantiene las validaciones existentes (evento PUBLISHED con preventa, cap, corte 19:00, descuento una vez por orden).

## ADDED Requirements

### Requirement: selector de cantidad
El checkout SHALL aceptar `quantity` entero 1–10 (default 1). El UI muestra un stepper "¿Cuántas entradas?" y el breakdown multiplica precio y cargo por la cantidad (el descuento sigue aplicando una vez por orden).

#### Scenario: compra de 3 entradas sin asignar
- **WHEN** el comprador selecciona quantity=3 sin amigos marcados y confirma
- **THEN** el POST envía `{eventId, quantity: 3}`, la orden cobra `3 × (precio + cargo)` y `Payment.quantity = 3`

#### Scenario: cantidad fuera de rango
- **WHEN** el POST trae quantity <1, >10 o no entero
- **THEN** 400 por validación del DTO

### Requirement: asignación dentro de la cantidad
`recipientIds` (amigos) SHALL validarse contra la cantidad: máximo `quantity - 1` destinatarios. Se mantienen las validaciones existentes (existen, amistad ACCEPTED, sin entrada ACTIVE). Las entradas sobrantes quedan reclamables (ver `tickets/claim-links`).

#### Scenario: más amigos que entradas extra
- **WHEN** quantity=2 y recipientIds tiene 3 ids
- **THEN** 400 — "elegiste más amigos que entradas disponibles"

#### Scenario: cap con cantidad
- **WHEN** vendidos + en vuelo + quantity > presaleCap
- **THEN** PresaleSoldOutError (409)

### Requirement: éxito muestra links de reclamo
Cuando el pago queda PAID y la orden tiene entradas sin asignar, la pantalla de éxito SHALL listar un link de reclamo por cada una con botón de compartir (WhatsApp).

#### Scenario: éxito con 2 entradas sin asignar
- **WHEN** el polling confirma PAID de una orden con 2 tickets reclamables
- **THEN** la pantalla muestra "Entradas para compartir" con 2 links `/reclamar/{token}` y botón "Enviar por WhatsApp" en cada uno
