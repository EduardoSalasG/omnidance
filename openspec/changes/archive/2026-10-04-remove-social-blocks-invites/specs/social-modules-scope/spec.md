# social-modules-scope — deltas

## REMOVED Requirements

### Requirement: Invitaciones de baile solo sobre eventos en curso

**Reason**: el ciclo de invitaciones se eliminó — ya no se crean
`DanceSession` INVITED (ni por escaneo ni por declaración). Las
históricas INVITED se conservan como dato.

#### Scenario: removed

- **WHEN** la feature se elimina del código
- **THEN** `/bailes` no muestra invitaciones nuevas; las históricas
  INVITED quedan como pendientes/expiradas descartables.

## MODIFIED Requirements

### Requirement: Bailes muestra solo sesiones escaneadas

`/bailes` SHALL listar las `DanceSession` del usuario (creadas
exclusivamente por escaneo QR; las históricas INVITED aparecen como
pendientes/expiradas) con pareja, estilo, estado y rating — sin otras
secciones. MUST NOT renderizar disponibilidad ni solicitudes de pareja.

#### Scenario: Historial limpio

- WHEN un bailarín abre `/bailes`
- THEN ve solo su historial de bailes con pareja/estado/rating; no
  aparecen "Disponibles ahora" ni "Busco pareja"
