# social-modules-scope

## Purpose

Cada módulo social del bailarín responde una sola pregunta: `/bailes` = qué bailé y con quién (historial de sesiones escaneadas), `/practicas` = dónde practicar y con quién (listado y creación de prácticas).

## ADDED Requirements

### Requirement: Bailes muestra solo sesiones escaneadas

`/bailes` SHALL listar las `DanceSession` del usuario (escaneadas por QR o retro-declaradas) con pareja, estilo, estado y rating — sin otras secciones. MUST NOT renderizar disponibilidad ni solicitudes de pareja.

#### Scenario: Historial limpio

- WHEN un bailarín abre `/bailes`
- THEN ve solo su historial de bailes con pareja/estilo/rating; no aparecen "Disponibles ahora" ni "Busco pareja"

### Requirement: Prácticas es el hub de encontrar con quién

`/practicas` SHALL mostrar el listado de prácticas con filtro Todas/Mías (nombre, venue, fecha, precio si aplica) y el formulario para crear una práctica.

#### Scenario: Prácticas listado y creación

- WHEN un bailarín abre `/practicas`
- THEN ve el listado de prácticas filtrable y puede crear una

## REMOVED Requirements

### Requirement: Disponibilidad y solicitudes de pareja en Bailes

**Reason**: son funciones de práctica/coordinación, no de historial — mezclarlas confundía el propósito del módulo.
**Migration**: los endpoints `/api/availability` y `/api/partner-requests` quedan vivos como superficie de API sin UI que los consuma — la re-incorporación a `/practicas` es un change aparte.
