# Delta: academies/owner-insights

## ADDED Requirements

### Requirement: Agenda legible con clases traslapadas

En la agenda semanal de "Niveles y cupos", los horarios traslapados
de un mismo día SHALL repartirse el ancho en carriles con una card
densa (hora de inicio-término, nombre truncado y estado del cupo):
las métricas de género y el chip de nivel no caben en medio carril y
quedan fuera de la variante densa (el nivel viaja en `title`/aria).
En mobile, cada fila SHALL mostrar hora de inicio Y de término del
horario.

#### Scenario: dos clases a la misma hora un martes

- **GIVEN** dos slots que se traslapan el martes
- **WHEN** se renderiza la agenda en desktop
- **THEN** cada carril muestra la card densa legible (hora + nombre +
  estado) en vez de la card completa aplastada

#### Scenario: fila de mobile

- **GIVEN** la vista mobile de la agenda
- **WHEN** un día tiene una clase 19:00-20:30
- **THEN** su etiqueta muestra "19:00" y "20:30" (endTime ausente =
  +1h, misma convención del endpoint)
