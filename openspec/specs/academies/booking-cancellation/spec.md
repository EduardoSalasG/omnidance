# academies/booking-cancellation Specification

## Purpose
La cancelación de una reserva por el alumno devuelve o pierde el crédito
según una ventana configurable antes del inicio de la clase; la cancelación
originada por la academia siempre devuelve.

## Requirements

### Requirement: Ventana de devolución configurable

El corte de devolución SHALL ser el `PlatformParam`
`classes.cancel_refund_minutes` (default 60, editable vía
`PUT /admin/params`), leído con `ParamsService` - nunca hardcodeado.

#### Scenario: Corte por defecto

- **WHEN** el param no existe en la base
- **THEN** el sistema opera con 60 minutos

### Requirement: Cancelación dentro de la ventana devuelve el crédito

`DELETE /classes/:id/book` SHALL marcar la reserva `CANCELLED` con
`cancelledAt=now` y `refunded=true` cuando `now ≤ inicioClase − cutoff`, y
la respuesta SHALL declarar `refunded:true`.

#### Scenario: Cancelar con más de una hora

- **WHEN** el alumno cancela una reserva BOOKED 2h antes del inicio
- **THEN** la reserva queda `CANCELLED` con `refunded=true`, el cupo se
  libera a la waitlist, y el crédito vuelve a estar disponible en la misma
  semana

### Requirement: Cancelación fuera de la ventana pierde el crédito

Pasado el corte, la cancelación SHALL seguir permitida pero con
`refunded=false` - el asiento se libera igual (la waitlist promueve) y la
respuesta declara `refunded:false`.

#### Scenario: Cancelar a última hora

- **WHEN** el alumno cancela 30 minutos antes del inicio
- **THEN** la reserva queda `CANCELLED` con `refunded=false`, el cupo se
  libera a la waitlist, y el crédito cuenta como consumido esa semana

### Requirement: Cancelación por la academia siempre devuelve

Cuando la academia cancela clases (desactivar serie, eliminar slot, o
cancelar una instancia), todas las reservas `BOOKED`/`WAITLIST` afectadas
SHALL quedar `CANCELLED` con `refunded=true` y `cancelledAt` registrado.

#### Scenario: Academia desactiva la serie

- **WHEN** se desactiva una serie con reservas en clases futuras
- **THEN** esas reservas quedan `CANCELLED` con `refunded=true` - ningún
  alumno pierde crédito por una decisión de la academia

### Requirement: UI declara la consecuencia antes de confirmar

El diálogo de cancelación de la ficha de clase SHALL mostrar copy distinto
según la posición respecto al corte: "recuperas tu clase" dentro de la
ventana, "pierdes la clase" fuera de ella; la confirmación SHALL reflejar
`refunded` en el aviso resultante.

#### Scenario: Sheet fuera de ventana

- **WHEN** el alumno abre la confirmación de cancelación a 30 minutos del
  inicio
- **THEN** el texto indica que cancelar libera el cupo pero la clase se
  considera usada
