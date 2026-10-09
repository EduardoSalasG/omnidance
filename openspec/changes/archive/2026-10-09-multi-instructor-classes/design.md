# Design: multi-instructor por clase

## Context

`ClassSeries.instructorId`, `ClassSlot.instructorId` y
`Class.instructorId` modelan un único profesor. ~24 archivos consumen
`instructorId` (materialización, consola instructor, comisiones,
encuestas, liquidación, claims). Un cambio destructivo (reemplazar el
campo por join table) tocaría todo el árbol.

## Decisión: join tables aditivas + primario conservado

- `ClassSlotInstructor { slotId, personId }` — plantel del horario.
- `ClassInstructor { classId, personId }` — plantel materializado.
- `instructorId` se mantiene como **instructor principal**: escritura
  única por las rutas actuales, y las lecturas de semántica singular
  (comisión `payType`, encuesta mensual `instructorId`, liquidación)
  no cambian.

Convención: el primario siempre está también en el join (el join es el
conjunto completo, incluido el principal) — así las lecturas del
plantel no necesitan unir `instructorId` + join.

## Puntos de integración

1. **Migración + backfill**: por cada `ClassSlot.instructorId` /
   `Class.instructorId` no nulo se inserta su fila join (idempotente:
   `ON CONFLICT DO NOTHING` sobre `@@id` compuesta).
2. **Materialize service**: al crear `Class` desde slot, copia
   `slot.instructors → class.instructors` (además de `instructorId`).
3. **classes.controller "mis clases"**: el OR actual suma
   `{ instructors: { some: { personId: me } } }` y
   `{ slot: { instructors: { some: { personId: me } } } }`.
4. **class-card-projection**: `instructor` singular se conserva y se
   agrega `instructors: [{id,name}]` (primario primero) — la web
   muestra "María, Eduardo" donde hoy muestra un nombre.
5. **Series detalle**: expone la lista de instructores del slot/serie.

## Seed (piloto)

- Eduardo Salas `salas.eduardo.cl@gmail.com`, +56982439041, M:
  DANCER+INSTRUCTOR, estilos Mambo on2 LEADER intermedio y Bachata
  sensual LEADER intermedio, cuenta reclamable por magic link (mismo
  mecanismo que Gabriel/Mónica).
- MM: instructor del plantel (`AcademyInstructor`), co-instructor de
  los slots sábado 17:00 (Salsa) y 18:00 (Bachata) — `instructorId`
  queda María, Eduardo entra vía `ClassSlotInstructor`; alumno del plan
  Ilimitado con asistencias.
- Social: clique, entradas, sesiones, badges como el resto del piloto.

## Riesgos

- **Doble conteo en lecturas singulares**: mitigado por decisión — el
  join incluye al primario; las lecturas nuevas usan solo el join.
- **Drift slot↔clase**: si se edita el plantel del slot, las clases ya
  materializadas no se re-sincronizan en este cambio (igual que hoy
  con `instructorId` — la instancia es snapshot). Documentado como
  comportamiento aceptado; un sync es trabajo futuro si se pide.
- **UI con un solo nombre**: los puntos que renderizan `instructor`
  muestran el primario hasta actualizar la vista — se actualizan los
  de clase/detalle en este cambio.
