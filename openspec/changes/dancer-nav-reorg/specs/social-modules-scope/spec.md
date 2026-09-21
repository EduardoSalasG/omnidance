# social-modules-scope

## Purpose

Cada módulo social del bailarín responde una sola pregunta: `/bailes` = qué bailé y con quién (historial de sesiones escaneadas), `/practicas` = dónde practicar y con quién (prácticas + disponibilidad + búsqueda de pareja), `/viajes` = viajes a eventos fuera de la ciudad.

## ADDED Requirements

### Requirement: Bailes muestra solo sesiones escaneadas

`/bailes` SHALL listar las `DanceSession` del usuario (escaneadas por QR o retro-declaradas) con pareja, estilo, estado y rating — sin otras secciones. MUST NOT renderizar disponibilidad ni solicitudes de pareja.

#### Scenario: Historial limpio

- WHEN un bailarín abre `/bailes`
- THEN ve solo su historial de bailes con pareja/estilo/rating; no aparecen "Disponibles ahora" ni "Busco pareja"

### Requirement: Prácticas es el hub de encontrar con quién

`/practicas` SHALL mostrar el listado de prácticas disponibles (nombre, venue, fecha, precio si aplica), el formulario para crear una práctica, la sección "Disponibles ahora" (personas que declararon disponibilidad) y "Busco pareja" (solicitudes de pareja de baile).

#### Scenario: Prácticas con disponibilidad y parejas

- WHEN un bailarín abre `/practicas`
- THEN ve el listado de prácticas, puede crear una, y ve las secciones "Disponibles ahora" y "Busco pareja"

### Requirement: Viajes sin cambios funcionales

`/viajes` SHALL seguir mostrando mis viajes publicados y los matches (`TripMatches`) — queda como listado tipo nomadtable de viajes a eventos.

#### Scenario: Viajes listado y matches

- WHEN un bailarín abre `/viajes`
- THEN ve sus viajes y los viajes compatibles de otros usuarios

## REMOVED Requirements

### Requirement: Disponibilidad y solicitudes de pareja en Bailes

**Reason**: son funciones de práctica/coordinación, no de historial — mezclarlas confundía el propósito del módulo.
**Migration**: ambas secciones se trasladan a `/practicas` sin cambio de comportamiento ni endpoints.
