# social-modules-scope Specification

## Purpose
TBD - created by archiving change seed-live-sessions. Update Purpose after archive.

## Requirements

### Requirement: Invitaciones de baile solo sobre eventos en curso

`/bailes` SHALL mostrar invitaciones `INVITED` solo cuando exista un evento LIVE ocurriendo ahora — la invitación nace del escaneo en pista, no puede existir sobre eventos futuros ni pasados sin resolver.

#### Scenario: Seed con noche en vivo

- WHEN el seed corre y existe un evento LIVE esta noche
- THEN las invitaciones demo quedan ancladas a ese evento con scannedAt reciente

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
