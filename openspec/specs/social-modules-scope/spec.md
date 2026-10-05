# social-modules-scope Specification

## Purpose
Alcance de los módulos sociales del bailarín: `/bailes` solo lista `DanceSession` (nacidas de escaneo QR; históricas INVITED como pendientes/expiradas descartables) — nunca disponibilidad ni solicitudes de pareja; `/practicas` es el hub de encontrar con quién.

## Requirements

### Requirement: Bailes muestra solo sesiones escaneadas

`/bailes` SHALL listar las `DanceSession` del usuario (creadas
exclusivamente por escaneo QR; las históricas INVITED aparecen como
pendientes/expiradas) con pareja, estilo, estado y rating — sin otras
secciones. MUST NOT renderizar disponibilidad ni solicitudes de pareja.

#### Scenario: Historial limpio

- WHEN un bailarín abre `/bailes`
- THEN ve solo su historial de bailes con pareja/estado/rating; no
  aparecen "Disponibles ahora" ni "Busco pareja"

### Requirement: Prácticas es el hub de encontrar con quién

`/practicas` SHALL mostrar el listado de prácticas con filtro Todas/Mías (nombre, venue, fecha, precio si aplica) y el formulario para crear una práctica.

#### Scenario: Prácticas listado y creación

- WHEN un bailarín abre `/practicas`
- THEN ve el listado de prácticas filtrable y puede crear una
