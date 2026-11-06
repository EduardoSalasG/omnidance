# Proposal: academy-schedule-ux

## Why

Triage UX de la consola del owner (`docs/academy-console-ux-review-2026-11-05.md`,
Slice E): el formulario de horarios de serie quiebra la fila día/horas,
la ficha de clase navega a la edición del horario por un gesto poco
obvio, las listas pesadas no comparten un criterio de paginación, el
módulo de particulares parpadea al filtrar y ordena antiguo primero,
la agenda "Niveles y cupos" se aplasta con 2+ clases traslapadas, y el
filtro de estilos del listado de series ofrece el catálogo global con
opciones sin series (vacíos garantizados). Además, por decisión del
usuario, los estilos "Cubano" y "Rueda de casino" salen del catálogo
(dev y prod).

## What Changes

- **`series/nueva`**: la fila de cada horario mantiene Día + Inicio +
  Término (+ X) juntos; en pantallas angostas el día sube a su línea y
  los dos tiempos comparten la de abajo. Espacio visible entre los
  legends "Tipos de clase"/"Horarios semanales" y sus opciones.
- **Ficha `/academia/clases/[id]`**: el header de la clase queda texto
  plano (la edición del horario se entra solo desde la ficha de la
  serie). Reservados y lista de espera se paginan 20/10 client-side.
- **Paginación de listas pesadas**: hook compartido
  `useConsolePageSize` (lib, `useSyncExternalStore` + `matchMedia`
  lg=1024px) que resuelve 20 en desktop y 10 en mobile; aplicado en
  roster de clase, particulares (pageSize server-side) y próximas
  clases de la ficha de profesor.
- **Particulares**: `GET /academies/:id/private-lessons` ordena
  `scheduledAt desc` (+ `createdAt desc` de desempate; las sin agendar
  flotan arriba como cola accionable). La lista conserva los datos
  previos durante el refetch (sin skeleton flash) y los KPIs de cola
  no se desmontan. "Cancelar" se mueve a la esquina superior derecha
  junto al precio; la card prioriza estado + alumno.
- **Equipo / ficha profesor**: próximas clases paginadas 20/10, filas
  apiladas en mobile (nombre completo arriba, meta debajo) y KPIs en
  una columna en mobile.
- **Calendario del inicio**: slots traslapados (2+ carriles en un día)
  usan una variante densa (hora + nombre truncado + estado) en vez de
  la card completa; en mobile cada fila muestra hora de inicio Y
  término.
- **Series (filtro)**: nuevo `GET /academies/:id/series/styles` que
  devuelve solo los estilos presentes en las series de la academia; el
  select de `styleId` deja de usar el catálogo global `/styles`.
- **Catálogo de estilos**: `STYLE_CATALOG` pierde "Cubano" y
  "Rueda de casino"; ambos entran a `REMOVED_STYLES` del seed (las
  referencias estructurales quedan desvinculadas a `null`, las
  personales se eliminan: mismo mecanismo de depuración ya existente).
  `seed-dev.ts` re-etiqueta las series/roles/sesiones afectadas a
  "Salsa cubana (casino)" y `enrich-academy-seed.cjs` desvincula
  `danceSession.styleId` antes de borrar estilos fixture (FK).

## Impact

- Specs: `academies/class-series`, `academies/private-lesson-product`,
  `academies/owner-insights`, `academies/console-lists`.
- API: `GET /academies/:id/series/styles` nuevo; orden del listado de
  particulares cambia a `scheduledAt desc`.
- Datos: re-correr `pnpm db:seed` depura las filas "Cubano"/"Rueda de
  casino" de la tabla Style en cualquier DB (dev y prod): las series y
  bloques que los usaban quedan `styleId=null` (conservan su nombre) y
  los PersonStyleRole/sesiones con esos estilos se eliminan/
  desvinculan. No se renombra al estilo más cercano: se sigue el
  precedente de depuración ya existente en seed-common.
- Web: sin cambios de contrato en `shared`; hook nuevo en lib.
