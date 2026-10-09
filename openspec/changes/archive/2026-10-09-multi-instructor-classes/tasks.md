# Tasks

- [x] Schema: modelos `ClassSlotInstructor` y `ClassInstructor` (@@id compuesta, FK cascade) + relaciones en ClassSlot/Class/Person; `pnpm db:migrate` con backfill desde `instructorId` no nulo.
- [x] Materialize service: copiar plantel del slot a las clases creadas (`slot.instructors → class.instructors`).
- [x] classes.controller: "mis clases" del instructor resuelve también por `instructors.some.personId` (clase y slot).
- [x] class-card-projection / detalle: exponer `instructors[]` (primario primero) además de `instructor`.
- [x] Web: cards/detalle de clase y vista de serie muestran la lista de instructores (join de nombres).
- [x] Seed: Eduardo Salas (persona real, DANCER+INSTRUCTOR, estilos, teléfono) + plantel MM + co-instructor sábado + Ilimitado + social (clique/entradas/sesiones/badges).
- [x] Verificación: tsc api+web, specs academies, migración aplicada local, seed corre idempotente.
