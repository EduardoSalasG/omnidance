# Design: academy-level-line-consistency

## Decisiones

### Resolución de la línea efectiva (API)

Helper único en `classes.controller` (catalogs) y reutilizado por
`class-series.controller` (validación): `effectiveLevelIds(academyId)`
→ ids de la línea custom si existe, si no de la global. Misma regla
que `GET /academies/:id/class-levels` (`usingGlobal`).

- `GET /classes/catalogs?academyId=X`: levels = línea efectiva de X;
  `types` sigue siendo el catálogo global completo (los tipos no son
  por academia). Sin `academyId`: levels = solo global. La respuesta
  mantiene la forma `{levels, types}`; solo cambia el contenido de
  `levels`.
- El parámetro es de solo lectura y no exige capability de academia:
  los nombres de nivel ya eran públicos vía este mismo endpoint (sin
  filtro, antes del cambio). No hay regresión de exposición.
- Validación `levelId` en create/update de serie: 400 si el id no
  pertenece a la línea efectiva. Una serie legacy con nivel "fuera de
  línea" se corrige al primer PATCH (el form ya no ofrece esa opción;
  el select queda en "·" hasta elegir uno válido).

### Series eliminadas fuera de superficies

El borrado lógico del API ya pone `active:false` y cancela clases
futuras, pero la defensa es incompleta: filas borradas directo en
datos (seed, scripts, admin) pueden quedar `active:true` con clases
vivas. Se agrega `series: { deletedAt: null }` en:

- `classes.controller`: `browse`, `mine` (bookings activas; history
  se deja: la asistencia pasada sí ocurrió y es historial del alumno),
  `teaching`.
- `academies.controller`: próximas clases de `GET /:id` (hoy
  `active:true` sola), `GET /:id/slots`, `insights/levels` (slots +
  queries de clases) y el `classSlot.count` del dashboard.
- `insights/levels`: los queries de `classes`/`futureClasses` se
  acotan a slots de series vivas por consistencia (solo alimentan
  slots listados).

### Seed: dedupe de Mambo Madness

`mkClassSeries` resuelve `levelId` por línea efectiva
(`classLevel.findFirst({academyId, name})` ?? global). Antes de
materializar, el bloque Mambo hace una pasada de dedupe:

1. Trae todas las series de la academia (incl. borradas) con su score
   = asistencias + reservas + clases (vía `_count` de slots/classes o
   counts por slot).
2. Para cada entrada del target (`nombre|nivel`), elige entre las
   series no asignadas con ese `name` la de mayor score; la rebinds a
   la línea custom (`levelId` efectivo), `active:true`,
   `deletedAt:null`.
3. Slots dentro de la serie ganadora con mismo `weekday|startTime`
   duplicados: gana el de más data (mismo criterio), el resto se poda
   con su cascada (asistencias, reservas, clases, slotTypes, slot).
4. Perdedoras y series fuera de parrilla: soft-delete espejo del API
   (`active:false` + `deletedAt`) + clases futuras canceladas +
   reservas BOOKED/WAITLIST a CANCELLED refunded - así no reaparecen
   ni materializan.
5. `mmClass` corre después; `findFirst` en `ensure` se ordena
   `deletedAt` nulls-first para no resucitar perdedoras, y el update
   de `ensure` incluye `deletedAt:null` (resurrección explícita del
   keeper en corridas futuras).

Por qué soft-delete y no hard-delete de las perdedoras: es la
semántica del producto (la fila queda para analítica/auditoría) y su
historial ya alimenta asistencias legítimas; con los filtros de
`deletedAt` del punto anterior dejan de verse en todas las
superficies.

### Enrich

`levelId` por academia: para cada academyId, custom si existe si no
global (mapa por `(academyId, name)` con fallback global). Los
`EnrollmentLevel` que crea el script quedan siempre en la línea
efectiva del alumno.

## Riesgos

- Series legacy con nivel fuera de línea: al editarlas hay que elegir
  nivel válido (el select no precarga el inválido). Aceptable: fuerza
  la migración visible en vez de arrastrar el dato malo.
- `mine` pierde reservas de clases cuya serie fue borrada por datos
  (no por API): es lo deseado (la clase no se dictará), y el caso por
  API ya queda CANCELLED+refunded.
- El score del dedupe es heurístico (att+book+cls); la parrilla real
  sigue siendo la del target, el score solo decide qué fila física
  sobrevive.
