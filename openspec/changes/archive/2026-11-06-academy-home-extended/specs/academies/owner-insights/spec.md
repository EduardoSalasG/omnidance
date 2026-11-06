# Delta; academies/owner-insights (academy-home-extended)

## REMOVED Requirements

### Requirement: Modo de inicio Simplificado por defecto

**Reason**: la revisión UX 2026-11-05 eliminó el modo Simplificado; el
inicio del owner muestra siempre la vista extendida y el toggle era una
decisión sin valor que ocultaba métricas accionables.
**Migration**: el inicio renderiza directamente la vista extendida; la
preferencia persistida en localStorage deja de leerse y el modo simple
muere sin reemplazo.

## MODIFIED Requirements

### Requirement: Card de alumnos por nivel y cupos por horario

El inicio de /academia SHALL mostrar una card con alumnos activos por
tipo×nivel y, por cada horario **de una serie vigente**
(`series.deletedAt: null`), alumnos asignables, capacidad, cupos
vacíos, promedio de asistencia y asistencia de la última clase. Los
horarios de series eliminadas lógicamente MUST NOT aparecer en la card
ni alimentar sus métricas. Alumnos sin nivel asignado SHALL agruparse
en "sin nivel" para que el owner complete el dato.

#### Scenario: Owner elige horario para alumno nuevo

- **WHEN** el owner abre el inicio
- **THEN** ve por cada horario cuántos cupos vacíos quedan por nivel y
  puede decidir a cuál derivar al alumno sin saturar

#### Scenario: Horario de serie eliminada no cuenta

- **GIVEN** una serie eliminada lógicamente cuyos slots siguen en la
  base (borrado directo en datos)
- **WHEN** el owner abre "Niveles y cupos"
- **THEN** esos slots no aparecen y sus clases no entran a los
  promedios ni a "próxima clase"

## ADDED Requirements

### Requirement: Inicio del owner en vista única extendida

El inicio del owner SHALL renderizar siempre la vista extendida: KPIs
del mes (alumnos activos, operativos por tier, facturado y ticket por
alumno), operación del día y niveles y cupos. MUST NOT existir
selector de vista ni persistencia de modo por dispositivo.

En desktop (`sm` y mayor) los KPIs de facturación (facturado del mes,
ticket por alumno) SHALL compartir la misma grilla que los KPIs del
resumen, sin sección ni landmark propio; en mobile el orden visual
queda igual (apilado). Los títulos de las cards de cola SHALL
envolver en vez de truncarse con elipsis, de modo que labels como
"Cobros por revisar" y "Planes que vencen esta semana" se lean
completos.

#### Scenario: owner abre su inicio

- **WHEN** el owner entra a `/inicio` con lente ACADEMY_OWNER
- **THEN** ve la vista extendida completa sin toggle de modo, con los
  KPIs de facturación en la misma fila del resumen en desktop

#### Scenario: títulos de colas legibles

- **GIVEN** una academia con colas pendientes
- **WHEN** se renderizan las MiniKpi de "Cobros por revisar" y "Planes
  que vencen esta semana" en mobile o desktop
- **THEN** el título se lee completo, sin elipsis
