# Delta: notifications/push-copy

## ADDED Requirements

### Requirement: Copy de aviso de venta al productor

La notificación `ticket.sale` SHALL usar title `Nueva venta` y body
`${comprador} · ${cantidad} entrada(s) · ${evento} · ${monto CLP}` -
title de outcome corto y body con los hechos separados por ` · `, en la
misma convención del resto de notificaciones transaccionales.

#### Scenario: venta confirmada

- **WHEN** se liquida una orden de tickets de un evento con productor
- **THEN** el productor recibe `ticket.sale` con title `Nueva venta` y
  el body con comprador, cantidad, evento y monto
