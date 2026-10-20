# Proposal — dance-levels-catalog

## Qué

Alinear el nivel autodeclarado de baile (`PersonStyleRole.level`) con el
catálogo pedagógico usado por las academias (`ClassLevel`):
**Iniciación | Básico | Intermedio | Avanzado**.

Hoy el set aceptado es `principiante | intermedio | avanzado` — falta un
nivel y los nombres no coinciden con la escala de clases del producto.

## Por qué

- El usuario pidió explícitamente estos 4 niveles en "Tu baile"
  (`/perfil/datos`) — es la nomenclatura que usan las academias SBK.
- Datos existentes: migración `principiante → basico` (equivalente
  semántico más cercano).

## Alcance

- `DANCE_LEVELS` en API (`people.controller.ts`) y front
  (`/perfil/datos`, `/bienvenida`) → `iniciacion, basico, intermedio, avanzado`.
- i18n `profile.datos.level` en 4 locales.
- Migración de datos `PersonStyleRole.level` (UPDATE, sin DDL).
- Seed dev: `principiante → iniciacion` (semillas de nivel bajo).
- `LEVEL_ORDER` del front agrega `basico` (barras visuales por nivel).

## Fuera de alcance

Cambio de copy cosmético sin delta de comportamiento (mismo change de
despliegue, sin spec): email post-registro ahora dice "Verifica tu
correo" en vez de "Tu acceso" y el check `actorData` del
`PendingRoleCard` muestra nombre por rol ("Nombre de academia").
