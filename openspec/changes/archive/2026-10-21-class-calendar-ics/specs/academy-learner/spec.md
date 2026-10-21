# Delta: Calendario del alumno tras reservar clase

## ADDED Requirements

### Requirement: Descarga .ics de una clase reservada

El sistema SHALL exponer `GET /classes/:id/calendar.ics` (sesión
requerida) que emite un archivo `text/calendar` válido RFC 5545 con los
datos de la clase: título (nombre de la clase + academia), inicio y fin
en la zona horaria de la ciudad de la academia (`TZID`), ubicación (sede
y dirección), descripción (academia, instructor, nivel/estilo, enlace a
la ficha), `UID` estable `class-<id>@omnidance` y un `VALARM` de
recordatorio 60 minutos antes. Clase inexistente SHALL responder 404.

#### Scenario: alumno descarga el .ics de su clase

- **WHEN** un usuario autenticado pide `GET /classes/:id/calendar.ics`
- **THEN** recibe `text/calendar` con `DTSTART;TZID=America/Santiago`,
  `DTEND`, `SUMMARY` con el nombre de la clase y la academia, `LOCATION`
  con la sede, `DESCRIPTION` con academia/instructor, `UID`
  `class-<id>@omnidance` y `VALARM -PT60M`

#### Scenario: clase inexistente

- **WHEN** se pide el `.ics` de un id que no existe
- **THEN** el API responde 404

### Requirement: Botón "Agregar a mi calendario" post-reserva

La ficha de clase SHALL mostrar el botón "Agregar a mi calendario" solo
cuando el viewer tiene asiento propio (`BOOKED`): tras reservar con
éxito y al cargar una ficha ya reservada. En `WAITLIST`, sin reserva o
con una compra por gateway pendiente, el botón SHALL NOT aparecer.

#### Scenario: reserva exitosa muestra el botón

- **WHEN** `book()` resuelve `BOOKED`
- **THEN** aparece el enlace "Agregar a mi calendario" (descarga el
  `.ics` del endpoint) junto al aviso de reserva, con hit area ≥44px
