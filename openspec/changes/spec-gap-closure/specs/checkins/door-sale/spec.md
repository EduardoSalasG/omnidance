# door-sale

## Purpose

Venta en puerta por staff: todos entran con cuenta — si la persona no tiene, el staff crea una cuenta ligera (nombre + teléfono → QR al instante), registra la venta cash o marca la compra por app, y hace el check-in en un solo flujo auditado (spec §10 Caso B, "todos entran con cuenta").

## ADDED Requirements

### Requirement: Registrar venta en puerta

El sistema SHALL permitir a staff con permiso `checkins.write` en el evento registrar una venta de puerta: crea la cuenta ligera si la persona no existe, emite el ticket (con cargo según canal) y hace el check-in — atómicamente.

#### Scenario: cuenta ligera + venta cash

- **WHEN** staff envía `POST /checkins/door-sale` con `name`, `phone`, `eventId` y `channel: CASH`
- **THEN** el sistema crea la Person (cuenta ligera sin email), el Ticket con `service_fee.door_cash_clp`, y el Checkin — respondiendo el QR/identidad de la persona

#### Scenario: venta por app/QR en puerta

- **WHEN** el canal es `APP`
- **THEN** el ticket lleva `service_fee.door_app_clp` como cargo de servicio

#### Scenario: persona ya existe

- **WHEN** el teléfono (o identificador) corresponde a una persona existente
- **THEN** se reutiliza su cuenta — nunca se duplica la Person

#### Scenario: staff sin asignación al evento

- **WHEN** staff sin `StaffAssignment` en el evento (y sin ser admin/productor del evento) intenta registrar
- **THEN** el sistema responde 403

### Requirement: Trazabilidad y capacidad

La venta de puerta SHALL respetar `doorCap` del evento cuando esté definido y SHALL quedar auditada (staffId en el check-in, método MANUAL).

#### Scenario: aforo de puerta agotado

- **WHEN** las ventas de puerta ya alcanzan `doorCap`
- **THEN** el sistema responde 409 "agotado"

#### Scenario: auditoría

- **WHEN** se completa una venta en puerta
- **THEN** el check-in registra `staffId` del operador y `method: MANUAL`; el ticket registra el precio de puerta del evento
