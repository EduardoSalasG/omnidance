# Delta: Cuota semanal visible en Inicio

## ADDED Requirements

### Requirement: Resumen de cuota de clases del viewer

El API SHALL exponer `GET /classes/my-quota` (sesión) que devuelve, por
cada inscripción reservable del viewer, la cuota vigente: academia,
tipo (semanal/pack/ilimitado), clases consumidas y límite — la misma
conteo que rige la reserva (BOOKED + cancelaciones tardías, excluyendo
asientos pagados).

#### Scenario: alumno con plan semanal

- **WHEN** un alumno con inscripción semanal pide `/classes/my-quota`
- **THEN** recibe la entrada de su academia con `kind:"WEEKLY"`, `used`
  de la semana ISO actual y `limit` del plan

### Requirement: Widget de cuota en la home del bailarín

La home SHALL mostrar, por cada inscripción del viewer, el consumo de
cuota con CTA a agendar, con copy adaptado a: sin reservas, parcial,
completa, plan de una clase, pack e ilimitado. Viewer sin inscripciones
SHALL NOT ver el widget.

#### Scenario: consumo parcial

- **WHEN** el alumno agendó 2 de 3 clases semanales
- **THEN** la home muestra "Has agendado 2 de tus 3 clases semanales"
  y un CTA "Agendar" que lleva a sus clases
