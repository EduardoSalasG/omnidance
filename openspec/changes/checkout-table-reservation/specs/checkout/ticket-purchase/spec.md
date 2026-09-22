# checkout/ticket-purchase (delta)

## Purpose

Agrega la reserva de mesa opcional a la compra de entradas (spec §13). La
intención viaja en la orden y se materializa como `TableReservation`
`REQUESTED` solo cuando el pago queda `PAID`.

## ADDED Requirements

### Requirement: reserva de mesa en la orden

`POST /checkout/ticket` SHALL aceptar `tablePartySize` opcional (entero
positivo) solo cuando el evento tiene `tablesTotal`. El servicio SHALL
rechazar `tablePartySize > event.tableSeatMax` (400, "máximo N personas
por mesa") y, cuando `tableSeatsTotal` está configurado, `tablePartySize >
seatsLeft` (409, sin cupo sentable). Se persiste en
`Payment.tablePartySize`; al PAID el webhook SHALL crear la
`TableReservation` en `REQUESTED` — nunca para pagos FAILED/abandonados —
salvo que la persona ya tenga una activa en el evento.

#### Scenario: compra con mesa

- **WHEN** el comprador marca "quiero mesa" para 6 personas y paga
- **THEN** el POST envía `tablePartySize: 6`, `Payment.tablePartySize = 6`
  y el webhook crea la reserva `REQUESTED` del comprador para el evento

#### Scenario: pago fallido no reserva

- **WHEN** el pago de una orden con `tablePartySize` queda FAILED o
  abandonado
- **THEN** no existe TableReservation asociada

#### Scenario: evento sin mesas

- **WHEN** el POST trae `tablePartySize` para un evento sin `tablesTotal`
- **THEN** el campo se ignora (la compra sigue igual)

#### Scenario: sobre el tope por mesa

- **WHEN** el evento tiene `tableSeatMax: 6` y el POST pide
  `tablePartySize: 7`
- **THEN** responde 400 con "máximo 6 personas por mesa"

#### Scenario: sin cupo sentable

- **WHEN** `seatsLeft` del evento es 4 y el POST pide `tablePartySize: 5`
- **THEN** responde 409 — el cap real es el cupo sentable, no las mesas

### Requirement: sección mesa en el checkout

El checkout SHALL mostrar la sección según el detalle del evento: oculta si
no hay servicio (`tablesTotal` null), "Sin mesas disponibles para reserva"
si `tablesLeft ≤ 0` o `seatsLeft ≤ 0`, y si hay disponibilidad una pregunta
Sí/No que al Sí pide la cantidad de personas — stepper acotado por
`min(tableSeatMax, seatsLeft)` — mostrando que la disponibilidad es
referencial y el tamaño podría ajustarse al confirmar el productor.

#### Scenario: sin disponibilidad

- **WHEN** `tablesLeft = 0` o `seatsLeft = 0`
- **THEN** la sección muestra "Sin mesas disponibles para reserva" y no se
  puede pedir mesa

#### Scenario: disclaimer visible

- **WHEN** el comprador marca Sí
- **THEN** ve el stepper de personas y el aviso de disponibilidad
  referencial / tamaño ajustable
