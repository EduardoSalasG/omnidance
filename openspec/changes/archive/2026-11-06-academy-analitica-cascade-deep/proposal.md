# academy-analitica-cascade-deep

## Why

La cascada de `academy-analitica-cascade` solo respetaba el padre
directo: elegir Nivel sin Serie no acotaba Horario ni Clase. El
usuario espera filtrado acumulativo en toda la cadena.

## What Changes

- `dependsOn` acumulativo: slotId ← [levelId, seriesId]; classId e
  instructorId ← [levelId, seriesId, slotId].
- Resolvers aplican todos los deps recibidos: slots por nivel y serie,
  clases por nivel/serie/slot, instructor por serie además de por slot.
