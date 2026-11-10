# Delta: academies/bulk-import (academy-invite-first-polish)

## ADDED Requirements

### Requirement: Valores aceptados por columna

La página `/academia/configuracion/importar` SHALL mostrar, antes del
enlace de descarga de plantilla y por cada clase de importación, una
muestra de los valores aceptados por las columnas con formato
restringido: `sexo` (m/f/otro), `fecha_nacimiento` (DD/MM/YYYY),
`telefono` (normalizado al país de la academia), `dia_semana`
(nombres en español o 0-6 con domingo = 0), `hora_inicio`/`hora_fin`
(HH:MM), `capacidad` (entero), `estilo`/`nivel` (nombres existentes
en la consola, match insensible a acentos/mayúsculas),
`instructor_email` (instructor de la academia) y `mes` (YYYY-MM).

#### Scenario: staff lee los valores antes de descargar

- **WHEN** el staff abre la card de importación de alumnos o de
  horario
- **THEN** junto a los nombres de columnas ve los valores/formatos
  aceptados por cada columna restringida, antes de "Descargar
  plantilla"
