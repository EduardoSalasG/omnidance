# academy-analitica-drop-class

## Why

El select de clase en `attendance` era redundante: horario + rango de
fechas ya cubren la misma selección (la clase del martes X = horario
martes + fecha X) y la lista de ocurrencias era pesada. Decisión del
usuario en el review manual.

## What Changes

- El filtro `classId` y la fuente `academyClasses` se retiran de la
  entidad `attendance` y del catálogo.
- Cascada final: nivel → serie → horario, con instructor acotado por
  serie y horario.
