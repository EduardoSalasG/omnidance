# Multi-instructor por clase

## Why

La realidad de las academias: una clase puede ser dictada por más de un
profesor (co-teaching, dupla titular+apoyo). El modelo actual tiene un
solo `instructorId` por `ClassSeries`, `ClassSlot` y `Class`, así que
no se puede expresar "María y Eduardo dictan juntos el sábado" — caso
real del piloto (Mambo Madness).

## What Changes

- **Nuevo**: `ClassSlotInstructor` y `ClassInstructor` (tablas join)
  modelan el plantel completo de profesores por horario y por clase
  materializada. `instructorId` existente se conserva como instructor
  "principal" — las lecturas de un solo profesor (comisión, encuesta
  mensual, liquidación) no cambian de semántica.
- **Materialización**: al crear clases desde un slot se copia además el
  plantel completo (slot → clase).
- **Lecturas**: la consola del instructor ("mis clases") resuelve también
  por co-instructor; el detalle de clase/serie expone la lista completa
  de profesores.
- **Web**: las cards/detalle de clase muestran los nombres de todos los
  instructores.
- **Seed**: Eduardo Salas (cuenta real `salas.eduardo.cl@gmail.com`)
  queda co-instructor de las clases de sábado de Mambo Madness junto a
  María, alumno Ilimitado y con perfil social enriquecido.

## Impact

- Affected specs: `academies/class-series` (nuevo requirement de plantel
  multi-profesor).
- Affected code: `schema.prisma` (+migración con backfill), materialize
  service, classes.controller (filtro "mis clases"), proyección de
  cards (lista de instructores), seed.
- Backward compatible: `instructorId` sigue existiendo y siendo el
  primario; consumidores de un solo profesor no se tocan.
